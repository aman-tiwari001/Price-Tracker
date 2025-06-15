import { v4 as uuidv4 } from 'uuid';
import CONSTANTS from '../config/constant';
import { IProduct, ProductsAPIResponse } from '../types/schema';

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const extractDeliveryEta = (sourcingTime: string | undefined): string => {
  if (!sourcingTime || sourcingTime.trim() === '') return '15 mins';
  const match = sourcingTime.match(/\d+/);
  return match ? `${match[0]} mins` : '15 mins';
};

export const extractSwiggyProducts = (jsonData: any): ProductsAPIResponse => {
  if (!jsonData?.data?.widgets) return { productList: [], totalProducts: 0 };

  const products: IProduct[] = jsonData.data.widgets.flatMap((widget: any) => {
    if (!widget.data) return [];

    return widget.data.flatMap((product: any) => {
      return product.variations.map((variation: any) => {
        const name = variation.display_name || product.display_name || '';
        const productPath = product.product_id;

        const webLink = productPath ? `https://www.swiggy.com/instamart/item/${productPath}` : '';
        const appLink = productPath ? `swiggy://instamart/item/${productPath}` : '';

        return {
          id: uuidv4(),
          name,
          description: variation.meta?.long_description || variation.meta?.short_description || '',
          images: [
            (variation.images || []).map(
              (img: string) => `https://media-assets.swiggy.com/${img}`,
            )[0],
          ],
          prices: {
            mrp: variation.price?.mrp,
            store_price: variation.price?.store_price,
            sellingPrice: variation.price?.offer_price,
            discount: variation.price?.offer_applied?.listing_description,
          },
          eta: extractDeliveryEta(variation.sourcing_time),
          quantity: variation.quantity || 'N/A',
          multiple_quantity_options: variation.sku_quantity_with_combo || undefined,
          stock_available: variation.inventory?.in_stock || false,
          brand: variation.brand || product.brand || '',
          category: variation.category || product.category || '',
          sub_category: variation.sub_category || '',
          platform: CONSTANTS.PLATFORMS.swiggyInstamart,
          webLink,
          appLink,
        };
      });
    });
  });

  return { productList: products, totalProducts: products.length };
};
