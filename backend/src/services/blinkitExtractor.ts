export type Product = {
  name: string;
  description?: string;
  images: string[];
  prices: { sellingPrice: number; mrp?: number; discountPrice?: number };
  eta?: string;
  quantity: string;
  multipleQuantityOptions?: number[];
  stockAvailability: boolean;
  discount?: number;
  brand?: string;
  category?: string;
  ratings?: { average: number; total: number };
};

export const extractBlinkitProducts = (jsonData: any): Product[] => {
  let products: Product[] = [];

  if (jsonData?.objects) {
    jsonData.objects.forEach((obj: any) => {
      if (obj.type === 102 && obj.data?.product) {
        const productData = obj.data.product;
        products.push({
          name: productData.name,
          description: productData.attributes?.description || '',
          images: productData.images || [],
          prices: {
            sellingPrice: productData.price,
            mrp: productData.mrp,
            discountPrice: productData.mrp ? productData.mrp - productData.price : undefined,
          },
          eta: productData.eta_tag?.text || undefined,
          quantity: productData.unit,
          stockAvailability: productData.inventory > 0,
          discount: productData.discount || undefined,
          brand: productData.brand || undefined,
          category: productData.leaf_category?.name || undefined,
          ratings: productData.rating_flag ? {
            average: parseFloat(productData.rating_text_color || '0'),
            total: parseInt(productData.rating_count_text || '0'),
          } : undefined,
        });
      }
    });
  }
  return products;
};