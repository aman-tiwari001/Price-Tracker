/**
 * Self-check for `productMatchingService`, using real product names captured from the live
 * platforms on 2026-09-15. No network, no mocks framework — run it and it either passes or names
 * the case it broke:
 *
 *   npx ts-node src/scripts/verifyProductMatching.ts
 *
 * The cases encode the rules that matter most: the same item across platforms MUST club, and two
 * different items that look superficially alike MUST NOT. The second kind is the important half —
 * a wrong merge shows a shopper a price that is not for the product they are looking at.
 */

import { NormalizedProduct, PlatformId, PlatformSearchResult } from '../platforms/types';
import { buildMatchedProductGroupList, parseQuantity } from '../services/productMatchingService';

let failureCount = 0;

const assertTrue = (checkIfPassed: boolean, caseDescription: string): void => {
  if (checkIfPassed) {
    console.log(`  PASS  ${caseDescription}`);
  } else {
    console.log(`  FAIL  ${caseDescription}`);
    failureCount += 1;
  }
};

// ---------------------------------------------------------------- quantity parsing
console.log('\nQuantity parsing — every platform writes pack size differently:');
const quantityCaseList: { label: string; expectedBaseUnit: number | null; expectedPackCount: number }[] = [
  { label: '1 ltr', expectedBaseUnit: 1000, expectedPackCount: 1 },
  { label: '1 L', expectedBaseUnit: 1000, expectedPackCount: 1 },
  { label: '1 pack (1 L)', expectedBaseUnit: 1000, expectedPackCount: 1 },
  { label: '500 ml', expectedBaseUnit: 500, expectedPackCount: 1 },
  { label: '1 pack (450 ml)', expectedBaseUnit: 450, expectedPackCount: 1 },
  { label: '500 ml x 4', expectedBaseUnit: 500, expectedPackCount: 4 },
  { label: '250 g', expectedBaseUnit: 250, expectedPackCount: 1 },
  { label: '1 kg', expectedBaseUnit: 1000, expectedPackCount: 1 },
  { label: '6 pieces', expectedBaseUnit: 6, expectedPackCount: 1 },
];
quantityCaseList.forEach((quantityCase) => {
  const parsed = parseQuantity(quantityCase.label);
  assertTrue(
    parsed.quantityInBaseUnit === quantityCase.expectedBaseUnit &&
      parsed.packCount === quantityCase.expectedPackCount,
    `"${quantityCase.label}" -> ${quantityCase.expectedBaseUnit} base units x${quantityCase.expectedPackCount} (got ${parsed.quantityInBaseUnit} x${parsed.packCount})`,
  );
});

assertTrue(
  parseQuantity('500 ml').unitClass !== parseQuantity('500 g').unitClass,
  '500 ml and 500 g are different unit classes, so they can never be clubbed',
);

// ---------------------------------------------------------------- clustering
const buildProduct = (
  platformId: PlatformId,
  productName: string,
  packSizeLabel: string | null,
  sellingPriceInRupees: number,
  brandName: string | null,
): NormalizedProduct => ({
  productKey: `${platformId}:${productName}`,
  platformProductId: productName,
  platformId,
  productName,
  brandName,
  packSizeLabel,
  categoryName: null,
  description: null,
  imageUrlList: ['https://example.test/image.jpg'],
  pricing: {
    sellingPriceInRupees,
    maximumRetailPriceInRupees: sellingPriceInRupees,
    discountAmountInRupees: null,
    discountPercentage: null,
    unitPriceLabel: null,
  },
  rating: null,
  checkIfInStock: true,
  deliveryEtaInMinutes: 12,
  checkIfSponsored: false,
  productWebUrl: 'https://example.test/product',
});

const buildPlatformResult = (
  platformId: PlatformId,
  platformDisplayName: string,
  productList: NormalizedProduct[],
): PlatformSearchResult => ({
  platformId,
  platformDisplayName,
  checkIfSucceeded: true,
  productList,
  totalProducts: productList.length,
  storeDeliveryEtaInMinutes: 12,
  storeLevelCharges: null,
  failureReason: null,
  failureDetail: null,
  elapsedMilliseconds: 100,
  checkIfServedFromCache: false,
  resolvedLocationLabel: 'Sector 45, Gurugram',
  checkIfLocationVerified: true,
  transportUsed: 'cycletls',
});

// Names below are verbatim from live responses; prices are the ones actually observed.
const platformResultList: PlatformSearchResult[] = [
  buildPlatformResult('blinkit', 'Blinkit', [
    buildProduct('blinkit', 'Amul Taaza Homogenised Toned Milk', '1 ltr', 77, 'Amul'),
    buildProduct('blinkit', 'Amul Gold Full Cream Milk', '500 ml', 36, 'Amul'),
    buildProduct('blinkit', 'Amul Taaza Toned Milk', '500 ml', 30, 'Amul'),
    buildProduct('blinkit', 'Country Delight Buffalo Fresh Milk', '450 ml', 55, 'Country Delight'),
  ]),
  buildPlatformResult('zepto', 'Zepto', [
    buildProduct('zepto', 'Amul Taaza Homogenised Toned Milk (Tetra Pack)', '1 pack (1 L)', 77, 'Amul'),
    buildProduct('zepto', 'Amul Gold Full Cream Milk', '1 pack (500 ml)', 38, 'Amul'),
    buildProduct('zepto', 'Humpy A2 Cow Fresh Milk | Pouch', '1 pack (500 ml)', 46, 'Humpy'),
  ]),
  buildPlatformResult('bigBasket', 'BB Now', [
    buildProduct('bigBasket', 'Taaza Homogenised Toned Milk', '1 L', 79, 'Amul'),
    buildProduct('bigBasket', 'Gold Full Cream Milk', '500 ml', 36, 'Amul'),
  ]),
  buildPlatformResult('swiggyInstamart', 'Swiggy Instamart', [
    buildProduct('swiggyInstamart', 'Amul Taaza Milky Milk', '500 ml x 4', 116, 'Amul'),
    buildProduct('swiggyInstamart', 'Amul Gold Full Cream Milk', '500 ml', 37, 'Amul'),
  ]),
];

const groupList = buildMatchedProductGroupList(platformResultList);

const findGroupContaining = (platformId: PlatformId, productName: string) =>
  groupList.find((group) =>
    group.offerList.some(
      (offer) => offer.platformId === platformId && offer.productName === productName,
    ),
  );

console.log('\nClubbing — the same product across platforms:');
const taazaOneLitreGroup = findGroupContaining('blinkit', 'Amul Taaza Homogenised Toned Milk');
assertTrue(
  Boolean(taazaOneLitreGroup) && taazaOneLitreGroup!.platformCount >= 2,
  `Amul Taaza Toned Milk 1 L clubs across platforms (found ${taazaOneLitreGroup?.platformCount ?? 0} platforms)`,
);
assertTrue(
  Boolean(
    taazaOneLitreGroup?.offerList.some(
      (offer) => offer.platformId === 'zepto' && offer.productName.includes('Tetra Pack'),
    ),
  ),
  'Zepto\'s "(Tetra Pack)" wording does not stop it clubbing with Blinkit\'s plain title',
);

const goldGroup = findGroupContaining('blinkit', 'Amul Gold Full Cream Milk');
assertTrue(
  Boolean(goldGroup) && goldGroup!.platformCount >= 3,
  `Amul Gold Full Cream Milk 500 ml clubs across 3+ platforms (found ${goldGroup?.platformCount ?? 0})`,
);
assertTrue(
  goldGroup?.cheapestPriceInRupees === 36 && goldGroup?.dearestPriceInRupees === 38,
  `cheapest/dearest computed correctly (got ${goldGroup?.cheapestPriceInRupees}/${goldGroup?.dearestPriceInRupees}, expected 36/38)`,
);
assertTrue(
  goldGroup?.offerList[0]?.checkIfCheapest === true &&
    goldGroup?.offerList[0]?.sellingPriceInRupees === 36,
  'the cheapest offer is flagged and sorted first',
);

console.log('\nRefusing wrong merges — the half that protects trust:');
assertTrue(
  findGroupContaining('blinkit', 'Amul Gold Full Cream Milk')?.groupKey !==
    findGroupContaining('blinkit', 'Amul Taaza Toned Milk')?.groupKey,
  'Amul Gold Full Cream and Amul Taaza Toned (same brand, same 500 ml) stay separate',
);
assertTrue(
  findGroupContaining('swiggyInstamart', 'Amul Taaza Milky Milk')?.groupKey !==
    findGroupContaining('blinkit', 'Amul Taaza Toned Milk')?.groupKey,
  'a 4-pack (500 ml x 4) never clubs with a single 500 ml',
);
assertTrue(
  findGroupContaining('zepto', 'Humpy A2 Cow Fresh Milk | Pouch')?.platformCount === 1,
  'a different brand (Humpy) at the same size stays on its own',
);
assertTrue(
  groupList.every(
    (group) => new Set(group.offerList.map((offer) => offer.platformId)).size === group.offerList.length,
  ),
  'no group ever holds two offers from the same platform',
);

console.log('\nGroups produced:');
groupList.forEach((group) => {
  console.log(
    `  [${group.platformCount} platform${group.platformCount > 1 ? 's' : ''}] ${group.canonicalProductName.slice(0, 46).padEnd(46)} ${String(group.packSizeLabel).padEnd(14)} ` +
      `${group.offerList.map((offer) => `${offer.platformDisplayName}=Rs${offer.sellingPriceInRupees}`).join(' · ')}` +
      `${group.maximumSavingInRupees ? `  (save Rs${group.maximumSavingInRupees})` : ''}`,
  );
});

console.log(
  failureCount === 0
    ? `\nAll matching checks passed (${groupList.length} groups).`
    : `\n${failureCount} matching check(s) FAILED.`,
);
process.exitCode = failureCount === 0 ? 0 : 1;
