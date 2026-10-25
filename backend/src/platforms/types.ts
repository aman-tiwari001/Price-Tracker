/**
 * Shared contracts every quick-commerce platform adapter implements.
 *
 * One adapter per platform owns three things: how to reach that platform (transport +
 * whatever session credentials it demands), how to ask it for a search, and how to turn its
 * private response shape into `NormalizedProduct`. Nothing outside `src/platforms/` should
 * know a platform-specific field name.
 */

/**
 * How a platform's HTTP calls are made.
 *
 * Not a global setting: each platform's edge recognises a different client, and which one works
 * changes over time. Measured 2026-10-20 on Blinkit, same minute and headers: `impit` 403,
 * `cycletls` 200. Keeping this per-platform AND ordered is what lets the server recover on its own.
 */
export type ImpersonationTransport = 'impit' | 'impitFirefox' | 'cycletls';

/** Stable identifier for a platform. Used as a Redis key part, so it must never change casually. */
export type PlatformId =
  | 'blinkit'
  | 'zepto'
  | 'swiggyInstamart'
  | 'bigBasket'
  | 'flipkartMinutes'
  | 'amazonNow';

/** Where the shopper is. Quick commerce is hyperlocal, so every call carries this. */
export interface SearchLocation {
  latitude: number;
  longitude: number;
  /** Free-text address, used by platforms whose location picker takes text rather than coordinates. */
  addressText?: string;
  /** Six-digit Indian PIN code, used by the platforms that are pincode-scoped rather than lat/lng-scoped. */
  pincode?: string;
}

/** Money as the app speaks it: whole rupees, already resolved from each platform's own encoding. */
export interface ProductPricing {
  /** What the shopper actually pays right now. */
  sellingPriceInRupees: number | null;
  /** Printed maximum retail price, before any discount. */
  maximumRetailPriceInRupees: number | null;
  /** Absolute saving, derived as mrp - selling when both are known. */
  discountAmountInRupees: number | null;
  /** Saving as a percentage of MRP, rounded to a whole number. */
  discountPercentage: number | null;
  /** Platform's own price-per-unit string when it publishes one, e.g. "5.8/100 ml". */
  unitPriceLabel: string | null;
}

/** Customer rating, when the platform exposes one. */
export interface ProductRating {
  averageRating: number | null;
  /** Raw count as the platform renders it, e.g. "458.4k" — kept as text because platforms abbreviate. */
  ratingCountLabel: string | null;
}

/** One product as this app understands it, regardless of which platform it came from. */
export interface NormalizedProduct {
  /** Stable within a single response; built from platform id + the platform's own product id. */
  productKey: string;
  /** The platform's own identifier, useful for deep links and debugging. */
  platformProductId: string;
  platformId: PlatformId;
  productName: string;
  brandName: string | null;
  /** Pack size exactly as the platform states it, e.g. "1 L", "500 ml", "6 pieces". */
  packSizeLabel: string | null;
  categoryName: string | null;
  description: string | null;
  imageUrlList: string[];
  pricing: ProductPricing;
  rating: ProductRating | null;
  checkIfInStock: boolean;
  /** Delivery estimate in minutes when the platform gives one for this item or store. */
  deliveryEtaInMinutes: number | null;
  /** True when the platform marked this as a paid placement rather than an organic result. */
  checkIfSponsored: boolean;
  /** Opens the product on the platform's website. */
  productWebUrl: string | null;
}

/** Charges that apply to the basket rather than to any single product. */
export interface StoreLevelCharges {
  deliveryFeeInRupees: number | null;
  /** Platform's own label for its per-order handling/platform fee. */
  handlingFeeInRupees: number | null;
  /** Order value above which delivery is free, when the platform advertises one. */
  freeDeliveryThresholdInRupees: number | null;
  /** Anything else the platform showed, kept verbatim so nothing is silently dropped. */
  additionalChargeNoteList: string[];
}

/** Why a platform produced no products, so the client can say something true instead of "no results". */
export type PlatformFailureReason =
  | 'blocked'
  | 'sessionExpired'
  | 'rateLimited'
  | 'notServiceable'
  | 'requiresAuthentication'
  | 'timedOut'
  | 'unexpectedResponse'
  | 'notImplemented'
  /**
   * The platform answered with products, but could not prove they are for the shopper's area.
   *
   * This is its own reason because it is NOT a transport failure — retrying or changing transport
   * will not fix it, and the products are real, just possibly for the wrong store. Zepto silently
   * falls back to a default store when its address picker changes, and Swiggy falls back to an
   * IP-derived location; both used to be presented as local prices.
   */
  | 'locationUnverified';

/** What one adapter returns for one search. Always resolves — never throws past the service layer. */
export interface PlatformSearchResult {
  platformId: PlatformId;
  platformDisplayName: string;
  checkIfSucceeded: boolean;
  productList: NormalizedProduct[];
  totalProducts: number;
  /** Delivery estimate for the serving store, when the platform publishes one separately from products. */
  storeDeliveryEtaInMinutes: number | null;
  storeLevelCharges: StoreLevelCharges | null;
  failureReason: PlatformFailureReason | null;
  /** Human-readable detail for logs and for the client's empty state. Never a raw status code alone. */
  failureDetail: string | null;
  elapsedMilliseconds: number;
  /** True when this result came from Redis rather than a live platform call. */
  checkIfServedFromCache: boolean;
  /**
   * The delivery point the PLATFORM says it priced against, in its own words.
   *
   * Reported so a wrong-city result is visible instead of silent — a Gurugram search once came back
   * full of Bengaluru-only brands because Zepto had quietly kept a default store. `null` means the
   * platform does not state one.
   */
  resolvedLocationLabel: string | null;
  /**
   * True when the platform's own resolved location agrees with what was asked for.
   *
   * Platforms that take raw coordinates per request (Blinkit, BigBasket) are verified by
   * construction. Platforms that bind a store to a session (Zepto, Swiggy, Flipkart, Amazon) must
   * prove it, and an unverified result is kept out of the price comparison.
   */
  checkIfLocationVerified: boolean;
  /** Which transport produced this result, for health reporting and debugging. */
  transportUsed: ImpersonationTransport | 'headlessBrowser' | null;
}

/** Credentials a platform demands, minted in a browser and reused across many HTTP requests. */
export interface PlatformSession {
  platformId: PlatformId;
  /** Full `Cookie` header value, ready to send. */
  cookieHeader: string;
  /** Platform-specific identifiers resolved during minting, e.g. Zepto's store ids. */
  resolvedValueMap: Record<string, string>;
  /** Epoch milliseconds after which this session must be re-minted. */
  expiresAtEpochMs: number;
  /** Location bucket this session was minted for; a session is only valid near that point. */
  locationBucketKey: string;
}

/** Everything an adapter needs to run one search. */
export interface PlatformSearchRequest {
  searchQuery: string;
  location: SearchLocation;
  /** Present only for platforms whose `checkIfRequiresSession` is true. */
  session: PlatformSession | null;
  /**
   * Which HTTP client to use for this attempt, chosen by the fan-out from the adapter's ladder.
   *
   * The adapter does not pick its own transport any more. The caller does, because only the caller
   * knows which one succeeded last time and which have just failed.
   */
  transport: ImpersonationTransport;
}

/**
 * What an ADAPTER returns.
 *
 * Deliberately narrower than `PlatformSearchResult`: an adapter knows the products and, where the
 * platform states one, the delivery point it resolved. It does NOT know which transport the caller
 * picked for this attempt, nor whether the resolved location passed verification — those are the
 * fan-out's job. Splitting the two keeps six adapters from each having to restate three fields they
 * cannot determine.
 *
 * *Transferable shape:* let each layer report only what it can actually observe; completing the
 * record is the caller's responsibility.
 */
export type PlatformAdapterResult = Omit<
  PlatformSearchResult,
  'resolvedLocationLabel' | 'checkIfLocationVerified' | 'transportUsed'
> & {
  /** Set only by platforms that state which store/area they priced against. */
  resolvedLocationLabel?: string | null;
};

/** The interface every platform file exports. */
export interface PlatformAdapter {
  platformId: PlatformId;
  platformDisplayName: string;
  /** False disables the platform without deleting its code — used for the two not yet cracked. */
  checkIfEnabled: boolean;
  /** True when this platform needs a minted session before its search call will work. */
  checkIfRequiresSession: boolean;
  /**
   * Mints this platform's session. Required when `checkIfRequiresSession` is true.
   *
   * Some minters are pure HTTP (BigBasket only needs its homepage's `Set-Cookie` jar); others need
   * a browser (Swiggy's AWS WAF token and server-signed location cookies cannot be forged). The
   * adapter decides, so the caller never has to know which platforms are expensive.
   */
  mintSession?: (location: SearchLocation, locationBucketKey: string) => Promise<PlatformSession>;
  /**
   * Per-platform ceiling, overriding the global one.
   *
   * Needed because the platforms are not comparable: an HTTP adapter answers in ~300 ms, while a
   * browser-driven one must load a page, set a delivery address and wait for the app's own search
   * call. One global timeout either strangles the browser platforms or lets a hung HTTP call sit.
   */
  searchTimeoutMs?: number;
  /**
   * Transports to try for this platform, best-known first.
   *
   * The fan-out starts with whichever entry succeeded most recently (remembered in Redis) and walks
   * down this list on failure, then records the winner. That is what makes a burned fingerprint
   * self-healing: when Cloudflare learns `impit`, the next search falls through to `cycletls` and
   * every search after that starts there — with no code change and no deploy.
   *
   * Omit for platforms that do not make HTTP calls of their own (Zepto drives a browser).
   */
  transportLadder?: ImpersonationTransport[];
  /**
   * True when this platform binds a delivery store to a SESSION rather than reading coordinates off
   * each request, so its location has to be proved rather than assumed.
   */
  checkIfLocationNeedsVerification?: boolean;
  searchProductList: (request: PlatformSearchRequest) => Promise<PlatformAdapterResult>;
}
