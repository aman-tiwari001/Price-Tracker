import CONSTANTS from '../config/constant';
import { IProduct } from '../types/schema';

export const extractZeptoProducts = (jsonData: any): IProduct[] => {
  let products: IProduct[] = [];

  if (jsonData?.layout) {
    jsonData.layout.forEach((widget: any) => {
      if (widget.widgetName === 'SEARCHED_PRODUCTS_0' && widget.data?.resolver?.data?.items) {
        widget.data.resolver.data.items.forEach((item: any) => {
          const productData = item.productResponse;
          products.push({
            name: productData.product.name,
            description: productData.product.description?.join(' ') || '',
            images: productData.productVariant.images?.map((img: any) => img.path) || [],
            prices: {
              sellingPrice: productData.sellingPrice / 100,
              mrp: productData.mrp / 100,
              discountPrice: productData.discountedSellingPrice / 100,
            },
            quantity: `${productData.productVariant.weightInGms / 1000} kg`,
            stockAvailability: !productData.outOfStock,
            discount: productData.discountPercent || undefined,
            brand: productData.product.brand || undefined,
            category: productData.primaryCategoryName || undefined,
            ratings: productData.productVariant.ratingSummary
              ? {
                  average: productData.productVariant.ratingSummary.averageRating,
                  total: productData.productVariant.ratingSummary.totalRatings,
                }
              : undefined,
            platform: CONSTANTS.PLATFORMS.zepto,
          });
        });
      }
    });
  }
  return products;
};
