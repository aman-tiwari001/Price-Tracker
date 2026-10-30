/**
 * Runnable end-to-end check for every platform adapter.
 *
 * Hits the real platforms through the real `searchAcrossPlatforms` fan-out — no mocks — and prints
 * per-platform status, timing and a sample of normalised products, then asserts the things that
 * would silently break the app: a platform reporting success with unusable rows.
 *
 *   npx ts-node -r dotenv/config src/scripts/verifyPlatformSearch.ts <pincode> <lat> <lng> [query] [address]
 *
 * Example:
 *   npx ts-node -r dotenv/config src/scripts/verifyPlatformSearch.ts 122003 28.4419 77.0658 milk "Sector 45, Gurugram"
 *
 * The address matters: Zepto places the shopper by typing text into its own address picker, and a
 * synthetic string like "Pincode 122003" matches nothing, so Zepto silently falls back to a default
 * store and returns another city's catalogue. Pass the kind of address the app's reverse geocoder
 * produces. Exits non-zero when no platform returned products, so it is usable as a smoke test.
 */
import { SearchLocation } from '../platforms/types';
import { closeHeadlessBrowser, warmUpHeadlessBrowser } from '../services/headlessBrowserPool';
import { shutdownImpersonationClients } from '../services/httpImpersonationClient';
import { searchAcrossPlatforms } from '../services/productSearchService';

const [, , pincodeArgument, latitudeArgument, longitudeArgument, queryArgument, addressArgument] =
  process.argv;

const location: SearchLocation = {
  latitude: Number(latitudeArgument ?? 28.4419),
  longitude: Number(longitudeArgument ?? 77.0658),
  pincode: pincodeArgument ?? '122003',
  addressText: addressArgument ?? 'Sector 45, Gurugram',
};
const searchQuery = queryArgument ?? 'milk';

/** Counts rows that would render as a broken card in the app: no name, or no price at all. */
const countUnusableProducts = (
  productList: { productName: string; pricing: { sellingPriceInRupees: number | null } }[],
): number =>
  productList.filter(
    (product) => !product.productName || product.pricing.sellingPriceInRupees === null,
  ).length;

const run = async (): Promise<void> => {
  console.log(
    `\nSearching "${searchQuery}" at ${location.latitude},${location.longitude} (pincode ${location.pincode})\n`,
  );

  // Match the server's shape: it warms the browser at boot, so the fan-out never pays for a cold
  // Chromium launch while four HTTP adapters are already running.
  await warmUpHeadlessBrowser();

  const searchResponse = await searchAcrossPlatforms(searchQuery, location);

  console.log('PLATFORM             STATUS   PRODUCTS  TIME     CACHE  DETAIL');
  console.log('-'.repeat(100));
  searchResponse.platformResultList.forEach((platformResult) => {
    const statusLabel = platformResult.checkIfSucceeded ? 'OK     ' : 'FAILED ';
    console.log(
      `${platformResult.platformDisplayName.padEnd(20)} ${statusLabel} ${String(platformResult.totalProducts).padStart(8)}  ${String(platformResult.elapsedMilliseconds + 'ms').padStart(7)}  ${platformResult.checkIfServedFromCache ? 'hit  ' : 'miss '}  ${platformResult.failureReason ? `${platformResult.failureReason}: ${platformResult.failureDetail}` : ''}`,
    );
  });

  console.log(
    `\nTotal ${searchResponse.totalProductsAcrossPlatforms} products across platforms in ${searchResponse.elapsedMilliseconds} ms\n`,
  );

  let unusableProductTotal = 0;
  searchResponse.platformResultList
    .filter((platformResult) => platformResult.totalProducts > 0)
    .forEach((platformResult) => {
      console.log(
        `--- ${platformResult.platformDisplayName} (store ETA: ${platformResult.storeDeliveryEtaInMinutes ?? 'n/a'} min) ---`,
      );
      platformResult.productList.slice(0, 4).forEach((product, index) => {
        const { pricing } = product;
        console.log(
          `  ${index + 1}. ${product.productName.slice(0, 44).padEnd(44)} | ${String(product.packSizeLabel ?? '-').padEnd(12)} | Rs${String(pricing.sellingPriceInRupees ?? '-').padEnd(7)} mrp Rs${String(pricing.maximumRetailPriceInRupees ?? '-').padEnd(7)} | ${String(pricing.discountPercentage !== null ? pricing.discountPercentage + '% off' : '-').padEnd(8)} | eta ${String(product.deliveryEtaInMinutes ?? '-').padEnd(4)} | ${product.checkIfInStock ? 'in stock' : 'OUT'} | ${product.rating?.averageRating ?? '-'}`,
        );
      });
      const unusableCount = countUnusableProducts(platformResult.productList);
      unusableProductTotal += unusableCount;
      const imagelessCount = platformResult.productList.filter(
        (p) => p.imageUrlList.length === 0,
      ).length;
      console.log(
        `  quality: ${platformResult.totalProducts} rows, ${unusableCount} unusable (no name or no price), ${imagelessCount} without an image\n`,
      );
    });

  // ---- clubbing: the same product across platforms ----
  const comparableGroupList = searchResponse.matchedProductGroupList.filter(
    (group) => group.platformCount > 1,
  );
  console.log(
    `\nCLUBBED: ${comparableGroupList.length} products found on more than one platform (of ${searchResponse.matchedProductGroupList.length} distinct products)\n`,
  );
  comparableGroupList.slice(0, 12).forEach((group) => {
    const offerText = group.offerList
      .map(
        (offer) =>
          `${offer.platformDisplayName}=Rs${offer.sellingPriceInRupees}${offer.checkIfCheapest ? '*' : ''}`,
      )
      .join('  ');
    console.log(
      `  ${group.canonicalProductName.slice(0, 40).padEnd(40)} ${String(group.packSizeLabel).slice(0, 15).padEnd(15)} ${offerText}${group.maximumSavingInRupees ? `   save Rs${group.maximumSavingInRupees}` : ''}  [conf ${group.matchConfidence}]`,
    );
  });
  console.log('  (* = cheapest)\n');

  const succeededCount = searchResponse.platformResultList.filter(
    (platformResult) => platformResult.checkIfSucceeded && platformResult.totalProducts > 0,
  ).length;

  console.log(
    `RESULT: ${succeededCount}/${searchResponse.platformResultList.length} platforms returned products; ${unusableProductTotal} unusable rows overall.`,
  );

  if (succeededCount === 0) {
    console.error('FAIL: no platform returned any product.');
    process.exitCode = 1;
  }
};

run()
  .catch((error) => {
    console.error('Verification threw:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([shutdownImpersonationClients(), closeHeadlessBrowser()]);
  });
