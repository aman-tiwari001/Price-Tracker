/**
 * Swiggy Instamart.
 *
 * Transport: CycleTLS, not impit. Measured 2026-09-15 with identical headers and the same minted
 * session: impit got HTTP 403 from CloudFront, CycleTLS got HTTP 200 with 32 products in ~550 ms.
 * The responses carried `X-Envoy-Upstream-Service-Time`, proving CycleTLS reached Swiggy's real
 * backend rather than an edge error page.
 *
 * Session: browser-minted, and it genuinely cannot be forged. AWS WAF only issues its
 * `aws-waf-token` after a JavaScript proof-of-work runs, and Swiggy server-SIGNS the delivery point
 * into its cookies (`lat=s%3A12.9352.<hmac>`). The old adapter tried to forge exactly these with
 * `generateSignedCoordinate(value, 'swiggy')` — a guessed secret — which is why it never worked.
 * Minting takes one ~15 s browser run per location and the token then lasts about three days.
 *
 * What changed besides transport: the endpoint moved from `/api/instamart/search` to
 * `/api/instamart/search/v2`, and the product schema switched from snake_case to camelCase, so the
 * old extractor would have produced blank cards even if its request had succeeded.
 */
import CONSTANTS from '../config/constant';
import {
  readBrowserCookies,
  withBrowserPage,
} from '../services/headlessBrowserPool';
import {
  buildBrowserBaseHeaderMap,
  fetchAsImpersonatedBrowser,
} from '../services/httpImpersonationClient';
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
  PlatformSession,
  SearchLocation,
  StoreLevelCharges,
} from './types';

const PLATFORM_ID = 'swiggyInstamart' as const;
const PLATFORM_DISPLAY_NAME = 'Swiggy Instamart';
const SWIGGY_ORIGIN = 'https://www.swiggy.com';
const SWIGGY_IMAGE_BASE_URL = 'https://media-assets.swiggy.com/swiggy/image/upload/';
/** Sent by Swiggy's own web app; kept as a constant so a bump is a one-line change. */
const SWIGGY_WEB_BUILD_VERSION = '2.377.0';

/**
 * Drives Swiggy's own "Share location" button.
 *
 * This matters for correctness, not convenience: left alone, Swiggy picks a delivery point from the
 * server's IP address — during testing it silently chose Gurugram while the shopper's coordinates
 * said Bengaluru — and then signs THAT into the cookies. Clicking `set-gps-button` makes it read the
 * geolocation Puppeteer has overridden, so the signed cookies describe the real shopper.
 */
const mintSession = async (
  location: SearchLocation,
  locationBucketKey: string,
): Promise<PlatformSession> =>
  withBrowserPage(
    {
      permissionOrigin: SWIGGY_ORIGIN,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    async (page) => {
      await page.goto(`${SWIGGY_ORIGIN}/instamart`, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Selector verified live on 2026-09-15. If Swiggy renames it, we still get a session — just
      // one pinned to Swiggy's IP-derived default — so the resolved point is reported back below
      // and the caller can tell the shopper which location these prices are actually for.
      //
      // Clicked from inside the page rather than with `page.click`: the button triggers a client
      // navigation, and Puppeteer's click races it and throws "Navigating frame was detached",
      // which previously failed the whole mint.
      await page
        .waitForSelector('[data-testid="set-gps-button"]', { visible: true, timeout: 12000 })
        .then(() =>
          page.evaluate(() => {
            const gpsButton = document.querySelector<HTMLElement>('[data-testid="set-gps-button"]');
            gpsButton?.click();
          }),
        )
        .catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Landing on a search page makes Swiggy resolve the serving store and finish the cookie set.
      await page
        .goto(`${SWIGGY_ORIGIN}/instamart/search?query=milk`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        })
        .catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const { cookieHeader, cookieByName } = await readBrowserCookies(page, `${SWIGGY_ORIGIN}/instamart`);
      if (!cookieByName['aws-waf-token']) {
        throw new Error('Swiggy session mint produced no aws-waf-token');
      }

      // Record where Swiggy thinks we are, so a wrong-city session is visible rather than silent.
      let resolvedLatitude = '';
      let resolvedLongitude = '';
      try {
        const userLocation = JSON.parse(decodeURIComponent(cookieByName.userLocation ?? '{}'));
        resolvedLatitude = String(userLocation.lat ?? '');
        resolvedLongitude = String(userLocation.lng ?? '');
      } catch {
        // A missing or unparseable userLocation cookie just leaves the resolved point unknown.
      }

      return {
        platformId: PLATFORM_ID,
        cookieHeader,
        // Stored as coordinates because that is what Swiggy signs into its cookies; the location gate
        // understands a "lat,lng" label and compares by distance.
        resolvedValueMap: { resolvedLatitude, resolvedLongitude },
        expiresAtEpochMs: Date.now() + CONSTANTS.PLATFORM_SESSION_TTL_SECONDS * 1000,
        locationBucketKey,
      };
    },
  );

/** Swiggy sends money as protobuf `{currencyCode, units, nanos}`, where `units` is a string. */
const parseProtobufMoney = (moneyValue: any): number | null => {
  if (moneyValue === null || moneyValue === undefined) return null;
  if (typeof moneyValue === 'number' || typeof moneyValue === 'string') {
    return parseRupeeAmount(moneyValue);
  }
  const units = parseRupeeAmount(moneyValue.units);
  if (units === null) return null;
  const nanos = typeof moneyValue.nanos === 'number' ? moneyValue.nanos / 1_000_000_000 : 0;
  return Math.round((units + nanos) * 100) / 100;
};

const normalizeSwiggyItem = (rawItem: Record<string, any>): NormalizedProduct | null => {
  const variation = rawItem?.variations?.[0];
  if (!variation) return null;

  const productName = cleanText(variation.displayName ?? rawItem.displayName);
  const platformProductId = String(variation.skuId ?? rawItem.productId ?? '');
  if (!productName || !platformProductId) return null;

  const priceBlock = variation.price ?? {};
  const imageUrlList = (variation.imageIds ?? [])
    .filter((imageId: unknown): imageId is string => typeof imageId === 'string')
    .map((imageId: string) => `${SWIGGY_IMAGE_BASE_URL}${imageId}`);

  return {
    productKey: `${PLATFORM_ID}:${platformProductId}`,
    platformProductId,
    platformId: PLATFORM_ID,
    productName,
    brandName: cleanText(variation.brandName ?? rawItem.brand),
    packSizeLabel: cleanText(variation.quantityDescription ?? variation.secondaryQuantityDescription),
    categoryName: cleanText(variation.category ?? variation.superCategory),
    description: cleanText(variation.shortDescription),
    imageUrlList,
    pricing: buildProductPricing({
      sellingPriceInRupees: parseProtobufMoney(priceBlock.offerPrice ?? priceBlock.storePrice),
      maximumRetailPriceInRupees: parseProtobufMoney(priceBlock.mrp),
      unitPriceLabel: cleanText(priceBlock.unitLevelPrice),
    }),
    rating: variation.rating?.value
      ? {
          averageRating: parseRupeeAmount(variation.rating.value),
          ratingCountLabel: cleanText(variation.rating.count),
        }
      : null,
    checkIfInStock: variation.inventory?.inStock ?? rawItem.inStock ?? false,
    deliveryEtaInMinutes: parseEtaMinutes(variation.sla?.deliveryTime ?? variation.sla?.slaString),
    checkIfSponsored: Boolean(rawItem.adTrackingContext ?? rawItem.analytics?.isAd),
    productWebUrl: `${SWIGGY_ORIGIN}/instamart/item/${platformProductId}`,
  };
};

/** Swiggy publishes basket-level fees in a widget rather than per product. */
const extractStoreLevelCharges = (responseJson: any): StoreLevelCharges | null => {
  const feeText = JSON.stringify(responseJson?.data?.deliveryFeeInfo ?? {});
  if (feeText === '{}') return null;
  return {
    deliveryFeeInRupees: parseRupeeAmount(responseJson?.data?.deliveryFeeInfo?.deliveryFee),
    handlingFeeInRupees: parseRupeeAmount(responseJson?.data?.deliveryFeeInfo?.handlingFee),
    freeDeliveryThresholdInRupees: parseRupeeAmount(
      responseJson?.data?.deliveryFeeInfo?.freeDeliveryThreshold,
    ),
    additionalChargeNoteList: [],
  };
};

const searchProductList = async (
  request: PlatformSearchRequest,
): Promise<PlatformAdapterResult> => {
  const startedAt = Date.now();
  const baseResult = {
    platformId: PLATFORM_ID,
    platformDisplayName: PLATFORM_DISPLAY_NAME,
    checkIfServedFromCache: false,
  };

  if (!request.session) {
    return {
      ...baseResult,
      checkIfSucceeded: false,
      productList: [],
      totalProducts: 0,
      storeDeliveryEtaInMinutes: null,
      storeLevelCharges: null,
      failureReason: 'sessionExpired',
      failureDetail: 'Could not mint a Swiggy Instamart session',
      elapsedMilliseconds: Date.now() - startedAt,
    };
  }

  try {
    const searchResponse = await fetchAsImpersonatedBrowser(request.transport, {
      platformId: PLATFORM_ID,
      url:
        `${SWIGGY_ORIGIN}/api/instamart/search/v2?offset=0&ageConsent=false` +
        `&voiceSearchTrackingId=&storeId=&primaryStoreId=&secondaryStoreId=`,
      method: 'POST',
      headerMap: {
        ...buildBrowserBaseHeaderMap(SWIGGY_ORIGIN),
        'content-type': 'application/json',
        referer: `${SWIGGY_ORIGIN}/instamart/search?query=${encodeURIComponent(request.searchQuery)}`,
        'x-build-version': SWIGGY_WEB_BUILD_VERSION,
        cookie: request.session.cookieHeader,
      },
      body: JSON.stringify({
        facets: [],
        sortAttribute: '',
        query: request.searchQuery,
        search_results_offset: '0',
        page_type: 'INSTAMART_SEARCH_PAGE',
        is_pre_search_tag: false,
      }),
    });

    if (searchResponse.httpStatus !== 200) {
      return {
        ...baseResult,
        checkIfSucceeded: false,
        productList: [],
        totalProducts: 0,
        storeDeliveryEtaInMinutes: null,
        storeLevelCharges: null,
        // 403 (CloudFront rejected the call) and 202 (AWS WAF re-issuing its challenge) both mean
        // the WAF token or the signed location cookies went stale. Reporting `sessionExpired` is
        // what makes the caller drop the session, so the next search mints a fresh one instead of
        // replaying a dead credential forever.
        failureReason:
          searchResponse.httpStatus === 403 || searchResponse.httpStatus === 202
            ? 'sessionExpired'
            : searchResponse.httpStatus === 429
              ? 'rateLimited'
              : 'blocked',
        failureDetail: `Swiggy Instamart answered HTTP ${searchResponse.httpStatus}`,
        elapsedMilliseconds: Date.now() - startedAt,
      };
    }

    const responseJson = JSON.parse(searchResponse.bodyText);
    const productList: NormalizedProduct[] = [];
    (responseJson?.data?.cards ?? []).forEach((card: any) => {
      const itemList = card?.card?.card?.gridElements?.infoWithStyle?.items ?? [];
      itemList.forEach((rawItem: any) => {
        const normalized = normalizeSwiggyItem(rawItem);
        if (normalized) productList.push(normalized);
      });
    });

    const storeDeliveryEtaInMinutes =
      productList.find((product) => product.deliveryEtaInMinutes !== null)?.deliveryEtaInMinutes ??
      null;

    return {
      ...baseResult,
      checkIfSucceeded: true,
      // What Swiggy says it priced against, so a silent IP-derived fallback is visible.
      resolvedLocationLabel:
        request.session.resolvedValueMap.resolvedLatitude &&
        request.session.resolvedValueMap.resolvedLongitude
          ? `${request.session.resolvedValueMap.resolvedLatitude},${request.session.resolvedValueMap.resolvedLongitude}`
          : null,
      productList,
      totalProducts: productList.length,
      storeDeliveryEtaInMinutes,
      storeLevelCharges: extractStoreLevelCharges(responseJson),
      failureReason: null,
      failureDetail: null,
      elapsedMilliseconds: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...baseResult,
      checkIfSucceeded: false,
      productList: [],
      totalProducts: 0,
      storeDeliveryEtaInMinutes: null,
      storeLevelCharges: null,
      failureReason: 'unexpectedResponse',
      failureDetail: error instanceof Error ? error.message : 'Unknown Swiggy Instamart error',
      elapsedMilliseconds: Date.now() - startedAt,
    };
  }
};

export const swiggyInstamartAdapter: PlatformAdapter = {
  platformId: PLATFORM_ID,
  platformDisplayName: PLATFORM_DISPLAY_NAME,
  checkIfEnabled: true,
  checkIfRequiresSession: true,
  mintSession,
  // CycleTLS reached Swiggy's real backend (X-Envoy-Upstream-Service-Time present) where impit
  // got a CloudFront 403; the rest remain as fallbacks.
  transportLadder: ['cycletls', 'impitFirefox', 'impit'],
  // Swiggy binds a store to the session and falls back to an IP-derived location when its
  // address flow fails, so the store it actually used has to be proved.
  checkIfLocationNeedsVerification: true,
  // The search itself is ~550 ms over CycleTLS, but a cold cache pays for one browser mint first
  // (page load + GPS grant + store resolution), which measured 15-25 s.
  // Covers queue time, not just its own work: a COLD search mints the Swiggy session in the same
  // serialised browser that Zepto and Flipkart Minutes use, so this can wait behind ~40 s of
  // Flipkart before it starts. Warm searches reuse the cached session and finish in well under a
  // second, so this ceiling only ever binds on the first search for a location.
  searchTimeoutMs: 95000,
  searchProductList,
};
