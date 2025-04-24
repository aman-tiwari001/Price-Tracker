import CONSTANTS from '../config/constant';
import { IProduct, ProductsAPIResponse } from '../types/schema';

export const extractSwiggyProducts = (jsonData: any): ProductsAPIResponse => {
  if (!jsonData?.data?.widgets) return { productList: [], totalProducts: 0 };

  const products: IProduct[] = jsonData.data.widgets.flatMap((widget: any) => {
    if (!widget.data) return [];

    return widget.data.flatMap((product: any) => {
      return product.variations.map((variation: any) => ({
        name: variation.display_name || product.display_name || 'Unknown',
        description: variation.meta?.long_description || variation.meta?.short_description || '',
        images: variation.images || [],
        prices: {
          mrp: variation.price?.mrp,
          store_price: variation.price?.store_price,
          sellingPrice: variation.price?.offer_price,
          discount: variation.price?.offer_applied?.listing_description,
        },
        eta: variation.sourcing_time || undefined,
        quantity: variation.quantity || 'Unknown',
        multiple_quantity_options: variation.sku_quantity_with_combo || undefined,
        stock_available: variation.inventory?.in_stock || false,
        brand: variation.brand || product.brand || 'Unknown',
        category: variation.category || product.category || 'Unknown',
        sub_category: variation.sub_category || 'Unknown',
        platform: CONSTANTS.PLATFORMS.swiggyInstamart,
      }));
    });
  });
  products.forEach((item) => {
    item.images = item.images.map((img) => 'https://media-assets.swiggy.com/' + img);
  });
  return { productList: products, totalProducts: products.length };
};
