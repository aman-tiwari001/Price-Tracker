/**
 * Small conversions every adapter needs, kept here so six platforms cannot each invent their own
 * rounding rule. Each platform encodes money differently — Blinkit sends the string "₹85", Swiggy
 * sends protobuf money `{units:"116"}`, BigBasket sends the string "77" — so parsing lives at the
 * edge of each adapter and the rest of the app only ever sees whole rupees.
 */
import { ProductPricing } from './types';

/** Pulls a rupee amount out of anything a platform might send: 85, "85", "₹85", "₹1,234.50". */
export const parseRupeeAmount = (rawValue: unknown): number | null => {
  if (rawValue === null || rawValue === undefined) return null;
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : null;
  if (typeof rawValue !== 'string') return null;
  const digitsOnly = rawValue.replace(/[^\d.]/g, '');
  if (digitsOnly === '') return null;
  const parsed = Number.parseFloat(digitsOnly);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Reads the first whole number out of a free-text ETA such as "8 mins", "Delivery in 12 minutes". */
export const parseEtaMinutes = (rawValue: unknown): number | null => {
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? Math.round(rawValue) : null;
  if (typeof rawValue !== 'string') return null;
  const match = rawValue.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
};

/**
 * Builds the pricing block, deriving discount rather than trusting each platform's own discount
 * label — platforms disagree on whether their percentage is of MRP or of an internal list price.
 */
export const buildProductPricing = (input: {
  sellingPriceInRupees: number | null;
  maximumRetailPriceInRupees: number | null;
  unitPriceLabel?: string | null;
}): ProductPricing => {
  const { sellingPriceInRupees } = input;
  /**
   * An MRP below the selling price is not an MRP.
   *
   * Amazon's search cards put a per-unit rate ("₹7.70/100 ml") in the same strikethrough markup as
   * the MRP, which made a ₹77 carton report an MRP of ₹7.70 and would have rendered a nonsensical
   * "90% off". Rejecting the impossible value here protects every platform, not just the one where
   * it was noticed — a guard at the shared helper beats a fix at one call site.
   */
  const maximumRetailPriceInRupees =
    input.maximumRetailPriceInRupees !== null &&
    sellingPriceInRupees !== null &&
    input.maximumRetailPriceInRupees < sellingPriceInRupees
      ? null
      : input.maximumRetailPriceInRupees;

  const checkIfDiscounted =
    sellingPriceInRupees !== null &&
    maximumRetailPriceInRupees !== null &&
    maximumRetailPriceInRupees > sellingPriceInRupees;

  const discountAmountInRupees = checkIfDiscounted
    ? Math.round((maximumRetailPriceInRupees - sellingPriceInRupees) * 100) / 100
    : null;

  return {
    sellingPriceInRupees,
    maximumRetailPriceInRupees,
    discountAmountInRupees,
    discountPercentage:
      checkIfDiscounted && maximumRetailPriceInRupees > 0
        ? Math.round((discountAmountInRupees! / maximumRetailPriceInRupees) * 100)
        : null,
    unitPriceLabel: input.unitPriceLabel ?? null,
  };
};

/** Strips tabs/newlines and collapses runs of whitespace, which HTML-derived text is full of. */
export const cleanText = (rawValue: unknown): string | null => {
  if (typeof rawValue !== 'string') return null;
  const cleaned = rawValue.replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned;
};

/**
 * Rounds a coordinate to a ~1.1 km grid cell.
 *
 * Every cache entry and every minted session is scoped to one of these cells. Without it, the cache
 * key would be the raw GPS fix, which is unique per user per search — the cache would never hit, and
 * sessions would be re-minted constantly. Three decimal places is the coarsest grid that still keeps
 * a shopper inside their own dark-store catchment, which is what makes prices and stock correct.
 */
export const buildLocationBucketKey = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(3)},${longitude.toFixed(3)}`;

/** Normalises a search term so "  Amul  MILK " and "amul milk" share one cache entry. */
export const normalizeSearchQuery = (searchQuery: string): string =>
  searchQuery.toLowerCase().replace(/\s+/g, ' ').trim();
