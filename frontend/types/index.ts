/**
 * Shapes the backend actually returns from `GET /api/app/search`.
 *
 * Two views of the same search ship together:
 *   - `matchedProductGroupList` — the SAME product clubbed across platforms. This is the comparison.
 *   - `platformResultList`      — every platform's own list, plus why it failed when it did.
 *
 * The legacy per-platform keys (`blinkit`, `zepto`, `swiggyInstamart`, `bbNow`) are still sent for
 * backwards compatibility but the screens now read the two lists above.
 */

export interface ProductPricing {
  sellingPriceInRupees: number | null;
  maximumRetailPriceInRupees: number | null;
  discountAmountInRupees: number | null;
  discountPercentage: number | null;
  unitPriceLabel: string | null;
}

export interface NormalizedProduct {
  productKey: string;
  platformProductId: string;
  platformId: string;
  productName: string;
  brandName: string | null;
  packSizeLabel: string | null;
  categoryName: string | null;
  description: string | null;
  imageUrlList: string[];
  pricing: ProductPricing;
  rating: { averageRating: number | null; ratingCountLabel: string | null } | null;
  checkIfInStock: boolean;
  deliveryEtaInMinutes: number | null;
  checkIfSponsored: boolean;
  productWebUrl: string | null;
}

/** One platform's offer for a clubbed product. */
export interface MatchedPlatformOffer {
  platformId: string;
  platformDisplayName: string;
  productName: string;
  packSizeLabel: string | null;
  sellingPriceInRupees: number | null;
  maximumRetailPriceInRupees: number | null;
  discountPercentage: number | null;
  deliveryEtaInMinutes: number | null;
  checkIfInStock: boolean;
  imageUrl: string | null;
  productWebUrl: string | null;
  checkIfCheapest: boolean;
}

/** One product, with every platform that sells it. `platformCount` of 1 means nothing to compare. */
export interface MatchedProductGroup {
  groupKey: string;
  canonicalProductName: string;
  brandName: string | null;
  packSizeLabel: string | null;
  quantityInBaseUnit: number | null;
  unitClass: 'volume' | 'mass' | 'count' | 'unknown';
  packCount: number;
  imageUrl: string | null;
  offerList: MatchedPlatformOffer[];
  platformCount: number;
  cheapestPriceInRupees: number | null;
  dearestPriceInRupees: number | null;
  maximumSavingInRupees: number | null;
  /** 0-1. Below ~0.7 the club is a weaker guess and the card says so. */
  matchConfidence: number;
}

export interface PlatformSearchResult {
  platformId: string;
  platformDisplayName: string;
  checkIfSucceeded: boolean;
  totalProducts: number;
  storeDeliveryEtaInMinutes: number | null;
  failureReason: string | null;
  failureDetail: string | null;
  elapsedMilliseconds: number;
  checkIfServedFromCache: boolean;
  productList: NormalizedProduct[];
}

export interface ProductSearchResponseData {
  searchQuery: string;
  totalProductsAcrossPlatforms: number;
  comparableProductCount: number;
  elapsedMilliseconds: number;
  matchedProductGroupList: MatchedProductGroup[];
  platformResultList: PlatformSearchResult[];
}

export interface ProductSearchApiResponse {
  success: boolean;
  message: string;
  data: ProductSearchResponseData;
}

/** Where the shopper is. `pincode` is required by Amazon Now, which is pincode-scoped. */
export interface ShopperLocation {
  latitude: number;
  longitude: number;
  addressText: string;
  pincode: string | null;
}

/**
 * What the cart stores for one item.
 *
 * Deliberately a flat snapshot rather than a reference to a live product: prices move, and a cart
 * must show what the shopper actually chose at the moment they chose it.
 */
export interface CartProduct {
  productKey: string;
  productName: string;
  platformId: string;
  packSizeLabel: string | null;
  imageUrl: string | null;
  sellingPriceInRupees: number | null;
  maximumRetailPriceInRupees: number | null;
  productWebUrl: string | null;
}
