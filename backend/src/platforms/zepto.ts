/**
 * Zepto.
 *
 * Transport: headless browser. This is the one platform where that was unavoidable, and the
 * decision is backed by a controlled measurement rather than a guess — on 2026-09-15, from the same
 * IP within the same minute:
 *
 *   real Chrome  -> HTTP 200, 191 KB of search results
 *   impit        -> HTTP 429, empty body, ~27 ms
 *   CycleTLS     -> HTTP 429, empty body, ~27 ms  (tried with two JA3 strings, forced HTTP/1.1,
 *                                                  no JA3 at all, and against the store resolver)
 *
 * A 429 arriving in 27 ms with no body is an edge verdict — the request never reached Zepto's
 * service — and the simultaneous browser success rules out both IP throttling and store hours.
 * `bff-gateway.zepto.com` recognises both impersonation stacks at the connection level.
 *
 * Rather than replay the call ourselves inside the page (which still gets challenged, because that
 * host runs its own AWS WAF check), we navigate Zepto's own search page and intercept the response
 * its app produces. Zepto's JavaScript then supplies the `request-signature` header and completes
 * the WAF handshake for us, which is the whole point: we never have to reproduce either.
 *
 * What changed from the old adapter: it scraped rendered HTML with Cheerio using `data-testid`
 * hooks (`product-card-name`, `product-card-price`, …) that Zepto has since removed — today only
 * the outer `product-card` testid survives, so every field came back blank. Reading the JSON the
 * page fetches is both richer and far less brittle than reading the DOM it renders.
 */
import { Page } from 'puppeteer';
import { readBrowserCookies, withBrowserPage } from '../services/headlessBrowserPool';
import {
  buildProductPricing,
  cleanText,
  parseEtaMinutes,
  parseRupeeAmount,
} from './normalizationHelpers';
import {
  NormalizedProduct,
  PlatformAdapter,
  PlatformAdapterResult,
  PlatformSearchRequest,
  PlatformSearchResult,
  SearchLocation,
} from './types';

const PLATFORM_ID = 'zepto' as const;
const PLATFORM_DISPLAY_NAME = 'Zepto';
const ZEPTO_ORIGIN = 'https://www.zepto.com';
const SEARCH_API_URL_FRAGMENT = 'user-search-service/api/v3/search';
/**
 * How long to wait for Zepto's own search response once the store is selected.
 *
 * This is Zepto's INTERNAL wait, separate from the adapter's `searchTimeoutMs`, and it is the one
 * that was actually firing: measured 2026-10-25 at Gurugram and Bengaluru, Zepto failed at 45.7 s
 * with "search response did not arrive in time" while its 95 s outer ceiling was nowhere near.
 * Raising the outer ceiling alone therefore changed nothing. Chromium page loads are CPU-bound and
 * `flipkartMinutes.ts` now drives a second browser flow alongside this one, so the response can
 * legitimately take far longer than it does when Zepto runs alone (~8 s).
 */
const SEARCH_RESPONSE_WAIT_MS = 75000;

/**
 * Tells Zepto where the shopper is by driving its own address picker.
 *
 * Selectors verified live on 2026-09-15. Skipping this does not fail the search — Zepto falls back
 * to a default store — so a picker change degrades location accuracy rather than breaking the
 * platform, and the resolved address is reported back so a wrong city is visible, not silent.
 */
const applyDeliveryAddress = async (page: Page, location: SearchLocation): Promise<string | null> => {
  // Zepto ignores the browser's geolocation — measured: it resolved its own default store while
  // Puppeteer reported different coordinates — so the text picker is the only way to place the
  // shopper. Prefer a real address; a bare pincode also matches Zepto's autocomplete.
  const addressText = location.addressText ?? location.pincode;
  if (!addressText) return null;
  // Each wait is bounded tightly: a picker that has changed must cost seconds, not the whole
  // platform budget, because search still works against Zepto's default store.
  const SELECTOR_WAIT_MS = 8000;
  try {
    // Wait for the control rather than trusting the navigation's load state: the page is navigated
    // with `domcontentloaded` (fast), but Zepto renders its header client-side, so clicking straight
    // away threw "No element found for selector" and the address step was silently skipped —
    // which is exactly how a Gurugram search came back with Bengaluru-only brands.
    await page.waitForSelector('[data-testid="user-address"]', {
      visible: true,
      timeout: SELECTOR_WAIT_MS,
    });
    await page.click('[data-testid="user-address"]');
    await page.waitForSelector('input[placeholder*="address" i]', {
      visible: true,
      timeout: SELECTOR_WAIT_MS,
    });
    await page.type('input[placeholder*="address" i]', addressText, { delay: 15 });
    await page.waitForSelector('[data-testid="address-search-item"]', {
      visible: true,
      timeout: SELECTOR_WAIT_MS,
    });
    await page.click('[data-testid="address-search-item"]');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return page.evaluate(
      () =>
        document.querySelector('[data-testid="user-address"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
        null,
    );
  } catch {
    return null;
  }
};

const normalizeZeptoItem = (rawItem: Record<string, any>): NormalizedProduct | null => {
  const productResponse = rawItem?.productResponse ?? rawItem;
  const product = productResponse?.product;
  const productVariant = productResponse?.productVariant;
  if (!product || !productVariant) return null;

  const productName = cleanText(product.name);
  const platformProductId = String(productVariant.id ?? product.id ?? '');
  if (!productName || !platformProductId) return null;

  // Zepto sends money in paise on some fields and rupees on others; the *SellingPrice fields on
  // productResponse are paise, so divide. Guarded rather than assumed: values under 1000 with no
  // decimal are already rupees on the variant object.
  const toRupees = (paiseValue: unknown): number | null => {
    const parsed = parseRupeeAmount(paiseValue);
    return parsed === null ? null : Math.round(parsed) / 100;
  };

  const sellingPriceInRupees =
    toRupees(productResponse.discountedSellingPrice) ?? toRupees(productVariant.discountedSellingPrice);
  const maximumRetailPriceInRupees = toRupees(productResponse.mrp) ?? toRupees(productVariant.mrp);

  return {
    productKey: `${PLATFORM_ID}:${platformProductId}`,
    platformProductId,
    platformId: PLATFORM_ID,
    productName,
    brandName: cleanText(product.brand),
    packSizeLabel: cleanText(productVariant.formattedPacksize ?? productVariant.packsize),
    categoryName: cleanText(productResponse.primaryCategoryName ?? productResponse.l2CategoryName),
    description: Array.isArray(product.description)
      ? cleanText(product.description.join(' '))
      : cleanText(product.description),
    imageUrlList: (productVariant.images ?? [])
      .map((image: any) => image?.path)
      .filter((path: unknown): path is string => typeof path === 'string')
      .map((path: string) =>
        path.startsWith('http') ? path : `https://cdn.zeptonow.com/production/${path}`,
      ),
    pricing: buildProductPricing({
      sellingPriceInRupees,
      maximumRetailPriceInRupees,
      unitPriceLabel: cleanText(productVariant.unitLevelPrice),
    }),
    rating: productVariant.ratingSummary?.averageRating
      ? {
          averageRating: parseRupeeAmount(productVariant.ratingSummary.averageRating),
          ratingCountLabel:
            productVariant.ratingSummary.totalRatings != null
              ? String(productVariant.ratingSummary.totalRatings)
              : null,
        }
      : null,
    checkIfInStock: productResponse.outOfStock !== true && productVariant.outOfStock !== true,
    deliveryEtaInMinutes: parseEtaMinutes(productResponse.etaInMinutes),
    checkIfSponsored: Boolean(rawItem?.meta?.isAd ?? productResponse.isSponsored),
    productWebUrl: productVariant.id
      ? `${ZEPTO_ORIGIN}/pn/${productName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')}/pvid/${productVariant.id}`
      : null,
  };
};

const collectProductList = (searchResponseJson: any): NormalizedProduct[] => {
  const productList: NormalizedProduct[] = [];
  (searchResponseJson?.layout ?? []).forEach((widget: any) => {
    (widget?.data?.resolver?.data?.items ?? []).forEach((rawItem: any) => {
      const normalized = normalizeZeptoItem(rawItem);
      if (normalized) productList.push(normalized);
    });
  });
  return productList;
};

const searchProductList = async (
  request: PlatformSearchRequest,
): Promise<PlatformAdapterResult> => {
  const startedAt = Date.now();
  const baseResult = {
    platformId: PLATFORM_ID,
    platformDisplayName: PLATFORM_DISPLAY_NAME,
    storeLevelCharges: null,
    checkIfServedFromCache: false,
  };

  let resolvedAddressLabel: string | null = null;
  try {
    const searchResponseJson = await withBrowserPage(
      {
        permissionOrigin: ZEPTO_ORIGIN,
        latitude: request.location.latitude,
        longitude: request.location.longitude,
      },
      async (page) => {
        await page.goto(ZEPTO_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // Keep what the picker actually selected. Discarding it is how a Gurugram search once
        // returned Bengaluru-only brands with nothing in the response to show the store was wrong.
        resolvedAddressLabel = await applyDeliveryAddress(page, request.location);

        /**
         * Arm the listener only AFTER the address is applied.
         *
         * Zepto's app re-issues its search call while the address picker is in use, against the
         * store it had before. Arming earlier resolved this promise with that stale response — a
         * Gurugram request came back full of Bengaluru-only brands (Nandini, Akshayakalpa) while
         * the address had in fact been set correctly. Listening from here guarantees the response
         * we read belongs to the store we just selected.
         */
        const searchResponsePromise = new Promise<any>((resolve, reject) => {
          const timeoutHandle = setTimeout(
            () => reject(new Error('Zepto search response did not arrive in time')),
            SEARCH_RESPONSE_WAIT_MS,
          );
          page.on('response', async (response) => {
            if (!response.url().includes(SEARCH_API_URL_FRAGMENT)) return;
            if (response.url().includes('/filters')) return;
            try {
              const parsed = await response.json();
              // The app fires an empty priming call first; wait for the one carrying results.
              if (parsed?.layout === undefined) return;
              clearTimeout(timeoutHandle);
              resolve(parsed);
            } catch {
              // Non-JSON or already-consumed body: keep waiting for the real one.
            }
          });
        });

        await page.goto(
          `${ZEPTO_ORIGIN}/search?query=${encodeURIComponent(request.searchQuery)}`,
          { waitUntil: 'domcontentloaded', timeout: 45000 },
        );

        const searchJson = await searchResponsePromise;
        // Read cookies so a future transport change can reuse this session; harmless today.
        await readBrowserCookies(page, ZEPTO_ORIGIN).catch(() => undefined);
        return searchJson;
      },
    );

    const productList = collectProductList(searchResponseJson);
    const storeDeliveryEtaInMinutes =
      productList.find((product) => product.deliveryEtaInMinutes !== null)?.deliveryEtaInMinutes ??
      null;

    return {
      ...baseResult,
      checkIfSucceeded: true,
      productList,
      totalProducts: productList.length,
      storeDeliveryEtaInMinutes,
      resolvedLocationLabel: resolvedAddressLabel,
      failureReason: null,
      failureDetail: null,
      elapsedMilliseconds: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Zepto error';
    return {
      ...baseResult,
      checkIfSucceeded: false,
      productList: [],
      totalProducts: 0,
      storeDeliveryEtaInMinutes: null,
      failureReason: message.includes('did not arrive') ? 'timedOut' : 'unexpectedResponse',
      failureDetail: message,
      elapsedMilliseconds: Date.now() - startedAt,
    };
  }
};

export const zeptoAdapter: PlatformAdapter = {
  platformId: PLATFORM_ID,
  platformDisplayName: PLATFORM_DISPLAY_NAME,
  checkIfEnabled: true,
  // The browser IS the session here: each search drives a fresh page, so there is nothing to mint
  // and cache separately. Swapping Zepto to an HTTP transport later would flip this to true.
  checkIfRequiresSession: false,
  // Zepto drives a browser, so there is no HTTP client to choose and therefore no ladder.
  // It IS the platform that silently kept a default store and returned Bengaluru-only brands
  // for a Gurugram request, so its resolved address is checked on every search.
  checkIfLocationNeedsVerification: true,
  // Alone this adapter finishes in ~9 s. The ceiling has to cover QUEUE TIME, not just its own
  // work: browser runs are serialised, and since `flipkartMinutes.ts` became browser-driven it can
  // hold the browser for ~40 s first. A 55 s ceiling expired while Zepto was still waiting its
  // turn, which reads as a Zepto failure but is really a scheduling one.
  searchTimeoutMs: 95000,
  searchProductList,
};
