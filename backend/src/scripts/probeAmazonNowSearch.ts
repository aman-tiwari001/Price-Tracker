/**
 * Diagnostic probe for Amazon Now returning zero products.
 *
 * `amazonNow.ts` mints its session successfully and then parses `[data-component-type=
 * "s-search-result"]` out of the search HTML, but has returned no products at both Gurugram 122003
 * and Bengaluru 560001 — two cities Amazon Now serves — so the empty grid is about our request
 * rather than about coverage. This prints what the search page actually is: its size, whether it is
 * an Akamai interstitial, which result containers it carries, and what it says.
 *
 *   npx tsx src/scripts/probeAmazonNowSearch.ts 560001
 */
import * as cheerio from 'cheerio';
import {
  fetchAsImpersonatedBrowser,
  shutdownImpersonationClients,
} from '../services/httpImpersonationClient';

const AMAZON_ORIGIN = 'https://www.amazon.in';
const pincode = process.argv[2] ?? '560001';

/** Amazon sends its cookies across several `set-cookie` lines; the jar is their name=value pairs. */
const buildCookieHeader = (setCookieList: string[]): string =>
  setCookieList
    .map((setCookieLine) => setCookieLine.split(';')[0])
    .filter((pair) => pair.includes('='))
    .join('; ');

const describe = (label: string, html: string): void => {
  const $ = cheerio.load(html);
  const containerCountMap = {
    's-search-result': $('[data-component-type="s-search-result"]').length,
    'asin-divs': $('div[data-asin]').filter((_, el) => ($(el).attr('data-asin') ?? '') !== '').length,
    's-result-item': $('.s-result-item').length,
    'puis-card': $('[class*="puis-card-container"]').length,
    'a-section': $('div.a-section').length,
  };
  console.log(`\n--- ${label} ---`);
  console.log(`bytes=${html.length}  akamaiInterstitial=${html.includes('bm-verify')}`);
  console.log(`title="${($('title').text() || '').trim().slice(0, 90)}"`);
  console.log(`containers: ${JSON.stringify(containerCountMap)}`);
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 300);
  console.log(`body text: "${visibleText}"`);
};

const run = async (): Promise<void> => {
  // 1. Bootstrap, exactly as the adapter does, to collect a cookie jar.
  const bootstrapResponse = await fetchAsImpersonatedBrowser('impit', {
    platformId: 'amazonNow',
    url: `${AMAZON_ORIGIN}/s?k=milk&i=nowstore`,
    headerMap: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
      'upgrade-insecure-requests': '1',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
    },
  });
  const cookieHeader = buildCookieHeader(bootstrapResponse.setCookieList);
  console.log(`bootstrap: HTTP ${bootstrapResponse.httpStatus}, cookies=${cookieHeader.length} chars`);
  describe('bootstrap /s?k=milk&i=nowstore (no address set)', bootstrapResponse.bodyText);

  // 2. Set the delivery pincode through the glow endpoint.
  const glowResponse = await fetchAsImpersonatedBrowser('impit', {
    platformId: 'amazonNow',
    url: `${AMAZON_ORIGIN}/portal-migration/hz/glow/address-change?actionSource=glow`,
    method: 'POST',
    headerMap: {
      accept: 'text/html,*/*',
      'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      cookie: cookieHeader,
    },
    body: `locationType=LOCATION_INPUT&zipCode=${pincode}&storeContext=generic&deviceType=web&pageType=Search&actionSource=glow`,
  });
  console.log(`\nglow: HTTP ${glowResponse.httpStatus} -> ${glowResponse.bodyText.slice(0, 160)}`);
  const glowCookieHeader = buildCookieHeader([
    ...bootstrapResponse.setCookieList,
    ...glowResponse.setCookieList,
  ]);

  // 3. The three storefront spellings worth distinguishing: the Now store slug the adapter uses,
  //    the ordinary search with no store filter, and the Now storefront's own page.
  for (const [label, url] of [
    ['nowstore slug', `${AMAZON_ORIGIN}/s?k=milk&i=nowstore`],
    ['no store filter', `${AMAZON_ORIGIN}/s?k=milk`],
    ['amazon now storefront', `${AMAZON_ORIGIN}/now`],
  ] as const) {
    const response = await fetchAsImpersonatedBrowser('impit', {
      platformId: 'amazonNow',
      url,
      headerMap: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
        'upgrade-insecure-requests': '1',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        cookie: glowCookieHeader,
      },
    });
    describe(`${label} -> HTTP ${response.httpStatus} ${url}`, response.bodyText);
  }

  await shutdownImpersonationClients();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
