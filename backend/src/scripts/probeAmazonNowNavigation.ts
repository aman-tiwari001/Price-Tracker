/**
 * Looks for Amazon Now's web entry point in the top navigation, the way Amazon documents it.
 *
 * This supersedes `probeAmazonNowBrowser.ts`, whose conclusion ("no web surface") came from a
 * regex that could not have found it: it matched `minutes` (plural) and `10 min`, while Amazon's
 * own help page calls the control the "30-Minute Store" and its banner says "30-Minute Delivery" —
 * singular, so neither matched. The earlier run proved nothing.
 *
 * What this does instead: sets a delivery pincode through Amazon's own glow endpoint, then dumps
 * the ENTIRE top navigation and every link whose text or href looks quick-commerce-ish under a much
 * wider net, rather than asserting a guess about the wording.
 *
 * It also tries `storeContext=nowstore` on the glow call. `probeAmazonNowSlug.ts` measured
 * `/s?k=milk&i=nowstore` returning HTTP 200 with 0 results at 328 KB while every unrecognised slug
 * returned the unfiltered 1.24 MB catalogue — so `nowstore` IS a distinct, recognised store that
 * came back empty, which is a different problem from a store that does not exist.
 *
 *   npx tsx src/scripts/probeAmazonNowNavigation.ts 560001
 */
import { closeHeadlessBrowser, withBrowserPage } from '../services/headlessBrowserPool';

const AMAZON_ORIGIN = 'https://www.amazon.in';
const pincode = process.argv[2] ?? '560001';

/** Wide on purpose: the point is to find the wording, not to assume it. */
const QUICK_COMMERCE_TEXT_PATTERN =
  /minute|now|quick|instant|express|fast|fresh|daily|10\s*min|15\s*min|30\s*min/i;
const QUICK_COMMERCE_HREF_PATTERN =
  /nowstore|hyperlocal|quickcommerce|amazon-now|amazonnow|\/now|minute|instant|express|tez|dash/i;

const run = async (): Promise<void> => {
  const observation = await withBrowserPage(
    { permissionOrigin: AMAZON_ORIGIN, latitude: 12.9716, longitude: 77.5946 },
    async (page) => {
      await page.goto(AMAZON_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Set the delivery pincode from inside the page, so the call carries the page's own tokens.
      const glowOutcomeByStoreContext: Record<string, string> = {};
      for (const storeContext of ['generic', 'nowstore']) {
        glowOutcomeByStoreContext[storeContext] = await page.evaluate(
          async (deliveryPincode, context) => {
            try {
              const glowResponse = await fetch(
                '/portal-migration/hz/glow/address-change?actionSource=glow',
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                  body:
                    `locationType=LOCATION_INPUT&zipCode=${deliveryPincode}` +
                    `&storeContext=${context}&deviceType=web&pageType=Gateway&actionSource=glow`,
                },
              );
              return (await glowResponse.text()).slice(0, 110);
            } catch (error) {
              return `glow call failed: ${String(error)}`;
            }
          },
          pincode,
          storeContext,
        );
      }

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 7000));

      const pageReading = await page.evaluate(
        (textPatternSource, hrefPatternSource) => {
          const textPattern = new RegExp(textPatternSource, 'i');
          const hrefPattern = new RegExp(hrefPatternSource, 'i');

          /** Everything in the top nav, verbatim — no guessing at the wording. */
          const navigationTextList = [
            ...document.querySelectorAll(
              '#nav-main a, #nav-xshop a, #nav-belt a, header a, [id*="nav"] a',
            ),
          ]
            .map((anchor) => (anchor as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
            .filter((text) => text.length > 0 && text.length < 40);

          const matchingLinkList = [...document.querySelectorAll('a')]
            .map((anchor) => ({
              text: ((anchor as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
              href: (anchor.getAttribute('href') ?? '').slice(0, 130),
            }))
            .filter((link) => textPattern.test(link.text) || hrefPattern.test(link.href));

          return {
            deliveryLabel: (
              document.querySelector('#glow-ingress-line2')?.textContent ?? ''
            ).trim(),
            navigationTextList: [...new Set(navigationTextList)],
            matchingLinkList: matchingLinkList.slice(0, 40),
            checkIfPageMentionsMinuteStore: /\d+\s*-?\s*minute/i.test(document.body.innerText),
          };
        },
        QUICK_COMMERCE_TEXT_PATTERN.source,
        QUICK_COMMERCE_HREF_PATTERN.source,
      );

      return { glowOutcomeByStoreContext, ...pageReading };
    },
  );

  console.log(`\nglow storeContext=generic : ${observation.glowOutcomeByStoreContext.generic}`);
  console.log(`glow storeContext=nowstore: ${observation.glowOutcomeByStoreContext.nowstore}`);
  console.log(`\ndelivery label shown on page: "${observation.deliveryLabel}"`);
  console.log(
    `page text mentions "<n>-minute" anywhere: ${observation.checkIfPageMentionsMinuteStore}`,
  );

  console.log('\nEVERY top-navigation entry (verbatim):');
  console.log(
    observation.navigationTextList.length === 0
      ? '  (none read)'
      : observation.navigationTextList.map((text) => `  - ${text}`).join('\n'),
  );

  console.log('\nLinks matching the WIDE quick-commerce net:');
  observation.matchingLinkList.forEach((link) => console.log(`  "${link.text}" -> ${link.href}`));
  if (observation.matchingLinkList.length === 0) console.log('  (none)');

  await closeHeadlessBrowser();
};

run().catch(async (error) => {
  console.error(error);
  await closeHeadlessBrowser().catch(() => undefined);
  process.exit(1);
});
