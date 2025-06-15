import { v4 as uuidv4 } from 'uuid';
import CONSTANTS from '../config/constant';
import { IProduct, ProductsAPIResponse } from '../types/schema';

type Image = {
  s: string;
  m: string;
  l: string;
};

type BBNowResponse = {
  tabs?: {
    product_info?: {
      products?: any[];
    };
  }[];
};

const extractBBNowETA = (eta: string): string => {
  if (!eta) return 'N/A';
  const hoursMatch = eta.match(/(\d+)\s*(hr|hour)/i);
  const minsMatch = eta.match(/(\d+)\s*min/i);

  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  if (minsMatch) {
    const mins = parseInt(minsMatch[1], 10);
    return `${mins} mins`;
  }
  const fallback = eta.match(/\d+/);
  return fallback ? `${fallback[0]} mins` : 'N/A';
};

export const extractBBNowProducts = (data: BBNowResponse): ProductsAPIResponse => {
  const products: IProduct[] = [];

  if (!data?.tabs?.length) return { productList: [], totalProducts: 0 };

  const productList = data.tabs[0]?.product_info?.products || [];

  productList.forEach((product: any) => {
    const webPath = product.absolute_url || '';
    const webLink = webPath ? `https://www.bigbasket.com${webPath}` : '';
    const appLink = webPath ? `bigbasket://product${webPath}` : '';

    const extractedProduct: IProduct = {
      id: uuidv4(),
      name: product.desc || '',
      brand: product.brand?.name || '',
      description: product.usp || '',
      category: product.category?.mlc_name || '',
      prices: {
        mrp: product.pricing?.discount?.mrp || null,
        sellingPrice: product.pricing?.discount?.prim_price?.sp || null,
        discountPercentage: product.pricing?.discount?.d_text || null,
      },
      images: product.images ? [product.images.map((img: Image) => img.l)[0]] : [],
      eta: product.availability?.short_eta,
      quantity: product.w || 'N/A',
      multipleQuantityOptions: product.children
        ? product.children.map((child: any) => ({
            id: child.id,
            quantity: child.w || 'N/A',
            price: child.pricing?.discount?.prim_price?.sp || null,
          }))
        : [],
      stockAvailability: !product.availability?.not_for_sale,
      ratings: product.rating_info?.avg_rating || '',
      reviews: product.rating_info?.review_count || 0,
      platform: CONSTANTS.PLATFORMS.bbNow,
      webLink,
      appLink,
    };

    products.push(extractedProduct);
  });

  return { productList: products, totalProducts: products.length };
};
