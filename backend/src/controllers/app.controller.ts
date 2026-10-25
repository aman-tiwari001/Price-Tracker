import { Request, Response } from 'express';
import { getEnabledPlatformAdapterList, platformAdapterList } from '../platforms/registry';
import {
  NormalizedProduct,
  PlatformSearchResult,
  SearchLocation,
} from '../platforms/types';
import { searchAcrossPlatforms } from '../services/productSearchService';
import { readPlatformTransportHealth } from '../services/platformTransportHealthStore';
import { isValidLatLng } from '../utils/lat_lngValidator';
import { responseHandler } from '../utils/responseHandler';

/**
 * Maps a platform id to the key the existing React Native client already reads.
 *
 * The client at `frontend/app/search/index.tsx` destructures `res.data.blinkit`, `res.data.zepto`,
 * `res.data.swiggyInstamart` and `res.data.bbNow`. Those keys are kept verbatim so the app keeps
 * working without a frontend change, while the richer per-platform data ships alongside under
 * `platformResultList`.
 */
const LEGACY_RESPONSE_KEY_BY_PLATFORM_ID: Record<string, string> = {
  blinkit: 'blinkit',
  zepto: 'zepto',
  swiggyInstamart: 'swiggyInstamart',
  bigBasket: 'bbNow',
  amazonNow: 'amazonNow',
  flipkartMinutes: 'flipkartMinutes',
};

/** Reshapes one normalized product into the field names the current client expects. */
const buildLegacyProductShape = (product: NormalizedProduct) => ({
  id: product.productKey,
  name: product.productName,
  description: product.description ?? '',
  images: product.imageUrlList,
  prices: {
    sellingPrice: product.pricing.sellingPriceInRupees,
    mrp: product.pricing.maximumRetailPriceInRupees,
    discountPrice: product.pricing.discountAmountInRupees,
    discountPercentage: product.pricing.discountPercentage,
  },
  eta:
    product.deliveryEtaInMinutes !== null ? `${product.deliveryEtaInMinutes} mins` : 'Earliest',
  quantity: product.packSizeLabel ?? '',
  stockAvailability: product.checkIfInStock,
  brand: product.brandName ?? '',
  category: product.categoryName ?? '',
  ratings: product.rating
    ? { average: product.rating.averageRating, total: product.rating.ratingCountLabel }
    : undefined,
  webLink: product.productWebUrl ?? '',
  platform: product.platformId,
});

const buildLegacyPlatformBlock = (platformResult: PlatformSearchResult) => ({
  productList: platformResult.productList.map(buildLegacyProductShape),
  totalProducts: platformResult.totalProducts,
});

/**
 * GET /api/app/search
 *
 * Answers HTTP 200 whenever at least one platform replied, with a per-platform status block so the
 * client can say WHY a column is empty instead of showing a bare "no results". The previous version
 * returned HTTP 500 if any single platform threw, which discarded every other platform's products.
 */
export const searchProduct = async (req: Request, res: Response) => {
  try {
    const { q, lat, lng, address, pincode } = req.query;

    if (!q || !lat || !lng) {
      return responseHandler(res, 400, false, 'q, lat and lng are required');
    }
    if (!isValidLatLng(lat, lng)) {
      return responseHandler(res, 400, false, 'Invalid lat and lng values');
    }

    const searchQuery = String(q).trim();
    if (searchQuery === '') {
      return responseHandler(res, 400, false, 'q must not be empty');
    }

    const location: SearchLocation = {
      latitude: Number(lat),
      longitude: Number(lng),
      addressText: address ? String(address) : undefined,
      // Amazon Now is pincode-scoped rather than coordinate-scoped, so it is optional here and that
      // platform reports `notServiceable` with a clear reason when it is missing.
      pincode: pincode ? String(pincode) : undefined,
    };

    const searchResponse = await searchAcrossPlatforms(searchQuery, location);

    const legacyPlatformBlockMap: Record<string, unknown> = {};
    searchResponse.platformResultList.forEach((platformResult) => {
      const legacyKey = LEGACY_RESPONSE_KEY_BY_PLATFORM_ID[platformResult.platformId];
      if (legacyKey) legacyPlatformBlockMap[legacyKey] = buildLegacyPlatformBlock(platformResult);
    });
    // The client renders four fixed columns and would crash on a missing key, so every legacy key is
    // always present even when that platform is disabled or failed.
    Object.values(LEGACY_RESPONSE_KEY_BY_PLATFORM_ID).forEach((legacyKey) => {
      if (!legacyPlatformBlockMap[legacyKey]) {
        legacyPlatformBlockMap[legacyKey] = { productList: [], totalProducts: 0 };
      }
    });

    return responseHandler(res, 200, true, 'Products fetched successfully', {
      ...legacyPlatformBlockMap,
      searchQuery: searchResponse.searchQuery,
      totalProductsAcrossPlatforms: searchResponse.totalProductsAcrossPlatforms,
      // The same product clubbed across platforms — the actual price comparison. Sent alongside the
      // per-platform lists rather than replacing them, so an older client keeps working.
      matchedProductGroupList: searchResponse.matchedProductGroupList,
      comparableProductCount: searchResponse.matchedProductGroupList.filter(
        (group) => group.platformCount > 1,
      ).length,
      elapsedMilliseconds: searchResponse.elapsedMilliseconds,
      platformResultList: searchResponse.platformResultList.map((platformResult) => ({
        platformId: platformResult.platformId,
        resolvedLocationLabel: platformResult.resolvedLocationLabel,
        checkIfLocationVerified: platformResult.checkIfLocationVerified,
        transportUsed: platformResult.transportUsed,
        platformDisplayName: platformResult.platformDisplayName,
        checkIfSucceeded: platformResult.checkIfSucceeded,
        totalProducts: platformResult.totalProducts,
        storeDeliveryEtaInMinutes: platformResult.storeDeliveryEtaInMinutes,
        storeLevelCharges: platformResult.storeLevelCharges,
        failureReason: platformResult.failureReason,
        failureDetail: platformResult.failureDetail,
        elapsedMilliseconds: platformResult.elapsedMilliseconds,
        checkIfServedFromCache: platformResult.checkIfServedFromCache,
        productList: platformResult.productList,
      })),
    });
  } catch (error) {
    console.error('Unhandled error in searchProduct:', error);
    return responseHandler(res, 500, false, 'Failed to fetch data');
  }
};

/**
 * GET /api/app/platforms
 *
 * Lists which platforms are wired up and which are switched off, so the reason a platform is missing
 * is discoverable without reading the source.
 */
export const listPlatforms = async (_req: Request, res: Response) =>
  responseHandler(res, 200, true, 'Platforms listed successfully', {
    enabledPlatformIdList: getEnabledPlatformAdapterList().map((adapter) => adapter.platformId),
    platformList: platformAdapterList.map((adapter) => ({
      platformId: adapter.platformId,
      platformDisplayName: adapter.platformDisplayName,
      checkIfEnabled: adapter.checkIfEnabled,
      checkIfRequiresSession: adapter.checkIfRequiresSession,
    })),
  });

/**
 * GET /api/app/health
 *
 * Reports which HTTP client last worked for each platform and how many times each has failed since.
 *
 * Exists because platform access decays silently: Blinkit worked over impit for a month and then
 * started returning HTTP 403 on every request, and nothing surfaced that until a shopper saw an
 * empty column. This endpoint makes the decay observable before it becomes a complaint.
 */
export const reportPlatformHealth = async (_req: Request, res: Response) => {
  const healthList = await Promise.all(
    platformAdapterList.map(async (adapter) => {
      const health = await readPlatformTransportHealth(adapter.platformId);
      return {
        platformId: adapter.platformId,
        platformDisplayName: adapter.platformDisplayName,
        checkIfEnabled: adapter.checkIfEnabled,
        transportLadder: adapter.transportLadder ?? ['headlessBrowser'],
        lastWorkingTransport: health.lastWorkingTransport,
        lastWorkingAtEpochMs: health.lastWorkingAtEpochMs,
        consecutiveFailureCountByTransport: health.consecutiveFailureCountByTransport,
        lastFailureDetail: health.lastFailureDetail,
        checkIfLocationNeedsVerification: adapter.checkIfLocationNeedsVerification ?? false,
      };
    }),
  );
  return responseHandler(res, 200, true, 'Platform health reported', { healthList });
};
