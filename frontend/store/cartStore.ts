import { create } from 'zustand';
import { IProduct } from '@/types';

interface CartItem {
  product: IProduct;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  incrementQuantity: (id: string) => void;
  decrementQuantity: (id: string) => void;
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const existingItem = state.items.find((i) => i.product.id === item.product.id);

      if (existingItem) {
        return {
          items: state.items.map((i) =>
            i.product.id === item.product.id ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      } else {
        return {
          items: [...state.items, { ...item, quantity: 1 }],
        };
      }
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.product.id !== id),
    })),

  clearCart: () => set({ items: [] }),

  incrementQuantity: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.product.id === id ? { ...item, quantity: item.quantity + 1 } : item,
      ),
    })),

  decrementQuantity: (id) =>
    set((state) => ({
      items: state.items
        .map((item) =>
          item.product.id === id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item,
        )
        .filter((item) => item.quantity > 0),
    })),
}));
