import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
  ToastAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@/store/cartStore';
import { router } from 'expo-router';

// Keep your existing interfaces
interface CartItem {
  id: string;
  name: string;
  price: number;
  mrp: number;
  image: string;
  quantity: number;
  weight: string;
}

interface Platform {
  id: string;
  name: string;
  color: string;
  logo: any;
  items: CartItem[];
}

const CartScreen = () => {
  const { items, removeItem, clearCart, incrementQuantity, decrementQuantity } = useCartStore();
  const [platforms, setPlatforms] = useState<Platform[]>([
    {
      id: 'blinkit',
      name: 'Blinkit',
      color: '#ffe247e0',
      logo: require('../../assets/images/blinkit-logo.png'),
      items: [],
    },
    {
      id: 'zepto',
      name: 'Zepto',
      color: '#9816dc63',
      logo: require('../../assets/images/zepto-logo.png'),
      items: [],
    },
    {
      id: 'swiggyinstamart',
      name: 'Swiggy Instamart',
      color: '#fe6b2e',
      logo: require('../../assets/images/instamart-logo2.png'),
      items: [],
    },
    {
      id: 'bbnow',
      name: 'BB Now',
      color: '#a9ce3f96',
      logo: require('../../assets/images/bbnow-logo.png'),
      items: [],
    },
  ]);

  // Effect to organize items by platform whenever Zustand store items change
  useEffect(() => {
    const updatedPlatforms = [...platforms];

    // Reset all platform items
    updatedPlatforms.forEach((platform) => {
      platform.items = [];
    }); // Group items by platform
    items.forEach((item) => {
      // Normalize platform ID by removing spaces and converting to lowercase
      const platformId = (item.product.platform as string)?.toLowerCase().replace(/\s+/g, '');
      const platform = updatedPlatforms.find((p) => p.id === platformId);

      if (platform) {
        // Transform Zustand item to CartItem format
        const cartItem: CartItem = {
          id: item.product.id,
          name: item.product.name,
          price: (item.product.prices as any)?.sellingPrice || 0,
          mrp: (item.product.prices as any)?.mrp || 0,
          image: item.product.images[0] || '',
          quantity: item.quantity,
          weight: item.product.quantity,
        };

        // Check if item already exists in this platform
        const existingItemIndex = platform.items.findIndex((i) => i.id === cartItem.id);
        if (existingItemIndex !== -1) {
          // Update existing item
          platform.items[existingItemIndex] = cartItem;
        } else {
          // Add new item
          platform.items.push(cartItem);
        }
      } else {
        console.warn(`Platform not found for item: ${item.product.name} (platform: ${platformId})`);
      }
    });

    setPlatforms(updatedPlatforms);
  }, [items]);

  const [expandedPlatforms, setExpandedPlatforms] = useState<string[]>([]);

  const togglePlatform = (platformId: string) => {
    setExpandedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((id) => id !== platformId) : [...prev, platformId],
    );
  };

  const getTotalItems = (items: CartItem[]) => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = (items: CartItem[]) => {
    let total = items.reduce((total, item) => total + item.price * item.quantity, 0);
    return total.toFixed(2);
  };

  const handleClearCart = (platformId: string) => {
    Alert.alert('Clear Cart', `Are you sure you want to clear all items from this platform?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          // Remove all items from the specified platform
          const platformItems = platforms.find((p) => p.id === platformId)?.items || [];
          platformItems.forEach((item) => {
            removeItem(item.id);
          });
        },
      },
    ]);
  };

  const handleDeleteItem = (itemId: string, itemName: string) => {
    Alert.alert('Remove Item', `Remove ${itemName} from cart?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeItem(itemId),
      },
    ]);
  };

  const renderCartItem = (item: CartItem, platformColor: string) => (
    <View key={item.id} className='bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100'>
      <View className='flex-row'>
        <Image source={{ uri: item.image }} className='w-20 h-20 rounded-lg bg-gray-100' />
        <View className='flex-1 ml-3'>
          <Text className='text-gray-800 font-medium text-sm leading-5 mb-1'>{item.name}</Text>
          <Text className='text-gray-500 text-xs mb-2'>{item.weight}</Text>

          <View className='flex-row items-center justify-between'>
            <View className='flex-row items-center'>
              <Text className='text-gray-800 font-semibold text-base'>₹{item.price}</Text>
              <Text className='text-gray-400 text-sm line-through ml-2'>₹{item.mrp}</Text>
            </View>

            <TouchableOpacity onPress={() => handleDeleteItem(item.id, item.name)} className='p-1'>
              <Ionicons name='trash-outline' size={18} color='#EF4444' />
            </TouchableOpacity>
          </View>

          <View className='flex-row items-center bg-gray-50 rounded-lg p-1'>
            <TouchableOpacity
              onPress={() => decrementQuantity(item.id)}
              className='p-1'
              disabled={item.quantity <= 1}
            >
              <Ionicons
                name='remove-outline'
                size={20}
                color={item.quantity <= 1 ? '#D1D5DB' : '#374151'}
              />
            </TouchableOpacity>

            <Text className='text-gray-800 font-medium mx-3'>{item.quantity}</Text>

            <TouchableOpacity onPress={() => incrementQuantity(item.id)} className='p-1'>
              <Ionicons name='add-outline' size={20} color='#374151' />
            </TouchableOpacity>
          </View>

          <Text className='font-semibold text-gray-700'>₹{item.price * item.quantity}</Text>
        </View>
      </View>
    </View>
  );
  const renderPlatformSection = (platform: Platform) => {
    const isExpanded = expandedPlatforms.includes(platform.id);
    const totalItems = getTotalItems(platform.items);
    const totalPrice = getTotalPrice(platform.items);

    // Debug log to help identify any platform issues
    console.log(`Rendering platform: ${platform.id}, Items: ${totalItems}`, platform.items);

    return (
      <View key={platform.id} className='mb-4'>
        <TouchableOpacity
          onPress={() => togglePlatform(platform.id)}
          className='bg-white rounded-xl p-4 shadow-sm border border-gray-100'
        >
          <View className='flex-row items-center justify-between'>
            <View className='flex-row items-center flex-1'>
              <View style={{ backgroundColor: platform.color }} className='px-1 mr-3 rounded-xl'>
                <Image
                  source={platform.logo}
                  className='w-24 h-12 rounded-xl'
                  resizeMode='contain'
                />
              </View>
              <View>
                <Text className='text-gray-800 font-medium'>{platform.name}</Text>
                <Text className='text-gray-500 text-sm'>
                  {totalItems} item{totalItems !== 1 ? 's' : ''} · ₹{totalPrice}
                </Text>
              </View>
            </View>

            <View className='flex-row items-center'>
              <TouchableOpacity
                onPress={() => handleClearCart(platform.id)}
                className='mr-3'
                disabled={platform.items.length === 0}
              >
                <Ionicons
                  name='trash-outline'
                  size={20}
                  color={platform.items.length === 0 ? '#D1D5DB' : '#EF4444'}
                />
              </TouchableOpacity>

              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color='#6B7280'
              />
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && platform.items.length > 0 && (
          <View className='mt-3 px-2'>
            {platform.items.map((item) => renderCartItem(item, platform.color))}

            <View className='bg-gray-50 rounded-xl p-4 mt-2'>
              <View className='flex-row justify-between items-center mb-2'>
                <Text className='text-gray-600'>Subtotal ({totalItems} items)</Text>
                <Text className='text-gray-800 font-semibold'>₹{totalPrice}</Text>
              </View>

              <View className='flex-row justify-between items-center'>
                <Text className='text-gray-600'>Delivery</Text>
                <Text className='text-gray-800 font-semibold'>Free</Text>
              </View>

              {/* <TouchableOpacity
                className='rounded-xl py-3 mt-3 items-center shadow-sm'
                style={{ backgroundColor: platform.color }}
                onPress={() => {
                  // Implement platform-specific checkout
                  ToastAndroid.show('Coming soon!', ToastAndroid.SHORT);
                }}
              >
                <Text className='text-white font-semibold text-base'>
                  Checkout {platform.name} Cart (₹{totalPrice})
                </Text>
              </TouchableOpacity> */}
            </View>
          </View>
        )}

        {isExpanded && platform.items.length === 0 && (
          <View className='mt-3 px-2'>
            <View className='bg-gray-50 rounded-xl p-8 items-center'>
              <Ionicons name='cart-outline' size={48} color='#9CA3AF' />
              <Text className='text-gray-500 font-medium text-base mt-3 mb-1'>
                Your cart is empty
              </Text>
              <Text className='text-gray-400 text-sm text-center'>
                Add items from {platform.name} to see them here
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const allItems = platforms.flatMap((p) => p.items);
  const grandTotal = getTotalPrice(allItems);
  const totalItemCount = getTotalItems(allItems);

  return (
    <SafeAreaView className='flex-1 bg-primary'>
      {/* Header */}
      <View className='bg-primary px-4 py-3'>
        <View className='flex-row items-center justify-between'>
          <View className='flex-row items-center my-3'>
            <TouchableOpacity className='mr-3' onPress={() => router.push('/')}>
              <Ionicons name='arrow-back' size={24} color='white' />
            </TouchableOpacity>
            <Text className='text-white text-xl font-semibold'>My Cart</Text>
          </View>

          {totalItemCount > 0 && (
            <TouchableOpacity>
              <Ionicons name='share-outline' size={24} color='white' />
            </TouchableOpacity>
          )}
        </View>

        {totalItemCount > 0 && (
          <Text className='text-blue-100 text-sm mt-1'>
            {totalItemCount} item{totalItemCount !== 1 ? 's' : ''} across{' '}
            {platforms.filter((p) => p.items.length > 0).length} platform
            {platforms.filter((p) => p.items.length > 0).length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      <ScrollView className='flex-1 bg-gray-50 px-4 py-4'>
        {platforms.map(renderPlatformSection)}

        {totalItemCount === 0 && (
          <View className='bg-white rounded-xl p-8 items-center mt-8'>
            <Ionicons name='cart-outline' size={64} color='#9CA3AF' />
            <Text className='text-gray-600 font-semibold text-xl mt-4 mb-2'>
              Your cart is empty
            </Text>
            <Text className='text-gray-400 text-center text-base leading-6'>
              Add items from different platforms to start comparing prices.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/search')}
              className='bg-primary rounded-xl py-3 px-6 mt-6'
            >
              <Text className='text-white font-semibold text-base'>Start Shopping</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom Summary */}
      {totalItemCount > 0 && (
        <View className='bg-white border-t border-gray-200 px-4 py-4'>
          <View className='flex-row justify-between items-center mb-3'>
            <Text className='text-gray-600 font-medium'>Grand Total</Text>
            <Text className='text-gray-800 font-bold text-xl'>₹{grandTotal}</Text>
          </View>

          <TouchableOpacity className='bg-primary rounded-xl py-4 items-center shadow-lg'>
            <Text className='text-white font-semibold text-base'>Checkout All Carts</Text>
          </TouchableOpacity>

          <Text className='text-gray-400 text-xs text-center mt-2'>
            You'll be redirected to each platform for payment
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default CartScreen;
