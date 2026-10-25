import { IProduct } from '../types/schema';
import { jaccardIndex } from './jaccard';

const unitMap: Record<string, number> = {
  ml: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
  g: 1,
  kg: 1000,
  piece: 1,
  pc: 1,
  packet: 1,
};

const normalizeQuantity = (quantity: string): number | null => {
  const regex = /(?:(\d+)\s*x\s*)?(\d+\.?\d*)\s*([a-zA-Z]+)/;
  const match = quantity.toLowerCase().match(regex);
  if (!match) return null;

  const [, multiple, value, unit] = match;
  const numericValue = parseFloat(value);
  const multiplier = multiple ? parseInt(multiple) : 1;
  const normalizedUnit = unitMap[unit] || null;

  return normalizedUnit ? numericValue * multiplier * normalizedUnit : null;
};

type MergedProduct = Omit<IProduct, 'prices' | 'eta' | 'platform'> & {
  prices: {
    blinkit?: IProduct['prices'];
    zepto?: IProduct['prices'];
    bbNow?: IProduct['prices'];
    swiggyInstamart?: IProduct['prices'];
  };
  eta: {
    blinkit?: string;
    zepto?: string;
    bbNow?: string;
    swiggyInstamart?: string;
  };
};

export const clubSimilarProducts = (...platforms: IProduct[][]): MergedProduct[] => {
  const mergedProducts: MergedProduct[] = [];

  platforms.flat().forEach((product) => {
    let found = false;
    const normalizedProductQuantity = normalizeQuantity(product.quantity);

    for (const mergedProduct of mergedProducts) {
      if (
        jaccardIndex(product.name, mergedProduct.name) >= 0.7 &&
        normalizedProductQuantity === normalizeQuantity(mergedProduct.quantity)
      ) {
        // Merge price and eta fields
        mergedProduct.prices[product.platform as keyof MergedProduct['prices']] = product.prices;
        mergedProduct.eta[product.platform as keyof MergedProduct['eta']] = product.eta;
        found = true;
        break;
      }
    }

    if (!found) {
      // Create a new merged product entry
      mergedProducts.push({
        id: product.id,
        name: product.name,
        description: product.description,
        images: product.images,
        prices: { [product.platform]: product.prices },
        eta: { [product.platform]: product.eta },
        quantity: product.quantity,
        stockAvailability: product.stockAvailability,
        discount: product.discount,
        brand: product.brand,
        category: product.category,
        ratings: product.ratings,
        reviews: product.reviews,
      });
    }
  });

  return mergedProducts;
};
