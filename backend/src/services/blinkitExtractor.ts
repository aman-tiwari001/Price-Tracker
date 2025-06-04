import { v4 as uuidv4 } from 'uuid';
import CONSTANTS from '../config/constant';
import { IProduct, ProductsAPIResponse } from '../types/schema';

/**
 * Extracts ETA in minutes from Blinkit's ETA icon URL.
 */
const extractEtaInMinutes = (iconImageUri?: string): string => {
  if (!iconImageUri) return 'N/A';

  const match = iconImageUri.match(/(\d{1,2})-?mins?/i);
  if (match) return `${match[1]} mins`;

  const fallback = iconImageUri.match(/(\d{1,2})/);
  return fallback ? `${fallback[1]} mins` : 'N/A';
};

/**
 * Converts a string into a URL-friendly slug.
 */
const slugify = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Extracts products from Blinkit search API response.
 */
export const extractBlinkitProducts = (jsonData: any): ProductsAPIResponse => {
  const products: IProduct[] = [];

  if (!jsonData?.objects) return { productList: [], totalProducts: 0 };

  jsonData.objects.forEach((obj: any) => {
    if (obj.type !== 102 || !obj.data?.product) return;

    const productData = obj.data.product;

    const name = productData.name;
    const productId = productData.product_id || productData.id;
    const etaIconUri = productData.eta_tag?.icon_image_uri;

    const product: IProduct = {
      id: uuidv4(),
      name,
      description: productData.attributes?.description || '',
      images: productData.images || [],
      prices: {
        sellingPrice: productData.price,
        mrp: productData.mrp,
        discountPrice: productData.mrp ? productData.mrp - productData.price : undefined,
      },
      eta: extractEtaInMinutes(etaIconUri),
      quantity: productData.unit,
      stockAvailability: productData.inventory > 0,
      discount: productData.discount || undefined,
      brand: productData.brand || undefined,
      category: productData.leaf_category?.name || undefined,
      ratings: productData.rating_flag
        ? {
            average: parseFloat(productData.rating_text_color || '0'),
            total: parseInt(productData.rating_count_text || '0'),
          }
        : undefined,
      platform: CONSTANTS.PLATFORMS.blinkit,
      webLink: `https://blinkit.com/prn/${slugify(name)}/prid/${productId}`,
      appLink: `blinkit://product/${productId}`,
    };

    products.push(product);
  });

  return {
    productList: products,
    totalProducts: products.length,
  };
};
