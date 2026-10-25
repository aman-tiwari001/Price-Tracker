/**
 * The list of platforms this app can search, and the only place that knows they exist.
 *
 * Adding a platform means writing one file next to this one and adding it here — the controller,
 * the fan-out service and the cache all work off this registry, so nothing else changes.
 */
import { amazonNowAdapter } from './amazonNow';
import { bigBasketAdapter } from './bigBasket';
import { blinkitAdapter } from './blinkit';
import { flipkartMinutesAdapter } from './flipkartMinutes';
import { swiggyInstamartAdapter } from './swiggyInstamart';
import { zeptoAdapter } from './zepto';
import { PlatformAdapter, PlatformId } from './types';

/**
 * Ordered cheapest-first by measured latency, so the slowest platform is started last and the
 * fan-out's overall wall clock is set by it rather than by scheduling order:
 *   Blinkit ~300 ms · BigBasket ~300 ms · Amazon Now ~1 s · Swiggy ~550 ms · Zepto (browser) ~10 s.
 */
export const platformAdapterList: PlatformAdapter[] = [
  blinkitAdapter,
  bigBasketAdapter,
  swiggyInstamartAdapter,
  amazonNowAdapter,
  zeptoAdapter,
  flipkartMinutesAdapter,
];

/**
 * Only the platforms that are expected to return products today.
 *
 * `PRICE_TRACKER_ENABLED_PLATFORM_ID_LIST` (comma-separated platform ids) narrows this further at
 * run time. It exists so one misbehaving platform can be switched off in production without a
 * deploy, and so a single platform can be isolated while diagnosing a fan-out problem.
 */
export const getEnabledPlatformAdapterList = (): PlatformAdapter[] => {
  const environmentOverride = process.env.PRICE_TRACKER_ENABLED_PLATFORM_ID_LIST;
  const allowedPlatformIdSet = environmentOverride
    ? new Set(
        environmentOverride
          .split(',')
          .map((platformId) => platformId.trim())
          .filter(Boolean),
      )
    : null;

  return platformAdapterList.filter(
    (adapter) =>
      adapter.checkIfEnabled &&
      (allowedPlatformIdSet === null || allowedPlatformIdSet.has(adapter.platformId)),
  );
};

export const findPlatformAdapter = (platformId: PlatformId): PlatformAdapter | undefined =>
  platformAdapterList.find((adapter) => adapter.platformId === platformId);
