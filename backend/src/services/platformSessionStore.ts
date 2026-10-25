/**
 * Caches the browser-minted credentials a platform demands, so minting stays rare.
 *
 * A session is scoped to a platform AND a ~1.1 km location cell, because the credentials encode
 * where the shopper is — Swiggy signs the coordinates into its cookies, so a Delhi session used from
 * Mumbai returns Delhi's store. Reusing one session across locations is exactly the bug the old
 * cache had, moved one layer down.
 */
import CONSTANTS from '../config/constant';
import { deleteCachedValue, readCachedValue, writeCachedValue } from './keyValueCache';
import { buildLocationBucketKey } from '../platforms/normalizationHelpers';
import { PlatformId, PlatformSession, SearchLocation } from '../platforms/types';

/** A cold start needs one browser run; N concurrent searches must not each start their own. */
const inFlightMintByKey = new Map<string, Promise<PlatformSession | null>>();

/**
 * Session cache key.
 *
 * The pincode is part of the key, not just the coordinate cell. Amazon Now and Flipkart Minutes are
 * PINCODE-scoped, and a session encodes the pincode it was minted with — so without this, a request
 * for 110001 was silently answered with a session minted for 122003 because both shared one ~1.1 km
 * cell, and the platform then reported "no products for 122003" to a shopper who asked about 110001.
 *
 * *Transferable shape:* a cache key must contain every dimension the cached value depends on —
 * the same rule that fixed the search cache, applied one layer down.
 */
const buildSessionRedisKey = (
  platformId: PlatformId,
  locationBucketKey: string,
  pincode: string | undefined,
): string =>
  `priceTracker:platformSession:${platformId}:${locationBucketKey}${pincode ? `:${pincode}` : ''}`;

const readSessionFromRedis = async (redisKey: string): Promise<PlatformSession | null> => {
  try {
    const storedJson = await readCachedValue(redisKey);
    if (!storedJson) return null;
    const session = JSON.parse(storedJson) as PlatformSession;
    // Redis TTL and the embedded expiry can disagree after a clock change; trust the stricter one.
    return session.expiresAtEpochMs > Date.now() ? session : null;
  } catch {
    return null;
  }
};

const writeSessionToRedis = async (redisKey: string, session: PlatformSession): Promise<void> => {
  try {
    await writeCachedValue(redisKey, JSON.stringify(session), CONSTANTS.PLATFORM_SESSION_TTL_SECONDS);
  } catch {
    // A session that cannot be cached still works for this request; it just costs another mint next
    // time. Never fail a search because Redis is unavailable.
  }
};

/** What a platform adapter supplies to mint its own session; it alone knows its login-free flow. */
export type PlatformSessionMinter = (
  location: SearchLocation,
  locationBucketKey: string,
) => Promise<PlatformSession>;

/**
 * Returns a usable session, minting one only when the cache is cold or the entry expired.
 *
 * Returns `null` rather than throwing when minting fails, so the caller reports one dead platform
 * instead of failing the whole search.
 */
export const getOrMintPlatformSession = async (
  platformId: PlatformId,
  location: SearchLocation,
  mintSession: PlatformSessionMinter,
): Promise<PlatformSession | null> => {
  const locationBucketKey = buildLocationBucketKey(location.latitude, location.longitude);
  const redisKey = buildSessionRedisKey(platformId, locationBucketKey, location.pincode);

  const cachedSession = await readSessionFromRedis(redisKey);
  if (cachedSession) return cachedSession;

  const inFlightMint = inFlightMintByKey.get(redisKey);
  if (inFlightMint) return inFlightMint;

  const mintPromise = (async (): Promise<PlatformSession | null> => {
    try {
      const mintedSession = await mintSession(location, locationBucketKey);
      await writeSessionToRedis(redisKey, mintedSession);
      return mintedSession;
    } catch (error) {
      console.error(
        `Failed to mint ${platformId} session for ${locationBucketKey}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      inFlightMintByKey.delete(redisKey);
    }
  })();

  inFlightMintByKey.set(redisKey, mintPromise);
  return mintPromise;
};

/**
 * Drops a session so the next search mints a fresh one.
 *
 * Called when a platform answers 401/403/429/202 — those mean "your credential is no longer good",
 * and without this the server would keep replaying a dead session until its TTL ran out.
 */
export const invalidatePlatformSession = async (
  platformId: PlatformId,
  location: SearchLocation,
): Promise<void> => {
  const locationBucketKey = buildLocationBucketKey(location.latitude, location.longitude);
  try {
    await deleteCachedValue(buildSessionRedisKey(platformId, locationBucketKey, location.pincode));
  } catch {
    // Nothing to do — an uncleared session simply expires on its own TTL.
  }
};
