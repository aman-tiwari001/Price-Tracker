export interface IProduct {
  id: string,
  name: string;
  description?: string;
  images: string[];
  prices: unknown;
  eta?: string;
  quantity: string;
  multipleQuantityOptions?: number[];
  stockAvailability?: boolean;
  discount?: number;
  brand?: string;
  category?: string;
  ratings?: { average: number; total: number };
  reviews?: unknown;
  productLink?: string;
  platform: unknown;
  webLink?: string;
  appLink?: string;
}

export type AllProductsTypes = {
  blinkit: {
    productList: IProduct[];
    totalProducts: number;
  };
  zepto: {
    productList: IProduct[];
    totalProducts: number;
  };
  swiggyInstamart: {
    productList: IProduct[];
    totalProducts: number;
  };
  bbNow: {
    productList: IProduct[];
    totalProducts: number;
  };
};
