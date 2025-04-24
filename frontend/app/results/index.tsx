import { Image, Modal, Pressable, StatusBar, Text, ToastAndroid, View } from 'react-native';
import React, { useEffect, useState } from 'react';
import Octicons from '@expo/vector-icons/Octicons';
import { GestureHandlerRootView, ScrollView, TextInput } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import ProductCard from '@/components/ProductCard';
import { searchProduct } from '@/api';
import { getUserLocation } from '@/utils/getUserLocation';
import { AllProductsTypes } from '@/types';
import ProductSkeletonGrid from '@/components/ProductSkeletonGrid';

const ResultsScreen = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [productsLimit, setProductsLimit] = useState(0);
  const [loading, setLoading] = useState(false);
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

  const handleSearch = async () => {
    try {
      setLoading(true);
      const location = await getUserLocation();
      const res = await searchProduct(searchQuery, String(location.lat), String(location.lng));
      const values = [
        res.data.blinkit.totalProducts,
        res.data.bbNow.totalProducts,
        res.data.swiggyInstamart.totalProducts,
        res.data.zepto.totalProducts,
      ];
      const nonZeroValues = values.filter((val) => val > 0);
      setProductsLimit(Math.min(...nonZeroValues));
      setAllProducts(res.data);
      console.log(res);
      ToastAndroid.show('✅ Success', ToastAndroid.LONG);
    } catch (error) {
      console.log(error);
      ToastAndroid.show('Something went wrong!', ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GestureHandlerRootView style={{ backgroundColor: '#fff', flex: 1 }}>
      <StatusBar backgroundColor='#fff' barStyle='dark-content' />
      <ScrollView style={{ flex: 1 }}>
        <View className='mt-4 flex-row items-center border-2 rounded-lg border-gray-300 mx-auto w-[95%] bg-gray-100 text-white px-4'>
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
          />
          <Octicons
            name='x'
            color='#000'
            size={24}
            className='active:scale-105'
            onPress={() => setSearchQuery('')}
          />
        </View>
        {isFilterOpen && (
          <StatusBar backgroundColor='rgba(0, 0, 0, 0.5)' barStyle='light-content' />
        )}
        <View>
          <View className='flex-row justify-between items-center mx-4 mt-4'>
            <View>
              <Pressable
                onPress={() => setIsFilterOpen(true)}
                className='flex flex-row items-center gap-2 border-2 border-gray-300 rounded-lg p-1'
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
                    {/* Add your filter content here */}
                    <Text style={{ alignItems: 'center', justifyContent: 'center' }}>
                      All category filters will come here
                    </Text>
                  </Pressable>
                </Pressable>
              </Modal>
            </View>
            <View className='flex-row items-center gap-2 border-2 border-gray-300 rounded-lg p-1'>
              <Text className='text-gray-600'>Sort</Text>
              <Octicons name='sort-asc' size={16} color='#4B5563' />
            </View>
          </View>
        </View>
        <View className='flex-row justify-between items-center mx-4 my-6'></View>
        {loading ? (
          <ProductSkeletonGrid />
        ) : (
          <ScrollView
            horizontal
            contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 10, gap: 10 }}
          >
            {allProducts?.blinkit.totalProducts && (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-3'>
                  <Image
                    source={require('../../assets/images/blinkit-logo.png')}
                    className='w-24 h-12 rounded-lg bg-yellow-300 p-0'
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
            )}

            {allProducts?.zepto.totalProducts && (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-3'>
                  <Image
                    source={require('../../assets/images/zepto-logo.png')}
                    className='w-24 h-12'
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
            )}
            {allProducts?.swiggyInstamart.totalProducts && (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-3'>
                  <Image
                    source={require('../../assets/images/instamart-logo.png')}
                    className='w-24 h-12'
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
            )}

            {allProducts?.bbNow.totalProducts && (
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View className='mb-3'>
                  <Image
                    source={require('../../assets/images/bbnow-logo.png')}
                    className='w-24 h-12'
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
            )}
          </ScrollView>
        )}
      </ScrollView>
    </GestureHandlerRootView>
  );
};

export default ResultsScreen;
