/**
 * Finds the store filter that actually selects Amazon Now stock.
 *
 * `probeAmazonNowSearch.ts` established that `i=nowstore` returns HTTP 200 with zero results while
 * the unfiltered search returns 52 — Amazon answers an unknown `i=` value with an empty grid rather
 * than an error, so a stale slug looks exactly like "not serviceable here". This tries the
 * candidate spellings and prints which one carries stock.
 *
 * Falling back to the unfiltered search is NOT an option: those are ordinary marketplace listings
 * with multi-day delivery, and pricing them next to a 10-minute quick-commerce basket would be
 * wrong in a way the location gate cannot catch, because the pincode matches either way.
 *
 *   npx tsx src/scripts/probeAmazonNowSlug.ts 560001
 */
import * as cheerio from 'cheerio';
import {
  fetchAsImpersonatedBrowser,
  shutdownImpersonationClients,
} from '../services/httpImpersonationClient';

const AMAZON_ORIGIN = 'https://www.amazon.in';
const pincode = process.argv[2] ?? '560001';

const buildCookieHeader = (setCookieList: string[]): string =>
  setCookieList
    .map((setCookieLine) => setCookieLine.split(';')[0])
    .filter((pair) => pair.includes('='))
    .join('; ');

const documentHeaderMap = (cookieHeader: string): Record<string, string> => ({
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
  'upgrade-insecure-requests': '1',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1',
  ...(cookieHeader ? { cookie: cookieHeader } : {}),
});

const run = async (): Promise<void> => {
  const bootstrapResponse = await fetchAsImpersonatedBrowser('impit', {
    platformId: 'amazonNow',
    url: `${AMAZON_ORIGIN}/s?k=milk`,
    headerMap: documentHeaderMap(''),
  });
  const glowResponse = await fetchAsImpersonatedBrowser('impit', {
    platformId: 'amazonNow',
    url: `${AMAZON_ORIGIN}/portal-migration/hz/glow/address-change?actionSource=glow`,
    method: 'POST',
    headerMap: {
      accept: 'text/html,*/*',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      cookie: buildCookieHeader(bootstrapResponse.setCookieList),
    },
    body: `locationType=LOCATION_INPUT&zipCode=${pincode}&storeContext=generic&deviceType=web&pageType=Search&actionSource=glow`,
  });
  const cookieHeader = buildCookieHeader([
    ...bootstrapResponse.setCookieList,
    ...glowResponse.setCookieList,
  ]);
  console.log(`address set for ${pincode}: ${glowResponse.bodyText.includes('"successful":1')}\n`);

  const candidateUrlList = [
    `${AMAZON_ORIGIN}/s?k=milk&i=nowstore`,
    `${AMAZON_ORIGIN}/s?k=milk&i=now`,
    `${AMAZON_ORIGIN}/s?k=milk&i=amazonnow`,
    `${AMAZON_ORIGIN}/s?k=milk&i=instant`,
    `${AMAZON_ORIGIN}/s?k=milk&i=quickcommerce`,
    `${AMAZON_ORIGIN}/s?k=milk&i=grocery`,
    `${AMAZON_ORIGIN}/s?k=milk&i=pantry`,
    `${AMAZON_ORIGIN}/amazonnow`,
    `${AMAZON_ORIGIN}/now`,
    `${AMAZON_ORIGIN}/fresh`,
  ];

  for (const url of candidateUrlList) {
    const response = await fetchAsImpersonatedBrowser('impit', {
      platformId: 'amazonNow',
      url,
      headerMap: documentHeaderMap(cookieHeader),
    }).catch(() => null);
    if (!response) {
      console.log(`${url.padEnd(58)} -> request failed`);
      continue;
    }
    const $ = cheerio.load(response.bodyText);
    const resultCount = $('[data-component-type="s-search-result"]').length;
    const title = ($('title').text() || '').trim().slice(0, 55);
    console.log(
      `${url.replace(AMAZON_ORIGIN, '').padEnd(45)} HTTP ${response.httpStatus}  results=${String(
        resultCount,
      ).padStart(3)}  bytes=${String(response.bodyText.length).padStart(7)}  "${title}"`,
    );
  }

  await shutdownImpersonationClients();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
