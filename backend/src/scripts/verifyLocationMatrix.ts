/**
 * Runs the SAME query across several cities through the running server, and prints what each
 * platform returned, which delivery point it resolved, and whether prices actually differ by city.
 *
 * Why this exists: a price-comparison app's core promise is that the numbers are for the shopper's
 * own area. Two failure modes look identical from a single-city test — a platform quietly serving a
 * default store, and a platform serving the right store — and only a cross-city run separates them.
 * Identical prices for the same SKU in Gurugram and Bengaluru are the signal worth inspecting.
 *
 *   npx tsx src/scripts/verifyLocationMatrix.ts milk
 */
const SERVER_ORIGIN = process.env.PRICE_TRACKER_SERVER_ORIGIN ?? 'http://localhost:5000';
const searchQuery = process.argv[2] ?? 'milk';

interface CityUnderTest {
  cityLabel: string;
  pincode: string;
  latitude: number;
  longitude: number;
  addressText: string;
}

const CITY_UNDER_TEST_LIST: CityUnderTest[] = [
  {
    cityLabel: 'Gurugram',
    pincode: '122003',
    latitude: 28.4419,
    longitude: 77.0658,
    addressText: 'Sector 45, Gurugram',
  },
  {
    cityLabel: 'Bengaluru',
    pincode: '560001',
    latitude: 12.9716,
    longitude: 77.5946,
    addressText: 'MG Road, Bengaluru',
  },
  {
    cityLabel: 'New Delhi',
    pincode: '110001',
    latitude: 28.6315,
    longitude: 77.2167,
    addressText: 'Connaught Place, New Delhi',
  },
];

interface PlatformResultRow {
  platformId: string;
  platformDisplayName: string;
  checkIfSucceeded: boolean;
  totalProducts: number;
  checkIfLocationVerified: boolean;
  resolvedLocationLabel: string | null;
  failureReason: string | null;
  failureDetail: string | null;
  elapsedMilliseconds: number;
  productList: { productName: string; packSizeLabel: string | null; pricing: { sellingPriceInRupees: number | null } }[];
}

const searchOneCity = async (city: CityUnderTest): Promise<{ platformResultList: PlatformResultRow[]; totalElapsedMs: number }> => {
  const requestUrl =
    `${SERVER_ORIGIN}/api/app/search?q=${encodeURIComponent(searchQuery)}` +
    `&lat=${city.latitude}&lng=${city.longitude}&pincode=${city.pincode}` +
    `&address=${encodeURIComponent(city.addressText)}`;
  const startedAt = Date.now();
  const response = await fetch(requestUrl);
  const body = (await response.json()) as { data: { platformResultList: PlatformResultRow[] } };
  return { platformResultList: body.data.platformResultList, totalElapsedMs: Date.now() - startedAt };
};

/** The cheapest price for a product whose name contains `nameFragment`, or null if absent. */
const findPriceByNameFragment = (
  platformResult: PlatformResultRow,
  nameFragment: string,
): number | null => {
  const priceList = (platformResult.productList ?? [])
    .filter((product) => product.productName.toLowerCase().includes(nameFragment.toLowerCase()))
    .map((product) => product.pricing.sellingPriceInRupees)
    .filter((price): price is number => typeof price === 'number');
  return priceList.length === 0 ? null : Math.min(...priceList);
};

const run = async (): Promise<void> => {
  const resultByCityLabel = new Map<string, PlatformResultRow[]>();

  for (const city of CITY_UNDER_TEST_LIST) {
    console.log(`\n${'='.repeat(96)}\n${city.cityLabel} ${city.pincode} — "${searchQuery}"\n${'='.repeat(96)}`);
    const { platformResultList, totalElapsedMs } = await searchOneCity(city);
    resultByCityLabel.set(city.cityLabel, platformResultList);

    console.log(
      `${'PLATFORM'.padEnd(19)}${'STATUS'.padEnd(9)}${'ITEMS'.padEnd(7)}${'VERIFIED'.padEnd(10)}${'TIME'.padEnd(9)}DETAIL`,
    );
    console.log('-'.repeat(96));
    platformResultList.forEach((platformResult) => {
      const detail = platformResult.checkIfSucceeded
        ? (platformResult.resolvedLocationLabel ?? '').slice(0, 44)
        : `${platformResult.failureReason}: ${(platformResult.failureDetail ?? '').slice(0, 40)}`;
      console.log(
        platformResult.platformDisplayName.padEnd(19) +
          (platformResult.checkIfSucceeded ? 'OK' : 'FAILED').padEnd(9) +
          String(platformResult.totalProducts).padEnd(7) +
          String(platformResult.checkIfLocationVerified).padEnd(10) +
          `${Math.round(platformResult.elapsedMilliseconds / 100) / 10}s`.padEnd(9) +
          detail,
      );
    });
    const workingCount = platformResultList.filter((row) => row.checkIfSucceeded).length;
    console.log(`\n  ${workingCount}/${platformResultList.length} platforms, whole search ${Math.round(totalElapsedMs / 100) / 10}s`);
  }

  // Cross-city price comparison for a few well-known SKUs that exist nationally.
  console.log(`\n${'='.repeat(96)}\nCROSS-CITY PRICE CHECK — is the pricing really per-location?\n${'='.repeat(96)}`);
  const nameFragmentList = ['amul', 'mother dairy', 'nandini'];
  const cityLabelList = CITY_UNDER_TEST_LIST.map((city) => city.cityLabel);

  console.log(
    'PLATFORM / SKU'.padEnd(40) + cityLabelList.map((label) => label.padEnd(14)).join(''),
  );
  console.log('-'.repeat(96));

  const platformIdList = [
    ...new Set(
      [...resultByCityLabel.values()].flat().map((platformResult) => platformResult.platformId),
    ),
  ];

  platformIdList.forEach((platformId) => {
    nameFragmentList.forEach((nameFragment) => {
      const priceByCityList = cityLabelList.map((cityLabel) => {
        const platformResult = (resultByCityLabel.get(cityLabel) ?? []).find(
          (row) => row.platformId === platformId,
        );
        return platformResult ? findPriceByNameFragment(platformResult, nameFragment) : null;
      });
      if (priceByCityList.every((price) => price === null)) return;
      const distinctPriceCount = new Set(priceByCityList.filter((price) => price !== null)).size;
      console.log(
        `${platformId}/${nameFragment}`.padEnd(40) +
          priceByCityList.map((price) => (price === null ? '—' : `Rs${price}`).padEnd(14)).join('') +
          (distinctPriceCount > 1 ? ' <- differs by city' : ''),
      );
    });
  });

  console.log(
    '\nA row that differs by city proves the price came from that city\'s store. A row identical\n' +
      'everywhere is not proof of a bug — national MRP products genuinely cost the same — but the\n' +
      'resolved delivery point printed per city above is the real evidence.',
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
