import { create } from 'zustand';

interface Location {
  lat: number;
  lng: number;
  address: any;
}

interface LocationStore {
  location: Location | null;
  getLocation: () => Location | null;
  updateLocation: (newLocation: Location) => void;
  resetLocation: () => void;
}

export const useLocationStore = create<LocationStore>((set, get) => ({
  location: null,
  
  getLocation: () => {
    return get().location;
  },
  
  updateLocation: (newLocation) => {
    set({ location: newLocation });
  },
  
  resetLocation: () => {
    set({ location: null });
  }
}));