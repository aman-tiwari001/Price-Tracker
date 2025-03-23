import CONSTANTS from '../config/constant';
import { IProduct } from '../types/schema';

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

export const extractBBNowProducts = (data: BBNowResponse): IProduct[] => {
  const products: IProduct[] = [];

  if (!data || !data.tabs || !data.tabs.length) return products;

  const productList = data.tabs[0]?.product_info?.products || [];

  productList.forEach((product: any) => {
    let extractedProduct: IProduct = {
      name: product.desc || 'Unknown',
      brand: product.brand?.name || 'Unknown',
      description: product.usp || 'No description available',
      category: product.category?.mlc_name || 'Unknown',
      prices: {
        mrp: product.pricing?.discount?.mrp || null,
        selling_price: product.pricing?.discount?.prim_price?.sp || null,
        discount_percentage: product.pricing?.discount?.d_text || null,
      },
      images: product.images ? product.images.map((img: Image) => img.l) : [],
      eta: product.availability?.short_eta || 'N/A',
      quantity: product.w || 'N/A',
      multipleQuantityOptions: product.children
        ? product.children.map((child: any) => ({
            id: child.id,
            quantity: child.w || 'N/A',
            price: child.pricing?.discount?.prim_price?.sp || null,
          }))
        : [],
      stockAvailability: !product.availability?.not_for_sale,
      ratings: product.rating_info?.avg_rating || 'No ratings',
      reviews: product.rating_info?.review_count || 0,
      platform: CONSTANTS.PLATFORMS.bbNow,
    };

    products.push(extractedProduct);
  });

  return products;
};
