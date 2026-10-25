/**
 * Fans one shopper's query out to every enabled platform and returns whatever came back.
 *
 * Three properties matter here, in this order:
 *
 *  1. **One dead platform costs one column, never the whole answer.** The old controller used
 *     `Promise.all`, and because `fetchFromZepto` had no try/catch its throw rejected the aggregate
 *     and turned "three platforms worked" into HTTP 500. `Promise.allSettled` plus a per-adapter
 *     guard makes partial success the normal case.
 *
 *  2. **The server recovers from a burned fingerprint on its own.** Each platform declares a ladder
 *     of HTTP clients; this file starts with whichever one worked last, walks down on failure, and
 *     records the winner. When Cloudflare learned impit's Chrome profile, the fix became one failed
 *     attempt followed by permanent recovery — not a code change.
 *
 *  3. **A price is only shown when it is provably for the shopper's area.** Platforms that bind a
 *     store to a session can silently serve a default store; such a result is reported as
 *     `locationUnverified` and kept out of the comparison rather than presented as local truth.
 *
 * *Transferable shape:* a fan-out over independent sources must settle, not race to first failure —
 * and where the correct choice drifts, discover it by trying and remember what worked.
 */
import CONSTANTS from '../config/constant';
import { getEnabledPlatformAdapterList } from '../platforms/registry';
import {
  ImpersonationTransport,
  PlatformAdapter,
  PlatformAdapterResult,
  PlatformSearchResult,
  SearchLocation,
} from '../platforms/types';
import { buildMatchedProductGroupList, MatchedProductGroup } from './productMatchingService';
import {
  readCachedPlatformSearchResult,
  writeCachedPlatformSearchResult,
} from './searchCacheService';
import { getOrMintPlatformSession, invalidatePlatformSession } from './platformSessionStore';
import {
  buildTransportAttemptOrder,
  readPlatformTransportHealth,
  recordTransportFailure,
  recordTransportSuccess,
} from './platformTransportHealthStore';
import { checkIfResolvedLocationMatches } from './locationVerificationService';

/**
 * The only failure that means "the credential we hold is no longer good".
 *
 * `blocked` and `rateLimited` are deliberately NOT here: they are edge verdicts that a fresh
 * credential does not fix. Dropping the session on them produced a mint storm — Amazon Now's
 * transient Akamai bot-check invalidated its session, the next search re-ran the bootstrap, and the
 * bootstrap itself tripped the bot-check again.
 */
const SESSION_INVALIDATING_FAILURE_LIST = ['sessionExpired'];

/**
 * Failures worth trying the next transport for.
 *
 * `notServiceable` and `requiresAuthentication` are excluded on purpose: the platform answered and
 * told us something true about this location or account, so walking the ladder would burn three
 * requests to be told the same thing three times.
 */
const TRANSPORT_RETRYABLE_FAILURE_LIST = ['blocked', 'rateLimited', 'unexpectedResponse'];

export interface ProductSearchResponse {
  searchQuery: string;
  location: SearchLocation;
  platformResultList: PlatformSearchResult[];
  /**
   * The same product clubbed across platforms, cheapest offer first inside each group.
   * Built from the fan-out's own results, so it costs no extra platform traffic.
   */
  matchedProductGroupList: MatchedProductGroup[];
  /** True when at least one platform returned products — what the client uses to decide its UI. */
  checkIfAnyPlatformSucceeded: boolean;
  totalProductsAcrossPlatforms: number;
  elapsedMilliseconds: number;
}

/** Fills the fields only the fan-out can know, completing an adapter's narrower result. */
const completeAdapterResult = (
  adapterResult: PlatformAdapterResult,
  transportUsed: PlatformSearchResult['transportUsed'],
  checkIfLocationVerified: boolean,
): PlatformSearchResult => ({
  ...adapterResult,
  resolvedLocationLabel: adapterResult.resolvedLocationLabel ?? null,
  checkIfLocationVerified,
  transportUsed,
});

/** Builds a failure result for cases that never reached an adapter. */
const buildFanOutFailure = (
  adapter: PlatformAdapter,
  failureReason: PlatformSearchResult['failureReason'],
  failureDetail: string,
  elapsedMilliseconds: number,
): PlatformSearchResult => ({
  platformId: adapter.platformId,
  platformDisplayName: adapter.platformDisplayName,
  checkIfSucceeded: false,
  productList: [],
  totalProducts: 0,
  storeDeliveryEtaInMinutes: null,
  storeLevelCharges: null,
  failureReason,
  failureDetail,
  elapsedMilliseconds,
  checkIfServedFromCache: false,
  resolvedLocationLabel: null,
  checkIfLocationVerified: false,
  transportUsed: null,
});

/**
 * Drops repeated products from one platform's own result.
 *
 * Platforms do return the same item twice in a single response — Zepto was observed returning
 * variant `f1f1d95f-ada9-48f7-ab10-f094bb40337b` more than once for "milk", which surfaced in the
 * client as React's "two children with the same key" warning and lets React duplicate or omit rows.
 * Deduplicating where all six platforms converge fixes it once rather than in six adapters.
 */
const dropDuplicateProducts = (adapterResult: PlatformAdapterResult): PlatformAdapterResult => {
  const seenProductKeySet = new Set<string>();
  const uniqueProductList = adapterResult.productList.filter((product) => {
    if (seenProductKeySet.has(product.productKey)) return false;
    seenProductKeySet.add(product.productKey);
    return true;
  });
  return uniqueProductList.length === adapterResult.productList.length
    ? adapterResult
    : { ...adapterResult, productList: uniqueProductList, totalProducts: uniqueProductList.length };
};

/** Stops one slow platform from holding the whole fan-out past the configured ceiling. */
const runWithTimeout = async (
  adapter: PlatformAdapter,
  runSearch: () => Promise<PlatformSearchResult>,
): Promise<PlatformSearchResult> => {
  const startedAt = Date.now();
  const timeoutMs = adapter.searchTimeoutMs ?? CONSTANTS.PLATFORM_SEARCH_TIMEOUT_MS;
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<PlatformSearchResult>((resolve) => {
    timeoutHandle = setTimeout(
      () =>
        resolve(
          buildFanOutFailure(
            adapter,
            'timedOut',
            `${adapter.platformDisplayName} did not answer within ${timeoutMs} ms`,
            Date.now() - startedAt,
          ),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([runSearch(), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

/**
 * Runs one attempt against one platform with one transport, and decides what it proves.
 *
 * Returns the completed result plus whether the ladder should keep walking. A platform that answers
 * "not serviceable" has answered; only a transport-shaped failure justifies another attempt.
 */
const attemptOnePlatformTransport = async (
  adapter: PlatformAdapter,
  searchQuery: string,
  location: SearchLocation,
  transport: ImpersonationTransport,
  /** True on the one retry that follows a session refresh, so it cannot refresh again and loop. */
  checkIfSessionAlreadyRefreshed = false,
): Promise<{ searchResult: PlatformSearchResult; checkIfWorthRetryingAnotherTransport: boolean }> => {
  const session =
    adapter.checkIfRequiresSession && adapter.mintSession
      ? await getOrMintPlatformSession(adapter.platformId, location, adapter.mintSession)
      : null;

  const adapterResult = dropDuplicateProducts(
    await adapter.searchProductList({ searchQuery, location, session, transport }),
  );

  // A dead credential must be dropped now, or every request until its TTL replays it.
  if (
    !adapterResult.checkIfSucceeded &&
    adapterResult.failureReason &&
    SESSION_INVALIDATING_FAILURE_LIST.includes(adapterResult.failureReason) &&
    adapter.checkIfRequiresSession
  ) {
    await invalidatePlatformSession(adapter.platformId, location);

    /**
     * Retry ONCE with a freshly minted session, inside this same search.
     *
     * Invalidating alone only helps the NEXT search, so the shopper who triggered the discovery is
     * the one who pays for it with an empty column. The stale session fails in about 0.1 s, so the
     * retry is reached almost immediately and a fresh mint is the only real cost.
     *
     * Bounded to a single attempt on purpose: `amazonNow.ts` previously re-ran its bootstrap on
     * every failure, and the bootstrap itself re-tripped the bot check, turning one dead session
     * into a mint storm.
     */
    if (!checkIfSessionAlreadyRefreshed) {
      return attemptOnePlatformTransport(adapter, searchQuery, location, transport, true);
    }
  }

  const transportUsed: PlatformSearchResult['transportUsed'] = adapter.transportLadder
    ? transport
    : 'headlessBrowser';

  // Location gate: a platform that binds a store to a session must prove which store it used.
  if (adapterResult.checkIfSucceeded && adapter.checkIfLocationNeedsVerification) {
    const checkIfMatches = checkIfResolvedLocationMatches(
      adapterResult.resolvedLocationLabel ?? null,
      location,
    );
    if (!checkIfMatches) {
      return {
        searchResult: completeAdapterResult(
          {
            ...adapterResult,
            checkIfSucceeded: false,
            productList: [],
            totalProducts: 0,
            failureReason: 'locationUnverified',
            failureDetail:
              `${adapter.platformDisplayName} returned products but reported its delivery point as ` +
              `"${adapterResult.resolvedLocationLabel ?? 'unknown'}", which does not match ` +
              `"${location.addressText ?? location.pincode ?? 'the requested area'}"`,
          },
          transportUsed,
          false,
        ),
        // A wrong store is not a transport problem; another client would return the same store.
        checkIfWorthRetryingAnotherTransport: false,
      };
    }
  }

  return {
    searchResult: completeAdapterResult(adapterResult, transportUsed, true),
    checkIfWorthRetryingAnotherTransport:
      !adapterResult.checkIfSucceeded &&
      Boolean(adapterResult.failureReason) &&
      TRANSPORT_RETRYABLE_FAILURE_LIST.includes(adapterResult.failureReason as string),
  };
};

/**
 * Runs one platform: cache first, then walk its transport ladder until one works.
 * Always resolves — any throw becomes a described failure for that platform alone.
 */
const searchOnePlatform = async (
  adapter: PlatformAdapter,
  searchQuery: string,
  location: SearchLocation,
): Promise<PlatformSearchResult> => {
  const cachedResult = await readCachedPlatformSearchResult(
    adapter.platformId,
    location,
    searchQuery,
  );
  if (cachedResult) return cachedResult;

  return runWithTimeout(adapter, async () => {
    const startedAt = Date.now();
    // A browser-driven platform has no HTTP client to choose; give it one nominal attempt.
    const declaredLadder = adapter.transportLadder ?? ['impit'];
    const health = await readPlatformTransportHealth(adapter.platformId);
    const attemptOrder = adapter.transportLadder
      ? buildTransportAttemptOrder(declaredLadder, health)
      : declaredLadder;

    let lastResult: PlatformSearchResult | null = null;
    for (const transport of attemptOrder) {
      try {
        const { searchResult, checkIfWorthRetryingAnotherTransport } =
          await attemptOnePlatformTransport(adapter, searchQuery, location, transport);
        lastResult = { ...searchResult, elapsedMilliseconds: Date.now() - startedAt };

        if (searchResult.checkIfSucceeded) {
          if (adapter.transportLadder) {
            await recordTransportSuccess(adapter.platformId, transport);
          }
          await writeCachedPlatformSearchResult(location, searchQuery, lastResult);
          return lastResult;
        }

        if (adapter.transportLadder) {
          await recordTransportFailure(
            adapter.platformId,
            transport,
            searchResult.failureDetail ?? 'unknown failure',
          );
        }
        if (!checkIfWorthRetryingAnotherTransport) return lastResult;
      } catch (error) {
        const failureDetail = error instanceof Error ? error.message : 'Unknown adapter error';
        if (adapter.transportLadder) {
          await recordTransportFailure(adapter.platformId, transport, failureDetail);
        }
        lastResult = buildFanOutFailure(
          adapter,
          'unexpectedResponse',
          failureDetail,
          Date.now() - startedAt,
        );
      }
    }
    return (
      lastResult ??
      buildFanOutFailure(adapter, 'unexpectedResponse', 'No transport attempt ran', 0)
    );
  });
};

export const searchAcrossPlatforms = async (
  searchQuery: string,
  location: SearchLocation,
): Promise<ProductSearchResponse> => {
  const startedAt = Date.now();
  const adapterList = getEnabledPlatformAdapterList();

  const settledResultList = await Promise.allSettled(
    adapterList.map((adapter) => searchOnePlatform(adapter, searchQuery, location)),
  );

  const platformResultList = settledResultList.map((settled, index) =>
    settled.status === 'fulfilled'
      ? settled.value
      : buildFanOutFailure(
          adapterList[index],
          'unexpectedResponse',
          settled.reason instanceof Error
            ? settled.reason.message
            : 'Platform rejected unexpectedly',
          0,
        ),
  );

  return {
    searchQuery,
    location,
    platformResultList,
    // Only location-verified platforms enter the comparison. A price from an unproven store would
    // otherwise be averaged in as if it were local, which is the one error this app cannot afford.
    matchedProductGroupList: buildMatchedProductGroupList(
      platformResultList.filter((result) => result.checkIfLocationVerified),
    ),
    checkIfAnyPlatformSucceeded: platformResultList.some(
      (result) => result.checkIfSucceeded && result.totalProducts > 0,
    ),
    totalProductsAcrossPlatforms: platformResultList.reduce(
      (runningTotal, result) => runningTotal + result.totalProducts,
      0,
    ),
    elapsedMilliseconds: Date.now() - startedAt,
  };
};
