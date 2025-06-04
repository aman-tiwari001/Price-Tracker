type Product = {
  category?: string;
  brand?: string;
  prices?: {
    sellingPrice?: number | string;
    mrp?: number | string;
  };
  quantity?: string;
};

type PlatformProducts = {
  [platform: string]: {
    productList?: Product[];
  };
};

type Filters = {
  categories: Set<string>;
  brands: Set<string>;
  quantities: Set<string>;
  prices: number[];
};

export function getFilters(data: PlatformProducts) {
  const filters: Filters = {
    categories: new Set(),
    brands: new Set(),
    quantities: new Set(),
    prices: []
  };

  for (const platform in data) {
    const products = data[platform]?.productList || [];
    
    for (const product of products) {
      // Extract category
      if (product.category && typeof product.category === 'string') {
        filters.categories.add(product.category.trim());
      }

      // Extract brand
      if (product.brand && typeof product.brand === 'string') {
        filters.brands.add(product.brand.trim());
      }

      // Extract quantity
      if (product.quantity && typeof product.quantity === 'string') {
        filters.quantities.add(product.quantity.trim());
      }

      // Extract prices
      const price = parseFloat(
        (product.prices?.sellingPrice || product.prices?.mrp || '0').toString()
      );
      if (!isNaN(price) && price > 0) {
        filters.prices.push(price);
      }
    }
  }

  // Compute price ranges (min, max, or bins)
  const priceStats = filters.prices.length
    ? {
        min: Math.min(...filters.prices),
        max: Math.max(...filters.prices)
      }
    : { min: 0, max: 0 };

  return {
    categories: Array.from(filters.categories).sort(),
    brands: Array.from(filters.brands).sort(),
    quantities: Array.from(filters.quantities).sort(),
    priceRange: priceStats
  };
}
