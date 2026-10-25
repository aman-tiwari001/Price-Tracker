import { create } from 'zustand';
import { ShopperLocation } from '@/types';

/**
 * The shopper's delivery point, shared by the home and search screens.
 *
 * Holds the same `ShopperLocation` the API takes, so no screen has to reshape it — the previous
 * store kept a loose `address: any` and the home screen read `address.name`, `address.district`,
 * which rendered "null, null, null" whenever reverse geocoding returned a partial result.
 */
interface ShopperLocationStore {
  shopperLocation: ShopperLocation | null;
  checkIfFallbackUsed: boolean;
  updateShopperLocation: (location: ShopperLocation, checkIfFallbackUsed: boolean) => void;
  resetShopperLocation: () => void;
}

export const useLocationStore = create<ShopperLocationStore>((set) => ({
  shopperLocation: null,
  checkIfFallbackUsed: false,
  updateShopperLocation: (location, checkIfFallbackUsed) =>
    set({ shopperLocation: location, checkIfFallbackUsed }),
  resetShopperLocation: () => set({ shopperLocation: null, checkIfFallbackUsed: false }),
}));
