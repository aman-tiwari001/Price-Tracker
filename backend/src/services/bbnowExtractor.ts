type Image = {
  s: string;
  m: string;
  l: string;
};

type Price = {
  mrp: string | null;
  selling_price: string | null;
  discount_percentage: string | null;
};

type QuantityOption = {
  id: string;
  quantity: string;
  price: string | null;
};

type Product = {
  name: string;
  description: string;
  images: string[];
  prices: Price;
  eta: string;
  quantity: string;
  multiple_quantity_options: QuantityOption[];
  stock_available: boolean;
  brand: string;
  category: string;
  rating: string;
  review_count: number;
};

type BBNowResponse = {
  tabs?: {
    product_info?: {
      products?: any[];
    };
  }[];
};

export const extractBBNowProducts = (data: BBNowResponse): Product[] => {
  const products: Product[] = [];

  if (!data || !data.tabs || !data.tabs.length) return products;

  const productList = data.tabs[0]?.product_info?.products || [];

  productList.forEach((product: any) => {
    let extractedProduct: Product = {
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
      multiple_quantity_options: product.children
        ? product.children.map((child: any) => ({
            id: child.id,
            quantity: child.w || 'N/A',
            price: child.pricing?.discount?.prim_price?.sp || null,
          }))
        : [],
      stock_available: !product.availability?.not_for_sale,
      rating: product.rating_info?.avg_rating || 'No ratings',
      review_count: product.rating_info?.review_count || 0,
    };

    products.push(extractedProduct);
  });

  return products;
};
