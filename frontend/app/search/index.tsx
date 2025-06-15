import { router, useNavigation } from 'expo-router';
import { searchProduct } from '@/api';
import { AllProductsTypes } from '@/types';
import Octicons from '@expo/vector-icons/Octicons';
import ProductCard from '@/components/ProductCard';
import { getUserLocation } from '@/utils/getUserLocation';
import React, { useEffect, useRef, useState } from 'react';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import ProductSkeletonGrid from '@/components/ProductSkeletonGrid';
import { GestureHandlerRootView, ScrollView, TextInput } from 'react-native-gesture-handler';
import { Image, Modal, Pressable, Text, ToastAndroid, View } from 'react-native';
import { getFilters } from '@/utils/getFilters';
import { CONSTANTS } from '@/utils/constant';
import Slider from '@react-native-community/slider';
import Feather from '@expo/vector-icons/Feather';
import { useCartStore } from '@/store/cartStore';

interface filtersInterface {
  categories: string[];
  brands: string[];
  quantities: string[];
  priceRange: {
    min: number;
    max: number;
  };
}

const SearchScreen = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [productsLimit, setProductsLimit] = useState(0);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<TextInput | null>(null);
  const [allProducts, setAllProducts] = useState<AllProductsTypes>({
    blinkit: {
      productList: [],
      totalProducts: 0,
    },
    zepto: {
      productList: [],
      totalProducts: 0,
    },
    swiggyInstamart: {
      productList: [],
      totalProducts: 0,
    },
    bbNow: {
      productList: [],
      totalProducts: 0,
    },
  });
  const [allFilteredProducts, setAllFilteredProducts] = useState<AllProductsTypes>({
    blinkit: {
      productList: [],
      totalProducts: 0,
    },
    zepto: {
      productList: [],
      totalProducts: 0,
    },
    swiggyInstamart: {
      productList: [],
      totalProducts: 0,
    },
    bbNow: {
      productList: [],
      totalProducts: 0,
    },
  });
  const [filtersData, setFiltersData] = useState<filtersInterface>({
    categories: [],
    brands: [],
    quantities: [],
    priceRange: {
      min: 0,
      max: 0,
    },
  });
  const [filters, setFilters] = useState<filtersInterface>({
    categories: [],
    brands: [],
    quantities: [],
    priceRange: {
      min: 0,
      max: 0,
    },
  });

  const { items } = useCartStore();

  const handleApplyFilters = () => {
    try {
      if (
        filters.categories.length === 0 &&
        filters.brands.length === 0 &&
        filters.priceRange.max === 0
      ) {
        ToastAndroid.show('Please select at least one filter', ToastAndroid.SHORT);
        return;
      }

      const filterFunction = (productList: any[], platform: string) => {
        const applyCatFilter = filters.categories.length > 0;
        const applyBrandFilter = filters.brands.length > 0;

        return productList.filter((product) => {
          console.log(
            Number(product.prices.sellingPrice),
            Number(product.prices.sellingPrice) <= Number(filters.priceRange.max),
          );
          // (!applyCatFilter || filters.categories.includes(product.category || '')) &&
          // (!applyBrandFilter || filters.brands.includes(product.brand || '')) &&
          return Number(product.prices.sellingPrice) <= Number(filters.priceRange.max);
        });
      };
      const blinkitFilter = filterFunction(allProducts.blinkit.productList, 'blinkit');
      const zeptoFilter = filterFunction(allProducts.zepto.productList, 'zepto');
      const swiggyFilter = filterFunction(
        allProducts.swiggyInstamart.productList,
        'swiggyInstamart',
      );
      const bbNowFilter = filterFunction(allProducts.bbNow.productList, 'bbNow');

      setAllFilteredProducts({
        blinkit: {
          productList: blinkitFilter,
          totalProducts: blinkitFilter.length,
        },
        zepto: {
          productList: zeptoFilter,
          totalProducts: zeptoFilter.length,
        },
        swiggyInstamart: {
          productList: swiggyFilter,
          totalProducts: swiggyFilter.length,
        },
        bbNow: {
          productList: bbNowFilter,
          totalProducts: bbNowFilter.length,
        },
      });
      setIsFilterOpen(false);
      ToastAndroid.show('Filters applied', ToastAndroid.SHORT);
    } catch (error) {
      console.error('Error applying filters:', error);
      ToastAndroid.show('Something went wrong!', ToastAndroid.SHORT);
      return;
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      const location = await getUserLocation();
      const res = await searchProduct(
        searchQuery,
        String(location.lat),
        String(location.lng),
        String(location.address.formattedAddress),
      );
      const values = [
        res.data.blinkit.totalProducts,
        res.data.bbNow.totalProducts,
        res.data.swiggyInstamart.totalProducts,
        res.data.zepto.totalProducts,
      ];
      const nonZeroValues = values.filter((val) => val > 0);
      setProductsLimit(Math.min(...nonZeroValues));
      setAllFilteredProducts(res.data);
      setAllProducts(res.data);
      // ToastAndroid.show('✅ Success', ToastAndroid.LONG);
      const filters = getFilters(res.data);
      setFiltersData(filters);
      setFilters((prev) => ({
        ...prev,
        priceRange: { min: filters.priceRange.min, max: filters.priceRange.max },
      }));
    } catch (error) {
      console.log(error);
      ToastAndroid.show('Something went wrong!', ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchRef.current) {
      searchRef.current.blur();
      searchRef.current.focus();
      searchRef.current.setNativeProps({ selection: { start: 0, end: 0 } });
      setTimeout(() => {
        searchRef.current?.focus();
      }, 100);
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ backgroundColor: '#fff', flex: 1 }}>
      <Pressable
        onPress={() => router.push('/cart')}
        className='bg-primary active:bg-blue-700 absolute bottom-1 left-[32%] z-10 w-[36%] flex-row items-center gap-4 text-center justify-center active:scale-95 rounded-full py-3 px-2 transition duration-150'
      >
        <Feather name='shopping-cart' size={25} color={CONSTANTS.colors.secondary} />
        <View className='flex flex-col'>
          <Text className='text-white text-center font-semibold text-xl'>View Cart</Text>
          <Text className='text-white'>{items.length} Items</Text>
        </View>
      </Pressable>
      <ScrollView style={{ flex: 1 }}>
        <View className='mt-4 flex-row items-center border-2 rounded-xl border-gray-300 mx-auto w-[95%] bg-gray-100 text-white py-1 px-4'>
          <Octicons
            name='arrow-left'
            color='#000'
            size={24}
            className='active:scale-105'
            onPress={() => router.push('/')}
          />
          <TextInput
            className='flex-1 ml-2 text-lg'
            placeholder='Search your groceries'
            placeholderTextColor='gray'
            returnKeyType='search'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.nativeEvent.text)}
            onSubmitEditing={handleSearch}
            ref={searchRef}
          />
          <Octicons
            name='x'
            color='#000'
            size={24}
            className='active:scale-105'
            onPress={() => setSearchQuery('')}
          />
        </View>
        <View>
          <View className='flex-row justify-between items-center mx-4 mt-4'>
            <View>
              <Pressable
                onPress={() => setIsFilterOpen(true)}
                className='flex flex-row items-center gap-2 border-2 border-gray-300 rounded-lg p-1 active:bg-gray-200'
              >
                <FontAwesome6 name='sliders' size={16} color='#4B5563' />
                <Text className='text-gray-600'>Filters</Text>
              </Pressable>
              <Modal
                animationType='slide'
                transparent={true}
                visible={isFilterOpen}
                onRequestClose={() => setIsFilterOpen(false)}
              >
                <Pressable className='flex-1 bg-black/60' onPress={() => setIsFilterOpen(false)}>
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    className='bg-white absolute bottom-0 w-full rounded-t-3xl p-6'
                  >
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <View className='flex-row justify-between items-center'>
                        <View className='flex-row items-center gap-3'>
                          <FontAwesome6 name='sliders' size={16} color='#4B5563' />
                          <Text className='text-xl font-bold'>Filters</Text>
                        </View>
                        <Pressable onPress={() => setIsFilterOpen(false)}>
                          <Octicons name='x' size={24} color='#000' />
                        </Pressable>
                      </View>
                      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <View className='w-full mt-4'>
                          <Text className='text-lg font-semibold mb-2'>Categories</Text>
                          <View className='flex-row flex-wrap gap-1'>
                            {filtersData.categories.map((category, index) => (
                              <Pressable
                                key={index}
                                className={`${filters.categories.includes(category) ? 'bg-primary' : 'bg-gray-200'} transition duration-100 active:scale-90 rounded-full px-3 py-1 mb-1`}
                                onPress={() => {
                                  setFilters((prev) => ({
                                    ...prev,
                                    categories: filters.categories.includes(category)
                                      ? prev.categories.filter((c) => c !== category)
                                      : [...prev.categories, category],
                                  }));
                                }}
                              >
                                <Text
                                  className={`${filters.categories.includes(category) ? 'text-white' : 'text-gray-700'}`}
                                >
                                  {category}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <View className='w-full mt-4'>
                          <Text className='text-lg font-semibold mb-2'>Brands</Text>
                          <View className='flex-row flex-wrap gap-1'>
                            {filtersData.brands.map((brand, index) => (
                              <Pressable
                                key={index}
                                className={`${filters.brands.includes(brand) ? 'bg-primary' : 'bg-gray-200'} transition duration-100 active:scale-90 rounded-full px-3 py-1 mb-1`}
                                onPress={() => {
                                  setFilters((prev) => ({
                                    ...prev,
                                    brands: filters.brands.includes(brand)
                                      ? prev.brands.filter((b) => b !== brand)
                                      : [...prev.brands, brand],
                                  }));
                                }}
                              >
                                <Text
                                  className={`${filters.brands.includes(brand) ? 'text-white' : 'text-gray-700'}`}
                                >
                                  {brand}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <View className='w-full mt-4'>
                          <Text className='text-lg font-semibold mb-2'>Price Range</Text>
                          <View className='flex-row items-center justify-center'>
                            <Text className='text-gray-700'>₹{filtersData.priceRange.min}</Text>
                            <Slider
                              style={{ width: '84%', height: 40 }}
                              minimumValue={filtersData.priceRange.min}
                              maximumValue={filtersData.priceRange.max}
                              step={
                                filtersData.priceRange.max - filtersData.priceRange.min > 1000
                                  ? 100
                                  : 10
                              }
                              thumbTintColor={CONSTANTS.colors.primary}
                              value={filters.priceRange.max}
                              minimumTrackTintColor={CONSTANTS.colors.primary}
                              onValueChange={(val) =>
                                setFilters((prev) => ({
                                  ...prev,
                                  priceRange: { ...prev.priceRange, max: val },
                                }))
                              }
                            />
                            <Text className='text-gray-700'>₹{filtersData.priceRange.max}</Text>
                          </View>
                          <Text className='ml-1'>Max price : ₹{filters.priceRange.max}</Text>
                        </View>
                      </View>
                      <Pressable
                        className='bg-primary active:bg-blue-700 active:scale-95 rounded-xl w-full mt-4 mx-auto py-3 px-2 transition duration-150'
                        onPress={handleApplyFilters}
                      >
                        <Text className='text-white text-center font-semibold'>Apply Filter</Text>
                      </Pressable>
                    </ScrollView>
                  </Pressable>
                </Pressable>
              </Modal>
            </View>
            <View className='flex-row items-center gap-2 border-2 border-gray-300 rounded-lg p-1 active:bg-gray-200'>
              <Text className='text-gray-600'>Sort</Text>
              <Octicons name='sort-asc' size={16} color='#4B5563' />
            </View>
          </View>
        </View>
        <View className='flex-row justify-between items-center mx-4 my-2'></View>
        {loading ? (
          <ProductSkeletonGrid />
        ) : (
          <ScrollView
            horizontal
            contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 10, gap: 10 }}
          >
            {allFilteredProducts?.blinkit.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/blinkit-logo.png')}
                    style={{
                      width: 96,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: '#FACC15',
                      padding: 0,
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.blinkit?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={product.id || index}
                      id={product.id || ''}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                      link={product.webLink || ''}
                      platform={(product.platform as string) || 'Blinkit'}
                    />
                  ))}
              </View>
            ) : null}

            {allFilteredProducts?.zepto.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/zepto-logo.png')}
                    style={{
                      width: 90,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: '#8B5CF6' + '60',
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.zepto?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={index}
                      id={product.id || ''}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                      link={product.webLink || ''}
                      platform={(product.platform as string) || 'Zepto'}
                    />
                  ))}
              </View>
            ) : null}

            {allFilteredProducts?.swiggyInstamart.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/instamart-logo2.png')}
                    style={{
                      width: 96,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: '#FF6B35' + '60',
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.swiggyInstamart?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={index}
                      id={product.id || ''}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                      link={product.webLink || ''}
                      platform={(product.platform as string) || 'Swiggy Instamart'}
                    />
                  ))}
              </View>
            ) : null}

            {allFilteredProducts?.bbNow.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/bbnow-logo.png')}
                    style={{
                      width: 96,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: '#66f711' + '60',
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.bbNow?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={index}
                      id={product.id || ''}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                      link={product.webLink || ''}
                      platform={(product.platform as string) || 'BB Now'}
                    />
                  ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </ScrollView>
    </GestureHandlerRootView>
  );
};

export default SearchScreen;
