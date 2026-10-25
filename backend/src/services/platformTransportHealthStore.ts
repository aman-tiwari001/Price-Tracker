/**
 * Remembers which HTTP client last worked for each platform, so the server heals itself.
 *
 * The problem this exists to solve: a browser-impersonation fingerprint is a depreciating asset.
 * Blinkit worked over `impit` for a month and then started returning HTTP 403 from Cloudflare on
 * every request, while `cycletls` kept returning 200 with the same headers from the same IP in the
 * same minute. Without memory, recovering from that is a human reading logs and editing a constant.
 *
 * With memory, the fan-out starts each platform on its last known-good transport, falls through the
 * adapter's ladder when that fails, and writes the winner back. The next search starts on the
 * winner. No deploy, no constant to edit.
 *
 * *Transferable shape:* **remember the last thing that worked.** When a dependency's behaviour
 * drifts and the correct choice is discoverable by trying, persisting the discovery turns a
 * recurring outage into a one-request hiccup.
 */
import { ImpersonationTransport, PlatformId } from '../platforms/types';
import { readCachedValue, writeCachedValue } from './keyValueCache';

/**
 * How long a remembered transport is trusted before it is re-proved.
 *
 * Long, on purpose: the value is a hint, not a lock. A wrong hint costs one failed attempt and is
 * corrected immediately, while a short TTL would throw away hard-won knowledge for no benefit.
 */
const TRANSPORT_MEMORY_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PlatformTransportHealth {
  platformId: PlatformId;
  /** The transport that most recently produced products. */
  lastWorkingTransport: ImpersonationTransport | null;
  lastWorkingAtEpochMs: number | null;
  /** Consecutive failures per transport, used to report health rather than to gate attempts. */
  consecutiveFailureCountByTransport: Partial<Record<ImpersonationTransport, number>>;
  lastFailureDetail: string | null;
}

const buildHealthCacheKey = (platformId: PlatformId): string =>
  `priceTracker:transportHealth:${platformId}`;

const buildEmptyHealth = (platformId: PlatformId): PlatformTransportHealth => ({
  platformId,
  lastWorkingTransport: null,
  lastWorkingAtEpochMs: null,
  consecutiveFailureCountByTransport: {},
  lastFailureDetail: null,
});

export const readPlatformTransportHealth = async (
  platformId: PlatformId,
): Promise<PlatformTransportHealth> => {
  try {
    const storedJson = await readCachedValue(buildHealthCacheKey(platformId));
    if (!storedJson) return buildEmptyHealth(platformId);
    return { ...buildEmptyHealth(platformId), ...(JSON.parse(storedJson) as PlatformTransportHealth) };
  } catch {
    // Health is an optimisation. Losing it costs one extra ladder walk, never a wrong answer.
    return buildEmptyHealth(platformId);
  }
};

const writePlatformTransportHealth = async (health: PlatformTransportHealth): Promise<void> => {
  await writeCachedValue(
    buildHealthCacheKey(health.platformId),
    JSON.stringify(health),
    TRANSPORT_MEMORY_TTL_SECONDS,
  ).catch(() => undefined);
};

/**
 * Orders the transports to try: last known-good first, then the adapter's declared order.
 *
 * Returning the full ladder rather than just the remembered entry is deliberate — the remembered
 * one is only a starting guess, and the caller must still be able to fall through when it fails.
 */
export const buildTransportAttemptOrder = (
  declaredLadder: ImpersonationTransport[],
  health: PlatformTransportHealth,
): ImpersonationTransport[] => {
  const { lastWorkingTransport } = health;
  if (!lastWorkingTransport || !declaredLadder.includes(lastWorkingTransport)) {
    return declaredLadder;
  }
  return [lastWorkingTransport, ...declaredLadder.filter((t) => t !== lastWorkingTransport)];
};

export const recordTransportSuccess = async (
  platformId: PlatformId,
  transport: ImpersonationTransport,
): Promise<void> => {
  const health = await readPlatformTransportHealth(platformId);
  await writePlatformTransportHealth({
    ...health,
    lastWorkingTransport: transport,
    lastWorkingAtEpochMs: Date.now(),
    // Clear this transport's failure streak; a success is the end of that streak by definition.
    consecutiveFailureCountByTransport: {
      ...health.consecutiveFailureCountByTransport,
      [transport]: 0,
    },
    lastFailureDetail: null,
  });
};

export const recordTransportFailure = async (
  platformId: PlatformId,
  transport: ImpersonationTransport,
  failureDetail: string,
): Promise<void> => {
  const health = await readPlatformTransportHealth(platformId);
  await writePlatformTransportHealth({
    ...health,
    // A failure on the remembered transport clears the memory, so the next search does not keep
    // leading with a client the platform has started rejecting.
    lastWorkingTransport: health.lastWorkingTransport === transport ? null : health.lastWorkingTransport,
    consecutiveFailureCountByTransport: {
      ...health.consecutiveFailureCountByTransport,
      [transport]: (health.consecutiveFailureCountByTransport[transport] ?? 0) + 1,
    },
    lastFailureDetail: failureDetail.slice(0, 300),
  });
};
