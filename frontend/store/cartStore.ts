import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define a product type
export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
}

// Cart item includes quantity
export interface CartItem extends Product {
  quantity: number;
}

// Define store interface
interface CartStore {
  cart: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  increaseQuantity: (productId: string) => void;
  decreaseQuantity: (productId: string) => void;
  clearCart: () => void;
  getTotalItems: () => number;
}

// Create the store
const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      cart: [],

      addToCart: (product: Product) => {
        const cart = get().cart;
        const index = cart.findIndex(item => item.id === product.id);

        if (index !== -1) {
          cart[index].quantity += 1;
        } else {
          cart.push({ ...product, quantity: 1 });
        }

        set({ cart: [...cart] });
      },

      removeFromCart: (productId: string) => {
        const updatedCart = get().cart.filter(item => item.id !== productId);
        set({ cart: updatedCart });
      },

      increaseQuantity: (productId: string) => {
        const cart = get().cart.map(item =>
          item.id === productId ? { ...item, quantity: item.quantity + 1 } : item
        );
        set({ cart });
      },

      decreaseQuantity: (productId: string) => {
        const cart = get().cart
          .map(item =>
            item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
          )
          .filter(item => item.quantity > 0);
        set({ cart });
      },

      clearCart: () => set({ cart: [] }),

      getTotalItems: () =>
        get().cart.reduce((total, item) => total + item.quantity, 0),
    }),
    {
      name: 'cart-storage',
      storage: {
        getItem: async (name: string) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name: string, value: any): Promise<void> => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name: string): Promise<void> => {
          await AsyncStorage.removeItem(name);
        },
      },
    }
  )
);

export default useCartStore;
