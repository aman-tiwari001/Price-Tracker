/**
 * Amazon Now.
 *
 * Transport: impit, no browser. Amazon Now has no JSON search API — the storefront is
 * server-rendered HTML at `amazon.in/s?k=<query>&i=nowstore`, so the product grid is parsed with
 * Cheerio. That is a deliberate choice, not a fallback: the HTML is the API here.
 *
 * Location: Amazon Now is PINCODE-scoped, not lat/lng-scoped like the other platforms. The session
 * is minted by posting the pincode to Amazon's "glow" location endpoint, which answers
 * `{"isValidAddress":1,"isAddressUpdated":1}` and sets the session cookies the search then reads.
 *
 * Serviceability is real and narrow. Measured 2026-09-15 for "milk": pincode 110001 (New Delhi)
 * returned 44 product cards; 560001 and 560034 (Bengaluru) returned zero with Amazon's own
 * "No results" copy. An empty result from this adapter usually means "Amazon Now does not serve
 * that pincode", which is why it reports `notServiceable` rather than pretending the search failed.
 *
 * Akamai Bot Manager occasionally answers with a `bm-verify` interstitial instead of the page; a
 * second request on the same session has cleared it in testing, so one retry is built in.
 */
import * as cheerio from 'cheerio';
import CONSTANTS from '../config/constant';
import {
  buildCookieHeaderFromSetCookieList,
  fetchAsImpersonatedBrowser,
} from '../services/httpImpersonationClient';
import { buildProductPricing, cleanText, parseRupeeAmount } from './normalizationHelpers';
import {
  NormalizedProduct,
  PlatformAdapter,
  PlatformAdapterResult,
  PlatformSearchRequest,
  PlatformSearchResult,
  PlatformSession,
  SearchLocation,
} from './types';

const PLATFORM_ID = 'amazonNow' as const;
const PLATFORM_DISPLAY_NAME = 'Amazon Now';
const AMAZON_ORIGIN = 'https://www.amazon.in';
/** Amazon's internal identifier for the Now storefront; both the URL slug and the link marker. */
const AMAZON_NOW_STORE_SLUG = 'nowstore';

const buildSearchUrl = (searchQuery: string): string =>
  `${AMAZON_ORIGIN}/s?k=${encodeURIComponent(searchQuery)}&i=${AMAZON_NOW_STORE_SLUG}`;

const buildDocumentHeaderMap = (cookieHeader: string): Record<string, string> => ({
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
  'upgrade-insecure-requests': '1',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1',
  ...(cookieHeader ? { cookie: cookieHeader } : {}),
});

/**
 * Amazon Now needs a six-digit pincode. Callers send coordinates, so fall back to a pincode the
 * caller supplied explicitly; without one this platform cannot be scoped and says so plainly.
 */
const resolvePincode = (location: SearchLocation): string | null => location.pincode ?? null;

const mintSession = async (
  location: SearchLocation,
  locationBucketKey: string,
): Promise<PlatformSession> => {
  const pincode = resolvePincode(location);
  if (!pincode) throw new Error('Amazon Now needs a pincode; none was supplied with the location');

  // Load the storefront once so Amazon issues session cookies to attach the pincode to.
  const bootstrapResponse = await fetchAsImpersonatedBrowser('impit', {
    url: buildSearchUrl('milk'),
    headerMap: buildDocumentHeaderMap(''),
  });
  const bootstrapCookieHeader = buildCookieHeaderFromSetCookieList(bootstrapResponse.setCookieList);

  const glowResponse = await fetchAsImpersonatedBrowser('impit', {
    url: `${AMAZON_ORIGIN}/portal-migration/hz/glow/address-change?actionSource=glow`,
    method: 'POST',
    headerMap: {
      accept: 'text/html,*/*',
      'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      origin: AMAZON_ORIGIN,
      referer: buildSearchUrl('milk'),
      cookie: bootstrapCookieHeader,
    },
    body: new URLSearchParams({
      locationType: 'LOCATION_INPUT',
      zipCode: pincode,
      storeContext: AMAZON_NOW_STORE_SLUG,
      deviceType: 'web',
      pageType: 'Search',
      actionSource: 'glow',
    }).toString(),
  });

  if (!glowResponse.bodyText.includes('"isAddressUpdated":1')) {
    throw new Error(`Amazon Now rejected pincode ${pincode}: ${glowResponse.bodyText.slice(0, 120)}`);
  }

  return {
    platformId: PLATFORM_ID,
    cookieHeader: buildCookieHeaderFromSetCookieList(
      [...bootstrapResponse.setCookieList, ...glowResponse.setCookieList],
    ),
    resolvedValueMap: { pincode },
    expiresAtEpochMs: Date.now() + CONSTANTS.PLATFORM_SESSION_TTL_SECONDS * 1000,
    locationBucketKey,
  };
};

const normalizeAmazonResultCard = (
  $: cheerio.CheerioAPI,
  cardElement: any,
): NormalizedProduct | null => {
  const card = $(cardElement);
  const platformProductId = card.attr('data-asin') ?? '';
  if (!platformProductId) return null;

  // Amazon's title lives in the h2 anchor; the first span inside it is sometimes the brand, so take
  // the longest span text, which is reliably the product name.
  const titleCandidateList = card
    .find('h2 span, h2 a span, [data-cy="title-recipe"] span')
    .toArray()
    .map((node) => $(node).text().trim())
    .filter(Boolean);
  const productName = cleanText(
    titleCandidateList.sort((left, right) => right.length - left.length)[0],
  );
  if (!productName) return null;

  const relativeHref = card.find('a.a-link-normal[href*="/dp/"]').first().attr('href') ?? '';
  const ratingText = card.find('[aria-label*="out of 5 stars"]').first().attr('aria-label') ?? '';

  return {
    productKey: `${PLATFORM_ID}:${platformProductId}`,
    platformProductId,
    platformId: PLATFORM_ID,
    productName,
    brandName: cleanText(card.find('.a-row .a-size-base-plus.a-color-base').first().text()),
    packSizeLabel: null,
    categoryName: null,
    description: null,
    imageUrlList: [card.find('img.s-image').first().attr('src')].filter(
      (url): url is string => typeof url === 'string',
    ),
    pricing: buildProductPricing({
      // The first `.a-price` on a card is the live price. Exclude `.a-text-price`, which Amazon
      // also uses for the struck-through MRP *and* for the per-unit rate.
      sellingPriceInRupees: parseRupeeAmount(
        card.find('.a-price:not(.a-text-price) .a-offscreen').first().text(),
      ),
      // Only a genuinely struck-through price is an MRP; `data-a-strike` distinguishes it from the
      // per-unit rate that shares the `.a-text-price` class.
      maximumRetailPriceInRupees: parseRupeeAmount(
        card.find('span[data-a-strike="true"] .a-offscreen').first().text(),
      ),
    }),
    rating: ratingText
      ? {
          averageRating: parseRupeeAmount(ratingText.split(' ')[0]),
          ratingCountLabel: cleanText(card.find('[data-csa-c-slot-id] .a-size-base').last().text()),
        }
      : null,
    // Amazon hides unbuyable items from this grid, so a rendered card is in stock unless it says
    // otherwise in its availability line.
    checkIfInStock: !/currently unavailable|out of stock/i.test(card.text()),
    deliveryEtaInMinutes: null,
    checkIfSponsored: /sponsored/i.test(card.find('.puis-sponsored-label-text').text()),
    productWebUrl: relativeHref
      ? `${AMAZON_ORIGIN}${relativeHref.replace(/&amp;/g, '&').split('/ref=')[0]}`
      : null,
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
  const buildFailure = (
    failureReason: PlatformSearchResult['failureReason'],
    failureDetail: string,
  ): PlatformAdapterResult => ({
    ...baseResult,
    checkIfSucceeded: false,
    productList: [],
    totalProducts: 0,
    storeDeliveryEtaInMinutes: null,
    failureReason,
    failureDetail,
    elapsedMilliseconds: Date.now() - startedAt,
  });

  if (!request.session) {
    return buildFailure(
      request.location.pincode ? 'sessionExpired' : 'notServiceable',
      request.location.pincode
        ? 'Could not mint an Amazon Now session'
        : 'Amazon Now is pincode-scoped and no pincode was supplied',
    );
  }

  try {
    const searchUrl = buildSearchUrl(request.searchQuery);
    /**
     * Akamai Bot Manager sometimes answers with a tiny `bm-verify` meta-refresh page instead of the
     * storefront. It is transient — a retry on the same session has cleared it every time in
     * testing — so retry a couple of times with a short pause before concluding anything.
     */
    const checkIfAkamaiInterstitial = (bodyText: string): boolean =>
      bodyText.includes('bm-verify') || bodyText.length < 50000;

    let searchResponse = await fetchAsImpersonatedBrowser(request.transport, {
      platformId: PLATFORM_ID,
      url: searchUrl,
      headerMap: buildDocumentHeaderMap(request.session.cookieHeader),
    });
    for (let retryCount = 0; retryCount < 2 && checkIfAkamaiInterstitial(searchResponse.bodyText); retryCount += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      searchResponse = await fetchAsImpersonatedBrowser(request.transport, {
        platformId: PLATFORM_ID,
        url: searchUrl,
        headerMap: buildDocumentHeaderMap(request.session.cookieHeader),
      });
    }

    if (searchResponse.httpStatus !== 200) {
      return buildFailure('blocked', `Amazon Now answered HTTP ${searchResponse.httpStatus}`);
    }
    // Distinguish "Amazon would not show us the page" from "Amazon does not serve this pincode".
    // Reporting a bot challenge as `notServiceable` would send us hunting a serviceability problem
    // that does not exist.
    if (checkIfAkamaiInterstitial(searchResponse.bodyText)) {
      return buildFailure(
        'blocked',
        'Amazon Now served an Akamai bot-check page instead of the storefront',
      );
    }

    const $ = cheerio.load(searchResponse.bodyText);
    const productList = $('[data-component-type="s-search-result"]')
      .toArray()
      .map((cardElement) => normalizeAmazonResultCard($, cardElement))
      .filter((product): product is NormalizedProduct => product !== null);

    if (productList.length === 0) {
      return buildFailure(
        'notServiceable',
        `Amazon Now returned no products for pincode ${request.session.resolvedValueMap.pincode}`,
      );
    }

    return {
      ...baseResult,
      checkIfSucceeded: true,
      // The glow call confirmed this pincode; echoing it lets the gate catch a stale session.
      resolvedLocationLabel: request.session.resolvedValueMap.pincode ?? null,
      productList,
      totalProducts: productList.length,
      storeDeliveryEtaInMinutes: null,
      failureReason: null,
      failureDetail: null,
      elapsedMilliseconds: Date.now() - startedAt,
    };
  } catch (error) {
    return buildFailure(
      'unexpectedResponse',
      error instanceof Error ? error.message : 'Unknown Amazon Now error',
    );
  }
};

export const amazonNowAdapter: PlatformAdapter = {
  platformId: PLATFORM_ID,
  platformDisplayName: PLATFORM_DISPLAY_NAME,
  /**
   * Disabled: Amazon Now stock is not reachable from `amazon.in/s`.
   *
   * Measured 2026-10-20 at Bengaluru 560001 and Gurugram 122003, with the delivery pincode
   * accepted by the glow endpoint (`"successful":1`) in both cases:
   *
   *   /s?k=milk&i=nowstore        HTTP 200    0 results    328 KB
   *   /s?k=milk                   HTTP 200   52 results   1.26 MB
   *   /s?k=milk&i=now             HTTP 200   52 results   <- ignored, same as unfiltered
   *   /s?k=milk&i=amazonnow       HTTP 200   52 results   <- ignored
   *   /s?k=milk&i=instant         HTTP 200   52 results   <- ignored
   *   /s?k=milk&i=quickcommerce   HTTP 200   52 results   <- ignored
   *   /now, /amazonnow            HTTP 200    0 results   legacy "Download Prime Now app" page
   *
   * Amazon answers an UNRECOGNISED `i=` value by ignoring it, so every alternative slug returns the
   * ordinary marketplace catalogue: multi-day delivery listings that would price in next to a
   * 10-minute quick-commerce basket and be wrong in a way the location gate cannot catch, because
   * the pincode matches either way. `nowstore` is the one slug Amazon recognises, and it is empty.
   * Reporting confirms Amazon Now is reached through the Amazon app, with no web storefront.
   *
   * Left enabled, it reported `notServiceable` — "Not delivering to this location" — at every
   * pincode, which tells the shopper something untrue about their address rather than about our
   * reach. Disabled is the honest state until the app's own endpoint is worked out; re-enabling is
   * one flag plus a working store filter, and `src/scripts/probeAmazonNowSlug.ts` re-runs the
   * measurement above.
   */
  checkIfEnabled: false,
  checkIfRequiresSession: true,
  mintSession,
  transportLadder: ['impit', 'impitFirefox', 'cycletls'],
  // The pincode lives in the session cookies, so which area was priced must be proved.
  checkIfLocationNeedsVerification: true,
  searchProductList,
};
