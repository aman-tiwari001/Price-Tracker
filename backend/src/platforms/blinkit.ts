/**
 * Blinkit.
 *
 * Transport: impit. Blinkit sits behind Cloudflare Bot Management, which rejects any client whose
 * TLS handshake is not Chrome's — plain Node got HTTP 403 even while carrying cookies harvested
 * from a real browser, because a cookie rides at the HTTP layer and the fingerprint is decided
 * during the handshake before a single HTTP byte is sent. impit's Chrome impersonation returns
 * HTTP 200 with real products in ~300 ms, so Blinkit needs no browser and no session at all.
 *
 * What changed from the old adapter: it sent `GET /v1/layout/search?start=0&size=20&q=`, which now
 * returns 404. Sniffing the live site shows the call is a POST with different query parameters.
 */
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
  ImpersonationTransport,
  NormalizedProduct,
  PlatformAdapter,
  PlatformAdapterResult,
  PlatformSearchRequest,
  PlatformSearchResult,
  SearchLocation,
} from './types';

const PLATFORM_ID = 'blinkit' as const;
const PLATFORM_DISPLAY_NAME = 'Blinkit';
const BLINKIT_ORIGIN = 'https://blinkit.com';
const PRODUCT_CARD_WIDGET_TYPE = 'product_card_snippet_type_2';

/**
 * CycleTLS, not impit — changed 2026-10-20 after a month of drift.
 *
 * impit's Chrome profile started earning HTTP 403 from Cloudflare on every request. Measured the
 * same minute, same IP, same headers: impit-chrome 403, impit-firefox 200 (12 products), CycleTLS
 * 200 (12 products). So Cloudflare learned impit's specific TLS fingerprint; the User-Agent was not
 * the cause (403 at Chrome 134, 140, 143 and 146 alike).
 *
 * *Transferable shape:* a fingerprint is a depreciating asset — treat the transport as a swappable
 * setting per platform, never as a global constant, so recovery is one line rather than a rewrite.
 */
const BLINKIT_TRANSPORT = 'cycletls' as const;

/** Blinkit reads the delivery point from both headers and cookies; send both so the store resolves. */
const buildBlinkitHeaderMap = (location: SearchLocation, searchQuery: string) => ({
  ...buildBrowserBaseHeaderMap(BLINKIT_ORIGIN),
  'content-type': 'application/json',
  referer: `${BLINKIT_ORIGIN}/s/?q=${encodeURIComponent(searchQuery)}`,
  app_client: 'consumer_web',
  app_version: '1010101010',
  web_app_version: '1008010016',
  rn_bundle_version: '1009003012',
  lat: String(location.latitude),
  lon: String(location.longitude),
  access_token: 'null',
  cookie: [
    `gr_1_lat=${location.latitude}`,
    `gr_1_lon=${location.longitude}`,
    `gr_1_locality=${location.latitude}`,
    `gr_1_landmark=${encodeURIComponent(location.addressText ?? 'Home')}`,
  ].join('; '),
});

const buildProductWebUrl = (productName: string, platformProductId: string): string => {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${BLINKIT_ORIGIN}/prn/${slug}/prid/${platformProductId}`;
};

/**
 * Blinkit mixes paid placements into organic results — a search for "milk" led with a crisps advert
 * during testing. Sponsored cards carry an overlay badge whose image is Blinkit's ad marker.
 */
const checkIfSponsoredCard = (cardData: Record<string, any>): boolean =>
  Array.isArray(cardData.overlay_badges) &&
  cardData.overlay_badges.some((badge: any) => String(badge?.image?.url ?? '').includes('/ad'));

const normalizeBlinkitCard = (cardData: Record<string, any>): NormalizedProduct | null => {
  const productName = cleanText(cardData?.name?.text ?? cardData?.display_name?.text);
  const platformProductId = String(cardData?.product_id ?? cardData?.identity?.id ?? '');
  if (!productName || !platformProductId) return null;

  const imageUrlList: string[] = [];
  const primaryImageUrl = cardData?.image?.url;
  if (typeof primaryImageUrl === 'string') imageUrlList.push(primaryImageUrl);
  (cardData?.media_container?.items ?? []).forEach((mediaItem: any) => {
    const mediaUrl = mediaItem?.image?.url;
    if (typeof mediaUrl === 'string' && !imageUrlList.includes(mediaUrl)) imageUrlList.push(mediaUrl);
  });

  const ratingValue = cardData?.rating?.bar?.value;

  return {
    productKey: `${PLATFORM_ID}:${platformProductId}`,
    platformProductId,
    platformId: PLATFORM_ID,
    productName,
    brandName: cleanText(cardData?.brand_name?.text),
    packSizeLabel: cleanText(cardData?.variant?.text),
    categoryName: null,
    description: null,
    imageUrlList,
    pricing: buildProductPricing({
      sellingPriceInRupees: parseRupeeAmount(cardData?.normal_price?.text),
      maximumRetailPriceInRupees: parseRupeeAmount(cardData?.mrp?.text),
    }),
    rating:
      typeof ratingValue === 'number'
        ? {
            averageRating: Math.round(ratingValue * 10) / 10,
            ratingCountLabel: cleanText(cardData?.rating?.bar?.title?.text),
          }
        : null,
    // Blinkit states availability two ways and they can disagree on partially-stocked items; treat
    // a product as buyable only when neither signal says otherwise.
    checkIfInStock: cardData?.is_sold_out !== true && cardData?.product_state !== 'unavailable',
    deliveryEtaInMinutes: parseEtaMinutes(cardData?.eta_tag?.title?.text),
    checkIfSponsored: checkIfSponsoredCard(cardData),
    productWebUrl: buildProductWebUrl(productName, platformProductId),
  };
};

/**
 * Blinkit publishes the store's delivery estimate on a separate endpoint; product cards only carry
 * the word "earliest". Fetched alongside search so the client can show a real number of minutes.
 */
const fetchStoreDeliveryEtaInMinutes = async (
  location: SearchLocation,
  searchQuery: string,
  transport: ImpersonationTransport,
): Promise<number | null> => {
  try {
    const response = await fetchAsImpersonatedBrowser(transport, {
      platformId: PLATFORM_ID,
      url: `${BLINKIT_ORIGIN}/v1/consumerweb/eta`,
      headerMap: buildBlinkitHeaderMap(location, searchQuery),
      timeoutMs: 6000,
    });
    if (response.httpStatus !== 200) return null;
    return parseEtaMinutes(JSON.parse(response.bodyText)?.eta_in_minutes);
  } catch {
    // A missing ETA is cosmetic; never let it fail the search.
    return null;
  }
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

  try {
    const searchUrl = `${BLINKIT_ORIGIN}/v1/layout/search?q=${encodeURIComponent(
      request.searchQuery,
    )}&search_type=type_to_search`;

    const [searchResponse, storeDeliveryEtaInMinutes] = await Promise.all([
      fetchAsImpersonatedBrowser(request.transport, {
        platformId: PLATFORM_ID,
        url: searchUrl,
        method: 'POST',
        headerMap: buildBlinkitHeaderMap(request.location, request.searchQuery),
        body: JSON.stringify({ applied_filters: null, sort: '' }),
      }),
      fetchStoreDeliveryEtaInMinutes(request.location, request.searchQuery, request.transport),
    ]);

    if (searchResponse.httpStatus !== 200) {
      return {
        ...baseResult,
        checkIfSucceeded: false,
        productList: [],
        totalProducts: 0,
        storeDeliveryEtaInMinutes,
        failureReason: searchResponse.httpStatus === 429 ? 'rateLimited' : 'blocked',
        failureDetail: `Blinkit answered HTTP ${searchResponse.httpStatus}`,
        elapsedMilliseconds: Date.now() - startedAt,
      };
    }

    const snippetList = JSON.parse(searchResponse.bodyText)?.response?.snippets ?? [];
    const productList = snippetList
      .filter((snippet: any) => snippet?.widget_type === PRODUCT_CARD_WIDGET_TYPE)
      .map((snippet: any) => normalizeBlinkitCard(snippet?.data ?? {}))
      .filter((product: NormalizedProduct | null): product is NormalizedProduct => product !== null)
      .map((product: NormalizedProduct) => ({
        ...product,
        deliveryEtaInMinutes: product.deliveryEtaInMinutes ?? storeDeliveryEtaInMinutes,
      }));

    return {
      ...baseResult,
      checkIfSucceeded: true,
      productList,
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
      failureDetail: error instanceof Error ? error.message : 'Unknown Blinkit error',
      elapsedMilliseconds: Date.now() - startedAt,
    };
  }
};

export const blinkitAdapter: PlatformAdapter = {
  platformId: PLATFORM_ID,
  platformDisplayName: PLATFORM_DISPLAY_NAME,
  checkIfEnabled: true,
  checkIfRequiresSession: false,
  // CycleTLS first: measured 2026-10-20, impit's Chrome profile earns HTTP 403 from Cloudflare
  // while CycleTLS returns 200 with 12 products from the same IP in the same minute. The others
  // stay in the ladder so the server can re-discover them when Cloudflare's scoring shifts.
  transportLadder: ['cycletls', 'impitFirefox', 'impit'],
  // Blinkit reads lat/lon off every request, so its store cannot silently drift.
  checkIfLocationNeedsVerification: false,
  searchProductList,
};
