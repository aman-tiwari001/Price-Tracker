import * as Location from 'expo-location';
import { ToastAndroid } from 'react-native';

type LatLng = {
  lat: number;
  lng: number;
};

export const getUserLocation = async (): Promise<LatLng> => {
  try {
    // Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      ToastAndroid.show('Location permission denied.', ToastAndroid.LONG)
      throw new Error('Location permission denied');
    }
    
    // Check if GPS is enabled
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      ToastAndroid.show('Please turn on GPS.', ToastAndroid.LONG)
      throw new Error('Location services are disabled. Please turn on GPS.');
    }
    
    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    
    const { latitude, longitude } = location.coords;
    return { lat: latitude, lng: longitude };
  } catch (err: any) {
    ToastAndroid.show('Failed to get location.', ToastAndroid.LONG)
    throw new Error(err.message || 'Failed to get user location');
  }
};
