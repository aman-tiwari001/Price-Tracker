import { create } from 'zustand';
import { CartProduct } from '@/types';

interface CartLine {
  product: CartProduct;
  quantity: number;
}

interface CartStore {
  items: CartLine[];
  addItem: (product: CartProduct) => void;
  removeItem: (productKey: string) => void;
  clearCart: () => void;
  incrementQuantity: (productKey: string) => void;
  decrementQuantity: (productKey: string) => void;
}

/**
 * A per-platform shopping list held in memory.
 *
 * It is a LIST, not a real cart: this app cannot place orders on a shopper's behalf, so adding an
 * item records the choice and the deep link, and checkout happens on the platform's own site.
 *
 * NOT persisted, and that is a known gap rather than an oversight: a browser refresh or an app
 * restart empties the list. `zustand/middleware`'s `persist` over `AsyncStorage` was tried on
 * 2026-10-20 and backed out — Expo Router renders every route once in Node to produce static HTML,
 * AsyncStorage's web build is CommonJS, and Metro bundles the dependency even when the `require`
 * sits inside a function, so the whole app served "require is not defined in ES module scope"
 * instead of the cart. Doing it properly needs a platform-split module (`cartStorage.web.ts` and
 * `cartStorage.native.ts`) so the web bundle never references AsyncStorage at all.
 */
export const useCartStore = create<CartStore>((set) => ({
  items: [],

  addItem: (product) =>
    set((state) => {
      const existingLine = state.items.find((line) => line.product.productKey === product.productKey);
      return existingLine
        ? {
            items: state.items.map((line) =>
              line.product.productKey === product.productKey
                ? { ...line, quantity: line.quantity + 1 }
                : line,
            ),
          }
        : { items: [...state.items, { product, quantity: 1 }] };
    }),

  removeItem: (productKey) =>
    set((state) => ({
      items: state.items.filter((line) => line.product.productKey !== productKey),
    })),

  clearCart: () => set({ items: [] }),

  incrementQuantity: (productKey) =>
    set((state) => ({
      items: state.items.map((line) =>
        line.product.productKey === productKey ? { ...line, quantity: line.quantity + 1 } : line,
      ),
    })),

  decrementQuantity: (productKey) =>
    set((state) => ({
      items: state.items
        .map((line) =>
          line.product.productKey === productKey
            ? { ...line, quantity: line.quantity - 1 }
            : line,
        )
        .filter((line) => line.quantity > 0),
    })),
}));
