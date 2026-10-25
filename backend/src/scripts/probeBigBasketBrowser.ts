/**
 * Does a real browser reach BigBasket from this machine?
 *
 * `bigBasket.ts` uses HTTP impersonation (impit/CycleTLS) and has answered HTTP 403 on every
 * transport in the ladder. That leaves two very different diagnoses, and they need opposite fixes:
 *
 *   - the block is on the FINGERPRINT -> a real browser gets through, and the adapter should be
 *     rewritten browser-driven, exactly as `flipkartMinutes.ts` was on 2026-10-25
 *   - the block is on the IP ADDRESS  -> nothing a client does changes it, and only a different
 *     exit address (PRICE_TRACKER_BIGBASKET_PROXY_URL) helps
 *
 * This prints what Chromium itself sees, so the next step is chosen on evidence rather than on a
 * guess. It reads the page only; it does not attempt to answer any bot-verification challenge.
 *
 *   npx tsx src/scripts/probeBigBasketBrowser.ts 560001
 */
import { closeHeadlessBrowser, withBrowserPage } from '../services/headlessBrowserPool';

const BIGBASKET_ORIGIN = 'https://www.bigbasket.com';
const pincode = process.argv[2] ?? '560001';

const run = async (): Promise<void> => {
  const observation = await withBrowserPage(
    { permissionOrigin: BIGBASKET_ORIGIN, latitude: 12.9716, longitude: 77.5946 },
    async (page) => {
      const searchApiResponseList: { url: string; httpStatus: number }[] = [];
      page.on('response', (response) => {
        const url = response.url();
        if (url.includes('/listing-svc/') || url.includes('/product/') || url.includes('/api/')) {
          searchApiResponseList.push({ url: url.slice(0, 110), httpStatus: response.status() });
        }
      });

      const navigationResponse = await page
        .goto(`${BIGBASKET_ORIGIN}/ps/?q=milk`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        .catch(() => null);

      await new Promise((resolve) => setTimeout(resolve, 8000));

      const pageReading = await page.evaluate(() => ({
        title: document.title,
        bodyTextStart: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
        productCardCount: document.querySelectorAll(
          '[qa="product"], [class*="SKUDeck"], [class*="ProductCard"]',
        ).length,
      }));

      return {
        navigationStatus: navigationResponse?.status() ?? null,
        ...pageReading,
        searchApiResponseList: searchApiResponseList.slice(0, 12),
      };
    },
  );

  console.log(`\nnavigation HTTP status : ${observation.navigationStatus}`);
  console.log(`page title             : "${observation.title}"`);
  console.log(`product cards on page  : ${observation.productCardCount}`);
  console.log(`body text              : "${observation.bodyTextStart}"`);
  console.log('\nAPI/XHR responses the page itself made:');
  observation.searchApiResponseList.forEach((entry) =>
    console.log(`  HTTP ${entry.httpStatus}  ${entry.url}`),
  );
  if (observation.searchApiResponseList.length === 0) console.log('  (none seen)');

  const checkIfBrowserReachedCatalogue =
    observation.productCardCount > 0 && !/access denied/i.test(observation.bodyTextStart);
  console.log(
    `\nVERDICT: a real browser ${checkIfBrowserReachedCatalogue ? 'DOES' : 'does NOT'} reach the catalogue` +
      ` -> ${checkIfBrowserReachedCatalogue ? 'fingerprint block, rewrite browser-driven' : 'IP-level block, needs a different exit address'}`,
  );
  console.log(`(pincode argument ${pincode} is not yet applied; this probe tests reachability only)`);

  await closeHeadlessBrowser();
};

run().catch(async (error) => {
  console.error(error);
  await closeHeadlessBrowser().catch(() => undefined);
  process.exit(1);
});
