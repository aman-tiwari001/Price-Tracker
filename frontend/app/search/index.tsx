import { router } from 'expo-router';
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
  const [filters, setFilters] = useState<filtersInterface>({
    categories: [],
    brands: [],
    quantities: [],
    priceRange: {
      min: 0,
      max: 0,
    },
  });

  const handleSearch = async () => {
    try {
      setLoading(true);
      const location = await getUserLocation();
      console.log(location.address.formattedAddress)
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
      setAllProducts(res.data);
      ToastAndroid.show('✅ Success', ToastAndroid.LONG);
      const filters = getFilters(res.data);
      console.log('Filters:', filters);
      setFilters(filters);
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
                <Pressable className='flex-1 bg-black/50' onPress={() => setIsFilterOpen(false)}>
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    className='bg-white h-2/3 absolute bottom-0 w-full rounded-t-3xl p-6'
                  >
                    <View className='flex-row justify-between items-center'>
                      <Text className='text-xl font-bold'>Filters</Text>
                      <Pressable onPress={() => setIsFilterOpen(false)}>
                        <Octicons name='x' size={24} color='#000' />
                      </Pressable>
                    </View>
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <View className='w-full mt-4'>
                        <Text className='text-lg font-semibold mb-2'>Categories</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {filters.categories.map((category, index) => (
                            <Pressable
                              key={index}
                              className='bg-gray-200 rounded-full px-3 py-1 mr-2'
                              onPress={() => {
                                // Handle category filter logic here
                              }}
                            >
                              <Text className='text-gray-700'>{category}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>

                      <View className='w-full mt-4'>
                        <Text className='text-lg font-semibold mb-2'>Brands</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {filters.brands.map((brand, index) => (
                            <Pressable
                              key={index}
                              className='bg-gray-200 rounded-full px-3 py-1 mr-2'
                              onPress={() => {
                                // Handle brand filter logic here
                              }}
                            >
                              <Text className='text-gray-700'>{brand}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>

                      <View className='w-full mt-4'>
                        <Text className='text-lg font-semibold mb-2'>Quantities</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {filters.quantities.map((quantity, index) => (
                            <Pressable
                              key={index}
                              className='bg-gray-200 rounded-full px-3 py-1 mr-2'
                              onPress={() => {
                                // Handle quantity filter logic here
                              }}
                            >
                              <Text className='text-gray-700'>{quantity}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>

                      <View className='w-full mt-4'>
                        <Text className='text-lg font-semibold mb-2'>Price Range</Text>
                        <Text className='text-gray-700'>
                          ₹{filters.priceRange.min} - ₹{filters.priceRange.max}
                        </Text>
                      </View>
                    </View>
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
            {allProducts?.blinkit.totalProducts ? (
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
                      key={index}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                    />
                  ))}
              </View>
            ) : null}

            {allProducts?.zepto.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/zepto-logo.png')}
                    style={{
                      width: 96,
                      height: 48,
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.zepto?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={index}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                    />
                  ))}
              </View>
            ) : null}

            {allProducts?.swiggyInstamart.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/instamart-logo.png')}
                    style={{
                      width: 96,
                      height: 48,
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.swiggyInstamart?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={index}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
                    />
                  ))}
              </View>
            ) : null}

            {allProducts?.bbNow.totalProducts ? (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-2'>
                  <Image
                    source={require('../../assets/images/bbnow-logo.png')}
                    style={{
                      width: 96,
                      height: 48,
                    }}
                    resizeMode='contain'
                  />
                </View>
                {allProducts?.bbNow?.productList
                  .slice(0, productsLimit)
                  .map((product, index) => (
                    <ProductCard
                      key={index}
                      name={product.name || ''}
                      images={product.images || []}
                      prices={product.prices || {}}
                      eta={product.eta || 'Earliest'}
                      quantity={product.quantity || ''}
                      stockAvailability={product.stockAvailability || false}
                      brand={product.brand || ''}
                      category={product.category || ''}
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
