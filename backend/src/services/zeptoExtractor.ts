import CONSTANTS from '../config/constant';
import { v4 as uuidv4 } from 'uuid';
import { IProduct, ProductsAPIResponse } from '../types/schema';
import * as cheerio from 'cheerio';

export const extractZeptoProducts = (html: string) => {
  const $ = cheerio.load(html);
  const domProducts = $('[data-testid=product-card]').toArray();

  let products = domProducts.map((item) => {
    const name = $(item)
      .find('[data-testid=product-card-name]')
      .text()
      .replace(/[\t\n]/g, '');

    const price = $(item)
      .find('[data-testid=product-card-price]')
      .text()
      .replace(/[\t\n]/g, '')
      .replace('₹', '');

    const discountedPrice = $(item)
      .find('[data-testid=product-card-price]')
      .next()
      .text()
      .replace(/[\t\n]/g, '')
      .replace('₹', '');

    const quantity = $(item)
      .find('[data-testid=product-card-quantity]')
      .text()
      .replace(/[\t\n]/g, '');

    const images = $(item)
      .find('[data-testid=product-card-image]')
      .attr('srcset')
      ?.split(', ')
      .map((str) => str.split(' ')[0])
      .filter(Boolean);

    const eta = $(item)
      .find('[alt=clock-icon]')
      .next()
      .text()
      .replace(/[\t\n]/g, '');

    const prices = {
      sellingPrice: price,
      mrp: discountedPrice,
    };
    return { name, prices, quantity, images, eta };
  });
  return { productList: products, totalProducts: products.length };
};

export const extractZeptoProducts2 = (jsonData: any): ProductsAPIResponse => {
  if (!jsonData?.layout) return { productList: [], totalProducts: 0 };

  const products: IProduct[] = jsonData.layout.flatMap((widget: any) => {
    if (!widget.data?.resolver?.data?.items) return [];

    return widget.data.resolver.data.items.map((item: any) => {
      const product = item.productResponse.product;
      const variant = item.productResponse.productVariant;

      return {
        id: uuidv4(),
        name: product.name || '',
        description: product.description?.join(' ') || '',
        images: variant.images?.map((img: any) => img.path) || [],
        prices: {
          mrp: variant.mrp,
          selling_price: variant.sellingPrice,
          discounted_price: variant.discountedSellingPrice,
          discount_percentage: variant.discountPercent,
        },
        eta: variant.shelfLifeInHours ? `${variant.shelfLifeInHours} hrs` : 'N/A',
        quantity: variant.formattedPacksize || 'N/A',
        multipleQuantityOptions: variant.maxAllowedQuantity
          ? `Up to ${variant.maxAllowedQuantity}`
          : undefined,
        stockAvailability: !variant.outOfStock,
        brand: product.brand || '',
        category: item.productResponse.primaryCategoryName || '',
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
