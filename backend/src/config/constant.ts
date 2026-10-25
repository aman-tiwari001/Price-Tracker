const readNumberFromEnv = (rawValue: string | undefined, fallbackValue: number): number => {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
};

const CONSTANTS = {
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  PORT: process.env.PORT || 5000,
  ROLE_TYPES: ['user', 'admin'],
  PERMISSIONS: [],

  /**
   * Display names keyed by platform id. Kept in sync with `src/platforms/registry.ts`, which is the
   * source of truth for which platforms actually run; this map exists because `models/user.ts`
   * stores a shopper's platform preference and needs a stable enum.
   */
  PLATFORMS: {
    blinkit: 'Blinkit',
    zepto: 'Zepto',
    swiggyInstamart: 'Swiggy Instamart',
    bigBasket: 'BB Now',
    flipkartMinutes: 'Flipkart Minutes',
    amazonNow: 'Amazon Now',
  },

  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: readNumberFromEnv(process.env.REDIS_PORT, 6379),

  /**
   * How long a cached platform search stays valid.
   *
   * Five minutes is the deliberate compromise: quick-commerce prices rarely move inside five
   * minutes, but traffic spikes do — and repeat searches in the same neighbourhood are exactly what
   * would otherwise get this server's IP rate-limited by the platforms.
   */
  SEARCH_CACHE_TTL_SECONDS: readNumberFromEnv(process.env.SEARCH_CACHE_TTL_SECONDS, 300),

  /**
   * How long a browser-minted platform session is reused before being re-minted.
   *
   * Swiggy's observed `aws-waf-token` lifetime was ~3 days; 12 hours leaves a wide safety margin so
   * a session is never used right up to its expiry, while still keeping browser launches rare.
   */
  PLATFORM_SESSION_TTL_SECONDS: readNumberFromEnv(process.env.PLATFORM_SESSION_TTL_SECONDS, 43200),

  /** Ceiling on one platform's search call before the fan-out gives up on it and reports a timeout. */
  PLATFORM_SEARCH_TIMEOUT_MS: readNumberFromEnv(process.env.PLATFORM_SEARCH_TIMEOUT_MS, 20000),

  PASS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/,
};

export default CONSTANTS;
