import axios from 'axios';
import { CONSTANTS } from '@/utils/constant';
import { ProductSearchApiResponse, ShopperLocation } from '@/types';

const searchApiClient = axios.create({
  baseURL: CONSTANTS.serverUrl,
  // A cold search fans out to five platforms and one of them drives a real browser, so the client
  // must outwait the server's own per-platform ceilings rather than aborting a search in progress.
  timeout: 90000,
});

/**
 * Runs one search across every platform.
 *
 * `pincode` is sent because Amazon Now is pincode-scoped rather than coordinate-scoped; without it
 * that platform reports `notServiceable` and the UI says so rather than showing a silent gap.
 */
export const searchProduct = async (
  searchQuery: string,
  location: ShopperLocation,
): Promise<ProductSearchApiResponse> => {
  const response = await searchApiClient.get<ProductSearchApiResponse>('/api/app/search', {
    params: {
      q: searchQuery,
      lat: location.latitude,
      lng: location.longitude,
      address: location.addressText,
      ...(location.pincode ? { pincode: location.pincode } : {}),
    },
  });
  return response.data;
};

/** Lists which platforms are switched on, so the UI can show placeholders for the rest. */
export const fetchPlatformList = async () => {
  const response = await searchApiClient.get('/api/app/platforms');
  return response.data;
};
