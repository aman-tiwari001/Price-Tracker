import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { ShopperLocation } from '@/types';

/**
 * A location to fall back to when the device will not give one.
 *
 * Needed because a search with no coordinates cannot be answered at all — quick commerce is
 * hyperlocal — and on web the browser's permission prompt is often declined. Without a fallback a
 * declined prompt leaves the shopper with five empty columns and no explanation, so this is a
 * product decision rather than a convenience; the UI always states when it was used.
 *
 * Configured through `EXPO_PUBLIC_FALLBACK_*` rather than written into this file, so a deployment
 * picks its own default city instead of inheriting whichever one a developer happened to test in.
 * The built-in values are a serviceable metro so a fresh clone still demonstrates a working app.
 */
export const FALLBACK_SHOPPER_LOCATION: ShopperLocation = {
  latitude: Number(process.env.EXPO_PUBLIC_FALLBACK_LATITUDE ?? 28.4419),
  longitude: Number(process.env.EXPO_PUBLIC_FALLBACK_LONGITUDE ?? 77.0658),
  addressText: process.env.EXPO_PUBLIC_FALLBACK_ADDRESS_TEXT ?? 'Sector 45, Gurugram',
  pincode: process.env.EXPO_PUBLIC_FALLBACK_PINCODE ?? '122003',
};

/** Turns Expo's reverse-geocode result into the single address string the platforms' pickers take. */
const buildAddressText = (address: Location.LocationGeocodedAddress | undefined): string => {
  if (!address) return '';
  // Zepto types this straight into its own address search box, so order it the way a person would:
  // locality first, then city. Nulls are dropped rather than rendered as "null, null".
  return [address.name, address.district, address.city, address.region]
    .filter((part): part is string => Boolean(part) && part !== 'null')
    .filter((part, index, partList) => partList.indexOf(part) === index)
    .join(', ');
};

/**
 * Reads the shopper's position, falling back rather than throwing.
 *
 * The previous version threw whenever permission was denied, which left the search screen with no
 * way to show anything at all. Returning a usable location with `checkIfFallbackUsed` lets the
 * screen be honest about it instead.
 */
export const getUserLocation = async (): Promise<
  ShopperLocation & { checkIfFallbackUsed: boolean }
> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ...FALLBACK_SHOPPER_LOCATION, checkIfFallbackUsed: true };
    }

    // `hasServicesEnabledAsync` is Android-only; calling it on web throws.
    if (Platform.OS === 'android') {
      const checkIfServicesEnabled = await Location.hasServicesEnabledAsync();
      if (!checkIfServicesEnabled) {
        await Location.enableNetworkProviderAsync().catch(() => undefined);
      }
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const addressList = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }).catch(() => []);
    const address = addressList[0];

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      addressText: buildAddressText(address) || FALLBACK_SHOPPER_LOCATION.addressText,
      pincode: address?.postalCode ?? null,
      checkIfFallbackUsed: false,
    };
  } catch {
    return { ...FALLBACK_SHOPPER_LOCATION, checkIfFallbackUsed: true };
  }
};
