/**
 * Decides whether a platform proved it priced against the shopper's area.
 *
 * Why this exists: platforms that bind a delivery store to a SESSION can silently fall back to a
 * default store when their address flow changes. Zepto did exactly that — a Gurugram search came
 * back full of Bengaluru-only brands (Nandini, Akshayakalpa) while the app presented them as local
 * prices. The address picker had failed, Zepto kept its default store, and nothing in the response
 * said so. Platforms that take raw coordinates on each request (Blinkit, BigBasket) cannot do this
 * and are verified by construction.
 *
 * The comparison is deliberately coarse. Platforms phrase the same place very differently —
 * "Block A - Block A, Gurugram, Haryana" for a request of "Sector 45, Gurugram" — so demanding a
 * string match would reject correct results. What actually distinguishes right from wrong here is
 * the CITY: a wrong store is wrong by hundreds of kilometres, never by a street name.
 *
 * *Transferable shape:* verify at the granularity the error actually occurs at. Checking something
 * finer than the failure mode produces false alarms; checking something coarser misses it entirely.
 */
import { SearchLocation } from '../platforms/types';

/**
 * Words that appear in almost every Indian address and so distinguish nothing.
 *
 * Without this list, "India" alone would match a Gurugram request to a Bengaluru store.
 */
const NON_DISTINGUISHING_TOKEN_SET = new Set([
  'india',
  'block',
  'sector',
  'phase',
  'road',
  'street',
  'marg',
  'nagar',
  'colony',
  'extension',
  'main',
  'cross',
  'near',
  'opposite',
  'floor',
  'tower',
  'building',
  'apartment',
  'society',
  'village',
  'po',
  'dist',
  'district',
  'city',
  'town',
  'area',
  'home',
  'house',
  'flat',
  'no',
  'number',
  'new',
  'old',
  'west',
  'east',
  'north',
  'south',
  'central',
]);

/**
 * Indian cities whose names the platforms spell differently.
 *
 * Needed because a platform may answer "Bangalore" where the request said "Bengaluru" — the same
 * city, and rejecting that would be a false alarm of exactly the kind this file must avoid.
 */
const CITY_ALIAS_GROUP_LIST: string[][] = [
  ['bengaluru', 'bangalore', 'blr'],
  ['gurugram', 'gurgaon'],
  ['mumbai', 'bombay'],
  ['delhi', 'newdelhi', 'ncr'],
  ['kolkata', 'calcutta'],
  ['chennai', 'madras'],
  ['pune', 'poona'],
  ['noida', 'gautambuddhnagar'],
  ['hyderabad', 'secunderabad'],
  ['ahmedabad', 'amdavad'],
];

/** Maps every alias to one canonical token so "Bangalore" and "Bengaluru" compare equal. */
const canonicalCityTokenByAlias = new Map<string, string>();
CITY_ALIAS_GROUP_LIST.forEach((aliasGroup) => {
  aliasGroup.forEach((alias) => canonicalCityTokenByAlias.set(alias, aliasGroup[0]));
});

/** Splits an address into comparable tokens, dropping the words that distinguish nothing. */
const buildComparableTokenSet = (addressText: string): Set<string> => {
  const tokenList = addressText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 2 && !NON_DISTINGUISHING_TOKEN_SET.has(token))
    // Pure numbers are house numbers and sector numbers; a six-digit pincode is handled separately.
    .filter((token) => !/^\d{1,5}$/.test(token))
    .map((token) => canonicalCityTokenByAlias.get(token) ?? token);
  return new Set(tokenList);
};

/** Pulls any six-digit Indian pincode out of free text. */
const readPincodeList = (text: string): string[] => text.match(/\b\d{6}\b/g) ?? [];

/**
 * How far the platform's own delivery point may sit from the shopper before it is a different place.
 *
 * 25 km is chosen to span a metropolitan serving area — a dark store several suburbs away is still
 * the right city and the right catalogue — while being far smaller than the error this guards
 * against, which is a store in another state (Gurugram vs Bengaluru is ~1,700 km).
 */
const MAXIMUM_PLAUSIBLE_STORE_DISTANCE_KM = 25;

/** Reads a "lat,lng" label, which is how Swiggy states the point it signed into its cookies. */
const parseCoordinateLabel = (
  label: string,
): { latitude: number; longitude: number } | null => {
  const match = label.trim().match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (!match) return null;
  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

/** Great-circle distance in kilometres. */
const measureDistanceInKm = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number => {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
};

/**
 * True when the platform's own stated delivery point is consistent with what was asked for.
 *
 * Returns FALSE when the platform states nothing: a platform that binds a store to a session and
 * will not say which store it bound has not proved anything, and this app treats unproven as
 * unusable rather than as probably-fine.
 */
export const checkIfResolvedLocationMatches = (
  resolvedLocationLabel: string | null,
  requestedLocation: SearchLocation,
): boolean => {
  if (!resolvedLocationLabel || resolvedLocationLabel.trim() === '') return false;

  // Coordinates are the most trustworthy thing a platform can state, because they cannot be phrased
  // differently the way a place name can. Distance settles it outright.
  const resolvedCoordinate = parseCoordinateLabel(resolvedLocationLabel);
  if (resolvedCoordinate) {
    return (
      measureDistanceInKm(resolvedCoordinate, {
        latitude: requestedLocation.latitude,
        longitude: requestedLocation.longitude,
      }) <= MAXIMUM_PLAUSIBLE_STORE_DISTANCE_KM
    );
  }

  // A matching pincode is conclusive on its own — it is the most precise thing either side states.
  const requestedPincode = requestedLocation.pincode;
  const resolvedPincodeList = readPincodeList(resolvedLocationLabel);
  if (requestedPincode && resolvedPincodeList.includes(requestedPincode)) return true;
  // A DIFFERENT stated pincode is conclusive the other way.
  if (requestedPincode && resolvedPincodeList.length > 0) return false;

  const requestedAddressText = requestedLocation.addressText;
  if (!requestedAddressText) {
    // Nothing to compare against beyond a pincode that was not stated; accept rather than invent a
    // mismatch, because the caller gave us no locality to check.
    return true;
  }

  const requestedTokenSet = buildComparableTokenSet(requestedAddressText);
  const resolvedTokenSet = buildComparableTokenSet(resolvedLocationLabel);

  // An empty RESOLVED set means the platform named nothing that distinguishes one place from
  // another — "India" is the real example — which is the same as naming nothing at all, so reject.
  // An empty REQUESTED set is different: WE gave it nothing to be checked against, and punishing
  // the platform for our own missing input would reject correct results.
  if (resolvedTokenSet.size === 0) return false;
  if (requestedTokenSet.size === 0) return true;

  // One shared distinguishing token — in practice the city — is enough. A wrong store is wrong by
  // city, so city agreement is the signal; street-level agreement is not available and not needed.
  return [...requestedTokenSet].some((token) => resolvedTokenSet.has(token));
};
