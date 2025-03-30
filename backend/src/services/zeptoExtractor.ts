import CONSTANTS from '../config/constant';
import { IProduct, ProductsAPIResponse } from '../types/schema';

export const extractZeptoProducts = (jsonData: any): ProductsAPIResponse => {
  if (!jsonData?.layout) return { productList: [], totalProducts: 0 };

  const products: IProduct[] = jsonData.layout.flatMap((widget: any) => {
    if (!widget.data?.resolver?.data?.items) return [];

    return widget.data.resolver.data.items.map((item: any) => {
      const product = item.productResponse.product;
      const variant = item.productResponse.productVariant;

      return {
        name: product.name || 'Unknown',
        description: product.description?.join(' ') || '',
        images: variant.images?.map((img: any) => img.path) || [],
        prices: {
          mrp: variant.mrp,
          selling_price: variant.sellingPrice,
          discounted_price: variant.discountedSellingPrice,
          discount_percentage: variant.discountPercent,
        },
        eta: variant.shelfLifeInHours ? `${variant.shelfLifeInHours} hrs` : undefined,
        quantity: variant.formattedPacksize || 'Unknown',
        multipleQuantityOptions: variant.maxAllowedQuantity
          ? `Up to ${variant.maxAllowedQuantity}`
          : undefined,
        stockAvailability: !variant.outOfStock,
        brand: product.brand || 'Unknown',
        category: item.productResponse.primaryCategoryName || 'Unknown',
        reviews: {
          average: variant.ratingSummary?.averageRating,
          total_reviews: variant.ratingSummary?.totalRatings,
        },
        platform: CONSTANTS.PLATFORMS.zepto,
      };
    });
  });
  return { productList: products, totalProducts: products.length };
};
