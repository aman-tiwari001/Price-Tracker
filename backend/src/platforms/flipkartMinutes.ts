/**
 * Flipkart Minutes.
 *
 * Transport: a real browser for both steps, with the ADDRESS BINDING cached between them.
 *
 * Three designs have been tried here, and the differences matter:
 *
 *   1. mint a request template, replay it over impit/CycleTLS — abandoned 2026-10-25. The captured
 *      header set varied between mints (one capture carried `flipkart_secure`, another minutes
 *      later did not), Flipkart's gateway answers HTTP 406 when it dislikes the set, and a bad
 *      template stayed cached for the whole session TTL, poisoning every later search.
 *   2. bind the address and search in the browser on EVERY search — correct but slow. Measured
 *      40-70 s per search, and because browser work is serialised it starved Zepto, which timed out
 *      in all three test cities while Flipkart held the browser.
 *   3. (this one) bind the address in the browser ONCE per location, cache the cookie jar that
 *      results, and restore it for each search so only the search itself runs.
 *
 * The cookie jar is what actually binds the store — measured 2026-10-25, the search request body
 * carries only `pageUri`, `pageContext` and `requestContext`, no location block, yet returns real
 * Minutes stock with a delivery ETA. So the cookies are the right thing to cache, and the request
 * template never was.
 *
 * The address flow (verified live 2026-09-15, still current 2026-10-25): type a pincode into the
 * logged-out "Search by area, street name, pin code" box, click the first suggestion, then click
 * the map sheet's **Confirm**. That control is a `<div>`, not a `<button>` — which is why earlier
 * scans of `button, [role="button"]` concluded, wrongly, that Minutes required a signed-in account.
 *
 * No login is involved.
 */
import { withBrowserPage } from '../services/headlessBrowserPool';
import { buildProductPricing, cleanText, parseRupeeAmount } from './normalizationHelpers';
import {
  NormalizedProduct,
  PlatformAdapter,
  PlatformAdapterResult,
  PlatformSearchRequest,
  PlatformSearchResult,
  SearchLocation,
  StoreLevelCharges,
} from './types';

type BrowserPage = Parameters<Parameters<typeof withBrowserPage>[1]>[0];

const PLATFORM_ID = 'flipkartMinutes' as const;
const PLATFORM_DISPLAY_NAME = 'Flipkart Minutes';
const FLIPKART_ORIGIN = 'https://www.flipkart.com';
const FLIPKART_STOREFRONT_URL = `${FLIPKART_ORIGIN}/flipkart-minutes-store?marketplace=HYPERLOCAL`;

/** How long to wait for the search response after each in-page submit. */
const FIRST_SEARCH_WAIT_MS = 14000;
const SECOND_SEARCH_WAIT_MS = 12000;

const SEARCH_BOX_SELECTOR =
  'input[name="q"], input[title*="Search for Products" i], input[placeholder*="Search for Products" i]';

/**
 * Polls a condition in the page instead of sleeping a fixed number of seconds.
 *
 * The fixed sleeps this replaces (4 s + 4 s + 5 s + 6 s) were wrong in both directions: they idled
 * when Flipkart responded in under a second, and they gave up while the address sheet was still
 * rendering on a slow run, which is what made the address binding itself intermittent.
 */
const waitForPageCondition = async (
  page: BrowserPage,
  checkIfConditionMetInPage: () => boolean,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const checkIfSatisfied = await page.evaluate(checkIfConditionMetInPage).catch(() => false);
    if (checkIfSatisfied) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
};

/**
 * Opens the Minutes storefront.
 *
 * `domcontentloaded`, NOT `networkidle2`: Flipkart keeps analytics and ad sockets open, so waiting
 * for the network to go quiet spends 30-50 s waiting for traffic that never settles — and since
 * browser work is serialised, that time comes straight out of Zepto's and Swiggy's budget.
 */
const openStorefront = async (page: BrowserPage): Promise<void> => {
  await page.goto(FLIPKART_STOREFRONT_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
};

/**
 * Searches THROUGH THE SITE'S OWN SEARCH BOX, not by navigating to the search URL.
 *
 * `page.goto('/search?q=…')` is a full page load, which Flipkart renders server-side and which
 * therefore fires no `page/fetch` at all — 16 of them were observed during one run and every one
 * was for the storefront. Submitting the in-page search box is a client-side route change, and THAT
 * is what makes the app issue the search `page/fetch` we read.
 */
const submitSearchThroughSearchBox = async (
  page: BrowserPage,
  searchText: string,
): Promise<void> => {
  await page.evaluate(
    (typedText, searchBoxSelector) => {
      const searchInput = document.querySelector<HTMLInputElement>(searchBoxSelector);
      if (!searchInput) return;
      // React ignores a plain `.value =` assignment, so set it through the native setter and then
      // dispatch the event React actually listens for.
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeValueSetter?.call(searchInput, typedText);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.form?.requestSubmit?.();
    },
    searchText,
    SEARCH_BOX_SELECTOR,
  );
  await page.keyboard.press('Enter').catch(() => undefined);
};

/**
 * Binds a delivery address in a real browser and keeps the cookie jar it produces.
 *
 * Only the cookies and Flipkart's own resolution of the pincode are stored. The request template
 * the previous design captured here is deliberately gone — it was the source of the intermittent
 * HTTP 406s, because which template got captured was luck.
 */
const bindDeliveryAddress = async (
  page: BrowserPage,
  location: SearchLocation,
): Promise<string | null> => {
      const pincodeText = location.pincode ?? location.addressText;
      if (!pincodeText) {
        throw new Error('Flipkart Minutes needs a pincode or address to bind a store');
      }

      await waitForPageCondition(
        page,
        () =>
          document.querySelector('input[placeholder*="pin code" i], input[placeholder*="area" i]') !==
          null,
        12000,
      );

      await page.evaluate((addressText) => {
        const addressInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="pin code" i], input[placeholder*="area" i]',
        );
        if (!addressInput) return;
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeValueSetter?.call(addressInput, addressText);
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }, pincodeText);

      // Wait for the autocomplete list to actually render rather than assuming 4 s is enough.
      await waitForPageCondition(
        page,
        () =>
          [...document.querySelectorAll('li,div')].some((element) => {
            const rowText = ((element as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
            return (
              (element as HTMLElement).offsetParent !== null &&
              rowText.length > 25 &&
              rowText.length < 120 &&
              /india$/i.test(rowText)
            );
          }),
        12000,
      );

      // Pick the first suggestion that reads like a full address rather than a bare pincode.
      const clickedSuggestionText = await page.evaluate(() => {
        const suggestionRow = [...document.querySelectorAll('li,div')].find((element) => {
          if ((element as HTMLElement).offsetParent === null || !(element as HTMLElement).innerText) {
            return false;
          }
          const rowText = (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
          return (
            rowText.length > 25 &&
            rowText.length < 120 &&
            /india$/i.test(rowText) &&
            element.querySelectorAll('li,div').length <= 3
          );
        });
        (suggestionRow as HTMLElement | undefined)?.click();
        // The row's text is FLIPKART's resolution of the pincode we typed, so it is evidence about
        // where the store is rather than a restatement of what we asked for. That distinction is
        // the whole point of verifying: if its autocomplete resolved 122003 to a Bengaluru address,
        // the location gate has to be able to see that.
        return suggestionRow
          ? ((suggestionRow as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim()
          : null;
      });

      await waitForPageCondition(
        page,
        () =>
          [...document.querySelectorAll('*')].some(
            (element) =>
              (element as HTMLElement).offsetParent !== null &&
              element.children.length === 0 &&
              /^confirm$/i.test((element.textContent ?? '').trim()),
          ),
        12000,
      );

      // The commit control is a <div> reading "Confirm". Click the leaf and then walk up a few
      // ancestors, because the click handler often sits on a wrapper rather than the text.
      const checkIfConfirmClicked = await page.evaluate(() => {
        const confirmLeaf = [...document.querySelectorAll('*')].find(
          (element) =>
            (element as HTMLElement).offsetParent !== null &&
            element.children.length === 0 &&
            /^confirm$/i.test((element.textContent ?? '').trim()),
        );
        let clickTarget = confirmLeaf as HTMLElement | null | undefined;
        for (let depth = 0; depth < 4 && clickTarget?.parentElement; depth += 1) {
          clickTarget.click();
          clickTarget = clickTarget.parentElement;
          clickTarget.click();
        }
        return confirmLeaf !== undefined;
      });

      // The store is bound once the sheet closes and the site's own search box is on the page.
      await waitForPageCondition(
        page,
        () => document.querySelector(SEARCH_BOX_SELECTOR) !== null,
        15000,
      );

      if (!clickedSuggestionText && !checkIfConfirmClicked) {
        throw new Error(
          `Flipkart Minutes could not bind ${pincodeText}: no address suggestion and no Confirm control`,
        );
      }
      return clickedSuggestionText;
};

/** Flipkart serves images through a templated CDN URL; fill the placeholders in with real sizes. */
const buildImageUrl = (templatedUrl: string | undefined): string | null =>
  typeof templatedUrl === 'string'
    ? templatedUrl
        .replace('{@width}', '400')
        .replace('{@height}', '400')
        .replace('{@quality}', '70')
    : null;

const normalizeFlipkartProduct = (rawProduct: Record<string, any>): NormalizedProduct | null => {
  const productInfo = rawProduct?.productInfo?.value;
  if (!productInfo) return null;

  const productName = cleanText(productInfo.titles?.title ?? productInfo.titles?.newTitle);
  const platformProductId = String(productInfo.id ?? productInfo.itemId ?? '');
  if (!productName || !platformProductId) return null;

  const pricingBlock = productInfo.pricing ?? {};

  return {
    productKey: `${PLATFORM_ID}:${platformProductId}`,
    platformProductId,
    platformId: PLATFORM_ID,
    productName,
    brandName: cleanText(productInfo.productBrand ?? productInfo.titles?.superTitle),
    // Flipkart puts the pack size in the card's subtitle, e.g. "500 ml".
    packSizeLabel: cleanText(productInfo.titles?.subtitle),
    categoryName: null,
    description: null,
    imageUrlList: (productInfo.media?.images ?? [])
      .map((image: any) => buildImageUrl(image?.url))
      .filter((url: string | null): url is string => url !== null),
    pricing: buildProductPricing({
      sellingPriceInRupees: parseRupeeAmount(
        pricingBlock.finalPrice?.value ?? pricingBlock.finalPrice?.decimalValue,
      ),
      maximumRetailPriceInRupees: parseRupeeAmount(
        pricingBlock.mrp?.value ?? pricingBlock.mrp?.decimalValue,
      ),
    }),
    rating: null,
    checkIfInStock: productInfo.availability?.displayState !== 'OUT_OF_STOCK',
    // `deliverySla` is in SECONDS (423 for a store the site labels "8 min"), so convert.
    deliveryEtaInMinutes:
      typeof productInfo.deliverySla === 'number'
        ? Math.max(1, Math.round(productInfo.deliverySla / 60))
        : null,
    checkIfSponsored: Boolean(productInfo.tags?.some?.((tag: any) => /^ad$/i.test(String(tag)))),
    productWebUrl: typeof productInfo.smartUrl === 'string' ? productInfo.smartUrl : null,
  };
};

/** Walks the widget tree collecting every `products` array, wherever Flipkart nests them. */
const collectRawProductList = (responseJson: any): Record<string, any>[] => {
  const rawProductList: Record<string, any>[] = [];
  const visitNode = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.products)) rawProductList.push(...node.products);
    Object.values(node).forEach(visitNode);
  };
  visitNode(responseJson?.RESPONSE?.slots ?? responseJson?.RESPONSE ?? responseJson);
  return rawProductList;
};

const readStoreLevelCharges = (rawProductList: Record<string, any>[]): StoreLevelCharges | null => {
  const deliveryChargeValue = rawProductList
    .map((rawProduct) => rawProduct?.productInfo?.value?.pricing?.deliveryCharge?.value)
    .find((value) => typeof value === 'number');
  return deliveryChargeValue === undefined
    ? null
    : {
        deliveryFeeInRupees: deliveryChargeValue,
        handlingFeeInRupees: null,
        freeDeliveryThresholdInRupees: null,
        additionalChargeNoteList: [],
      };
};

/** Thrown when the restored jar no longer binds a store, so the caller re-mints instead of failing. */
const LOST_ADDRESS_MESSAGE = 'Flipkart Minutes lost the bound delivery address';

const searchProductList = async (
  request: PlatformSearchRequest,
): Promise<PlatformAdapterResult> => {
  const startedAt = Date.now();
  const baseResult = {
    platformId: PLATFORM_ID,
    platformDisplayName: PLATFORM_DISPLAY_NAME,
    checkIfServedFromCache: false,
  };
  const buildFailure = (
    failureReason: PlatformSearchResult['failureReason'],
    failureDetail: string,
  ): PlatformAdapterResult => ({
    ...baseResult,
    checkIfSucceeded: false,
    productList: [],
    totalProducts: 0,
    storeDeliveryEtaInMinutes: null,
    storeLevelCharges: null,
    failureReason,
    failureDetail,
    elapsedMilliseconds: Date.now() - startedAt,
  });

  try {
    const { searchResponseJson, resolvedLocationLabel } = await withBrowserPage<{
      searchResponseJson: any;
      resolvedLocationLabel: string | null;
    }>(
      {
        permissionOrigin: FLIPKART_ORIGIN,
        latitude: request.location.latitude,
        longitude: request.location.longitude,
      },
      async (page) => {
        /**
         * Read the search response INSIDE the handler, while its body is still live.
         *
         * An earlier attempt to confirm the body after the fact failed — Puppeteer cannot reliably
         * load a response body once the navigation that produced it has finished, so `.json()`
         * threw and the result was discarded even though the page had clearly rendered prices.
         * Resolving from inside the listener is the same pattern `zepto.ts` uses successfully.
         */
        let resolveSearchJson: ((value: any) => void) | null = null;
        /** A result-less but valid answer, kept so "no matches" does not masquerade as a timeout. */
        let lastEmptySearchResponseJson: any = null;

        const searchResponsePromise = new Promise<any>((resolve) => {
          resolveSearchJson = resolve;
        });

        page.on('response', async (response) => {
          if (!response.url().includes('page/fetch')) return;
          const requestBody = response.request().postData();
          if (!requestBody || !requestBody.includes('/search')) return;
          try {
            const parsedJson = await response.json();
            if (collectRawProductList(parsedJson).length === 0) {
              // Flipkart fires a result-less priming call first; remember it, keep waiting for stock.
              lastEmptySearchResponseJson = parsedJson;
              return;
            }
            resolveSearchJson?.(parsedJson);
          } catch {
            // Non-JSON, a redirect, or a body already consumed: keep waiting for the real one.
          }
        });

        await openStorefront(page);
        const resolvedLocationLabel = await bindDeliveryAddress(page, request.location);

        const checkIfSearchBoxReady = await waitForPageCondition(
          page,
          () =>
            document.querySelector(
              'input[name="q"], input[title*="Search for Products" i], input[placeholder*="Search for Products" i]',
            ) !== null,
          15000,
        );
        if (!checkIfSearchBoxReady) throw new Error(LOST_ADDRESS_MESSAGE);

        const waitForSearchJson = async (timeoutMs: number): Promise<any | null> =>
          Promise.race([
            searchResponsePromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
          ]);

        await submitSearchThroughSearchBox(page, request.searchQuery);
        let searchResponseJsonFromPage = await waitForSearchJson(FIRST_SEARCH_WAIT_MS);

        if (searchResponseJsonFromPage === null) {
          // Re-submitting the SAME term is a no-op to the client-side router, so it would fire no
          // request at all. Routing through a different term first makes the real query a genuine
          // route change again.
          await submitSearchThroughSearchBox(page, `${request.searchQuery} pack`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await submitSearchThroughSearchBox(page, request.searchQuery);
          searchResponseJsonFromPage = await waitForSearchJson(SECOND_SEARCH_WAIT_MS);
        }

        if (searchResponseJsonFromPage === null && lastEmptySearchResponseJson === null) {
          // No search response at all, after the storefront loaded: the usual cause is a jar that
          // no longer binds a store, which a fresh mint fixes.
          throw new Error(LOST_ADDRESS_MESSAGE);
        }
        return {
          searchResponseJson: searchResponseJsonFromPage ?? lastEmptySearchResponseJson,
          resolvedLocationLabel,
        };
      },
    );

    const rawProductList = collectRawProductList(searchResponseJson);
    const productList = rawProductList
      .map(normalizeFlipkartProduct)
      .filter((product): product is NormalizedProduct => product !== null);

    // An empty list is deliberately NOT reported as `notServiceable`: the address is bound and this
    // is a real catalogue response, so it means nothing matched this search. Claiming
    // non-serviceability would tell the shopper something untrue about their own address.
    return {
      ...baseResult,
      checkIfSucceeded: true,
      productList,
      totalProducts: productList.length,
      resolvedLocationLabel,
      storeDeliveryEtaInMinutes:
        productList.find((product) => product.deliveryEtaInMinutes !== null)?.deliveryEtaInMinutes ??
        null,
      storeLevelCharges: readStoreLevelCharges(rawProductList),
      failureReason: null,
      failureDetail: null,
      elapsedMilliseconds: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Flipkart Minutes error';
    // `sessionExpired` is the one failure the fan-out acts on: it drops the jar and re-runs this
    // search once against a freshly bound address, so a stale binding self-heals.
    return buildFailure(
      message === LOST_ADDRESS_MESSAGE ? 'sessionExpired' : 'unexpectedResponse',
      message,
    );
  }
};

export const flipkartMinutesAdapter: PlatformAdapter = {
  platformId: PLATFORM_ID,
  platformDisplayName: PLATFORM_DISPLAY_NAME,
  checkIfEnabled: true,
  // ONE browser turn per search: bind the address and read the results in the same page visit.
  //
  // Caching the bound address as a cookie jar was tried on 2026-10-25 and reverted — restoring the
  // jar into a fresh browser context does NOT re-bind the store, so every search failed with the
  // search box missing, and it cost two serialised browser turns to find that out.
  checkIfRequiresSession: false,
  // Driving a browser means there is no HTTP client to choose, so there is no transport ladder.
  // The delivery address is bound through the map sheet's Confirm, so prove which store it bound.
  checkIfLocationNeedsVerification: true,
  // A COLD search needs two browser turns — bind the address (~25 s), then search (~15 s) — and
  // browser work is serialised, so it also waits behind Zepto and behind Swiggy's own browser mint.
  // Measured 2026-10-25 across Gurugram, Bengaluru and New Delhi: 90 s expired every time while
  // Flipkart was still queued. A WARM search reuses the cached jar and needs one turn.
  searchTimeoutMs: 150000,
  searchProductList,
};
