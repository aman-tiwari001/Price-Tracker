import * as Location from 'expo-location';
import { ToastAndroid } from 'react-native';

type LatLng = {
  lat: number;
  lng: number;
  address?: any;
};


export const getUserLocation = async (): Promise<LatLng> => {
  try {
    // Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      ToastAndroid.show('Location permission denied.', ToastAndroid.LONG);
      throw new Error('Location permission denied');
    }

    // Check if location (GPS) is enabled
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      ToastAndroid.show('Please turn on location.', ToastAndroid.LONG);
      await Location.enableNetworkProviderAsync();
    }

    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    // Get the address from coordinates
    const addresses = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    const address = addresses[0];

    const { latitude, longitude } = location.coords;

    return { lat: latitude, lng: longitude, address };
  } catch (err: any) {
    ToastAndroid.show('Failed to get location.', ToastAndroid.LONG);
    throw new Error(err.message || 'Failed to get user location');
  }
};
