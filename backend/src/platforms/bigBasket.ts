/**
 * BigBasket (BB Now).
 *
 * Transport: impit, no browser anywhere. BigBasket runs Akamai but only collects telemetry on the
 * listing endpoint, so a Chrome-impersonating HTTP client is enough.
 *
 * What changed from the old adapter: it pasted a session cookie blob captured by hand in March 2025
 * — `csurftoken`, `_bb_vid`, `_bb_aid`, `_bb_sa_ids=14673` — straight into the source. That worked
 * only for as long as those values stayed alive and pinned every shopper to one Delhi service area.
 * Here the jar is minted by fetching BigBasket's own homepage and keeping its `Set-Cookie` values,
 * so it is always current and always this shopper's service area.
 */
import {
  buildBrowserBaseHeaderMap,
  buildCookieHeaderFromSetCookieList,
  fetchAsImpersonatedBrowser,
} from '../services/httpImpersonationClient';
import CONSTANTS from '../config/constant';
import {
  buildProductPricing,
  cleanText,
  parseEtaMinutes,
  parseRupeeAmount,
} from './normalizationHelpers';
import {
  ImpersonationTransport,
  NormalizedProduct,
  PlatformAdapter,
  PlatformAdapterResult,
  PlatformSearchRequest,
  PlatformSearchResult,
  PlatformSession,
  SearchLocation,
} from './types';

const PLATFORM_ID = 'bigBasket' as const;
const PLATFORM_DISPLAY_NAME = 'BB Now';
const BIGBASKET_ORIGIN = 'https://www.bigbasket.com';

/** BigBasket encodes the delivery point as base64 of "lat|lng" in a single cookie. */
const encodeLatLongCookieValue = (location: SearchLocation): string =>
  Buffer.from(`${location.latitude}|${location.longitude}`).toString('base64');

/**
 * Mints a session by asking BigBasket's homepage for a cookie jar, then overriding the delivery
 * point. Pure HTTP — no browser is launched for this platform.
 *
 * The homepage response carries the service-area, CSRF and Akamai cookies (`_bb_sa_ids`,
 * `csrftoken`, `_abck`) that the listing endpoint requires; sending only `_bb_lat_long` returns
 * HTTP 404 "2 exceptions occurred", which is what made the minimal cookie set fail in testing.
 */
const mintSession = async (
  location: SearchLocation,
  locationBucketKey: string,
): Promise<PlatformSession> => {
  const homepageResponse = await fetchAsImpersonatedBrowser('impit', {
    url: `${BIGBASKET_ORIGIN}/`,
    headerMap: {
      ...buildBrowserBaseHeaderMap(BIGBASKET_ORIGIN),
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
    },
  });

  return {
    platformId: PLATFORM_ID,
    cookieHeader: buildCookieHeaderFromSetCookieList(homepageResponse.setCookieList, {
      _bb_lat_long: `"${encodeLatLongCookieValue(location)}"`,
    }),
    resolvedValueMap: {},
    expiresAtEpochMs: Date.now() + CONSTANTS.PLATFORM_SESSION_TTL_SECONDS * 1000,
    locationBucketKey,
  };
};

/**
 * Fetches the serving store's delivery promise.
 *
 * BigBasket publishes NO ETA anywhere in the listing response — verified by scanning the whole
 * 303 KB payload for `short_eta`, `eta`, `sla`, `delivery_time` and `slot`, all absent. The old
 * extractor read `availability.short_eta`, which is why every BigBasket product showed no delivery
 * time. The web app gets it from the header service instead, as `"eta": "21 mins"`.
 */
const fetchStoreDeliveryEtaInMinutes = async (
  cookieHeader: string,
  transport: ImpersonationTransport,
): Promise<number | null> => {
  try {
    const headerResponse = await fetchAsImpersonatedBrowser(transport, {
      platformId: PLATFORM_ID,
      url: `${BIGBASKET_ORIGIN}/ui-svc/v2/header/?send_door_info=true&send_address_set_by_user=true`,
      headerMap: {
        ...buildBrowserBaseHeaderMap(BIGBASKET_ORIGIN),
        'content-type': 'application/json',
        'x-channel': 'BB-WEB',
        referer: `${BIGBASKET_ORIGIN}/`,
        cookie: cookieHeader,
      },
      timeoutMs: 6000,
    });
    if (headerResponse.httpStatus !== 200) return null;
    // Read the first `"eta"` string rather than walking the whole tree: the header payload nests it
    // under a service-area list whose shape varies by account state.
    const etaMatch = headerResponse.bodyText.match(/"eta"\s*:\s*"([^"]+)"/);
    return parseEtaMinutes(etaMatch?.[1]);
  } catch {
    // A missing ETA is cosmetic; never let it fail the search.
    return null;
  }
};

const normalizeBigBasketProduct = (rawProduct: Record<string, any>): NormalizedProduct | null => {
  const productName = cleanText(rawProduct?.desc);
  const platformProductId = String(rawProduct?.id ?? '');
  if (!productName || !platformProductId) return null;

  const discountBlock = rawProduct?.pricing?.discount ?? {};
  const relativeUrl = rawProduct?.absolute_url ?? '';

  return {
    productKey: `${PLATFORM_ID}:${platformProductId}`,
    platformProductId,
    platformId: PLATFORM_ID,
    productName,
    brandName: cleanText(rawProduct?.brand?.name),
    packSizeLabel: cleanText(rawProduct?.w),
    categoryName: cleanText(rawProduct?.category?.mlc_name ?? rawProduct?.category?.tlc_name),
    description: cleanText(rawProduct?.usp),
    imageUrlList: Array.isArray(rawProduct?.images)
      ? rawProduct.images
          .map((image: any) => image?.l ?? image?.m ?? image?.s)
          .filter((url: unknown): url is string => typeof url === 'string')
      : [],
    pricing: buildProductPricing({
      sellingPriceInRupees: parseRupeeAmount(discountBlock?.prim_price?.sp),
      maximumRetailPriceInRupees: parseRupeeAmount(discountBlock?.mrp),
      unitPriceLabel: discountBlock?.prim_price?.base_price
        ? `${discountBlock.prim_price.base_price}/${discountBlock.prim_price.base_unit}`
        : null,
    }),
    rating: rawProduct?.rating_info?.avg_rating
      ? {
          averageRating: parseRupeeAmount(rawProduct.rating_info.avg_rating),
          ratingCountLabel:
            rawProduct.rating_info.rating_count != null
              ? String(rawProduct.rating_info.rating_count)
              : null,
        }
      : null,
    checkIfInStock: rawProduct?.availability?.not_for_sale !== true,
    // BigBasket dropped `availability.short_eta` from this response — the old extractor still read
    // it, which is why every BigBasket product showed no delivery time. The store-level ETA from
    // the search response header block is filled in by the caller instead.
    deliveryEtaInMinutes: parseEtaMinutes(rawProduct?.availability?.short_eta),
    checkIfSponsored: rawProduct?.is_sponsored === true || Boolean(rawProduct?.ad_info),
    productWebUrl: relativeUrl ? `${BIGBASKET_ORIGIN}${relativeUrl}` : null,
  };
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

  if (!request.session) {
    return {
      ...baseResult,
      checkIfSucceeded: false,
      productList: [],
      totalProducts: 0,
      storeDeliveryEtaInMinutes: null,
      failureReason: 'sessionExpired',
      failureDetail: 'Could not mint a BigBasket cookie jar',
      elapsedMilliseconds: Date.now() - startedAt,
    };
  }

  try {
    const [searchResponse, storeDeliveryEtaInMinutes] = await Promise.all([
      fetchAsImpersonatedBrowser(request.transport, {
        platformId: PLATFORM_ID,
        url: `${BIGBASKET_ORIGIN}/listing-svc/v2/products?type=ps&slug=${encodeURIComponent(
          request.searchQuery,
        )}&page=1`,
        headerMap: {
          ...buildBrowserBaseHeaderMap(BIGBASKET_ORIGIN),
          'content-type': 'application/json',
          'x-channel': 'BB-WEB',
          referer: `${BIGBASKET_ORIGIN}/ps/?q=${encodeURIComponent(request.searchQuery)}`,
          cookie: request.session.cookieHeader,
        },
      }),
      fetchStoreDeliveryEtaInMinutes(request.session.cookieHeader, request.transport),
    ]);

    if (searchResponse.httpStatus !== 200) {
      return {
        ...baseResult,
        checkIfSucceeded: false,
        productList: [],
        totalProducts: 0,
        storeDeliveryEtaInMinutes: null,
        failureReason:
          searchResponse.httpStatus === 429
            ? 'rateLimited'
            : // A 404 from the SEARCH endpoint says the endpoint was not found, which is evidence
              // about our request or BigBasket's routing — not about whether BigBasket delivers to
              // the shopper. Observed 2026-10-20: Akamai answers a blocked request with 404 as
              // readily as with 403, so mapping it to `notServiceable` told the shopper their own
              // address was unserviceable whenever the block changed shape.
              searchResponse.httpStatus === 404
              ? 'unexpectedResponse'
              : 'blocked',
        failureDetail: `BigBasket answered HTTP ${searchResponse.httpStatus}`,
        elapsedMilliseconds: Date.now() - startedAt,
      };
    }

    const responseJson = JSON.parse(searchResponse.bodyText);
    const rawProductList = responseJson?.tabs?.[0]?.product_info?.products ?? [];
    const productList = rawProductList
      .map(normalizeBigBasketProduct)
      .filter((product: NormalizedProduct | null): product is NormalizedProduct => product !== null);

    return {
      ...baseResult,
      checkIfSucceeded: true,
      productList: productList.map((product: NormalizedProduct) => ({
        ...product,
        deliveryEtaInMinutes: product.deliveryEtaInMinutes ?? storeDeliveryEtaInMinutes,
      })),
      totalProducts: productList.length,
      storeDeliveryEtaInMinutes,
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
      failureReason: 'unexpectedResponse',
      failureDetail: error instanceof Error ? error.message : 'Unknown BigBasket error',
      elapsedMilliseconds: Date.now() - startedAt,
    };
  }
};

export const bigBasketAdapter: PlatformAdapter = {
  platformId: PLATFORM_ID,
  platformDisplayName: PLATFORM_DISPLAY_NAME,
  checkIfEnabled: true,
  checkIfRequiresSession: true,
  mintSession,
  // Akamai currently denies this IP outright — a real headless Chrome gets 'Access Denied' too —
  // so no transport ordering recovers it; only a proxy will (PRICE_TRACKER_BIGBASKET_PROXY_URL).
  // The ladder stays complete so a working client is re-discovered the moment the block lifts.
  transportLadder: ['impit', 'impitFirefox', 'cycletls'],
  // The delivery point is the `_bb_lat_long` cookie we set ourselves on every request.
  checkIfLocationNeedsVerification: false,
  searchProductList,
};
