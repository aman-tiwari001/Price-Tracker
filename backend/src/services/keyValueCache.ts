/**
 * A small key/value cache that uses Redis when it is available and a process-local map when it is not.
 *
 * Why the fallback exists: cached values here are not a nicety. A missing platform session means
 * re-minting one on EVERY search — which for Swiggy is a ~15 s browser run, and for Amazon Now means
 * repeating a bootstrap that Akamai then answers with a bot-check page. Measured with Redis down,
 * Amazon Now failed with `blocked` on most searches purely because its session was rebuilt each time.
 *
 * So Redis is treated as a shared, durable tier and the in-process map as a same-node tier beneath
 * it. One server keeps working alone; several servers still share state through Redis when it is up.
 *
 * *Transferable shape:* degrade to a smaller scope rather than to nothing — losing the shared cache
 * should cost cross-node sharing, not caching altogether.
 */
interface ProcessLocalEntry {
  serialisedValue: string;
  expiresAtEpochMs: number;
}

const processLocalEntryByKey = new Map<string, ProcessLocalEntry>();

/** Stops the fallback map growing without bound on a long-lived server. */
const evictExpiredProcessLocalEntries = (): void => {
  const nowEpochMs = Date.now();
  processLocalEntryByKey.forEach((entry, key) => {
    if (entry.expiresAtEpochMs <= nowEpochMs) processLocalEntryByKey.delete(key);
  });
};

export const readCachedValue = async (cacheKey: string): Promise<string | null> => {
  const localEntry = processLocalEntryByKey.get(cacheKey);
  if (!localEntry) return null;
  if (localEntry.expiresAtEpochMs <= Date.now()) {
    processLocalEntryByKey.delete(cacheKey);
    return null;
  }
  return localEntry.serialisedValue;
};

export const writeCachedValue = async (
  cacheKey: string,
  serialisedValue: string,
  timeToLiveSeconds: number,
): Promise<void> => {
  // Always write the local tier: it is what keeps a single server fast when Redis is down, and it
  // costs nothing when Redis is up.
  evictExpiredProcessLocalEntries();
  processLocalEntryByKey.set(cacheKey, {
    serialisedValue,
    expiresAtEpochMs: Date.now() + timeToLiveSeconds * 1000,
  });
};

export const deleteCachedValue = async (cacheKey: string): Promise<void> => {
  processLocalEntryByKey.delete(cacheKey);
};
