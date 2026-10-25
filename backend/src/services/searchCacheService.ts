/**
 * Caches one platform's search result, keyed by platform + location cell + query.
 *
 * The old cache keyed on the query ALONE (`search:milk`) and guarded it with
 * `redis.geosearch(...) && cachedData`. `geosearch` resolves to `[]` when nothing matches, and `[]`
 * is truthy in JavaScript, so the location guard was dead code and the condition collapsed to
 * `if (cachedData)` — a shopper in Mumbai was served Delhi's prices for an hour. Putting the
 * location INTO the key makes that class of bug impossible rather than guarded against.
 *
 * *Transferable shape:* when correctness depends on a dimension, put the dimension in the key —
 * never in a conditional beside it.
 */
import CONSTANTS from '../config/constant';
import { readCachedValue, writeCachedValue } from './keyValueCache';
import { buildLocationBucketKey, normalizeSearchQuery } from '../platforms/normalizationHelpers';
import { PlatformId, PlatformSearchResult, SearchLocation } from '../platforms/types';

const buildSearchRedisKey = (
  platformId: PlatformId,
  location: SearchLocation,
  searchQuery: string,
): string => {
  const locationBucketKey = buildLocationBucketKey(location.latitude, location.longitude);
  // Amazon Now is pincode-scoped rather than coordinate-scoped, so its pincode must take part in
  // the key too — otherwise two different pincodes inside one 1.1 km cell would share an entry.
  const pincodePart = location.pincode ? `:${location.pincode}` : '';
  return `priceTracker:search:${platformId}:${locationBucketKey}${pincodePart}:${normalizeSearchQuery(searchQuery)}`;
};

export const readCachedPlatformSearchResult = async (
  platformId: PlatformId,
  location: SearchLocation,
  searchQuery: string,
): Promise<PlatformSearchResult | null> => {
  try {
    const storedJson = await readCachedValue(buildSearchRedisKey(platformId, location, searchQuery));
    if (!storedJson) return null;
    return { ...(JSON.parse(storedJson) as PlatformSearchResult), checkIfServedFromCache: true };
  } catch {
    // Redis being unavailable is a cache miss, never an error the shopper sees.
    return null;
  }
};

export const writeCachedPlatformSearchResult = async (
  location: SearchLocation,
  searchQuery: string,
  searchResult: PlatformSearchResult,
): Promise<void> => {
  // Only successful results are cached. Caching a failure would keep a platform dark for the whole
  // TTL after a single blip, which is the opposite of what a short TTL is for.
  if (!searchResult.checkIfSucceeded || searchResult.productList.length === 0) return;
  try {
    await writeCachedValue(
      buildSearchRedisKey(searchResult.platformId, location, searchQuery),
      JSON.stringify({ ...searchResult, checkIfServedFromCache: false }),
      CONSTANTS.SEARCH_CACHE_TTL_SECONDS,
    );
  } catch {
    // A result that cannot be cached is still returned to the shopper.
  }
};
