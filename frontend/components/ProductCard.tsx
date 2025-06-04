import { View, Text, Image, Pressable } from 'react-native';
import React from 'react';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { CONSTANTS } from '@/utils/constant';
import Feather from '@expo/vector-icons/Feather';

interface ProductCardProps {
  name: string;
  images: string[];
  prices: {
    sellingPrice?: number;
    mrp?: number;
    discountPrice?: number;
  };
  eta: string;
  quantity: string;
  stockAvailability: boolean;
  brand: string;
  category: string;
}

const ProductCard: React.FC<ProductCardProps> = ({
  name,
  images,
  prices,
  eta,
  quantity,
  stockAvailability,
  brand,
  category,
}) => {
  return (
    <View
      className='rounded-lg'
      style={{ backgroundColor: CONSTANTS.colors.gray, padding: 10, gap: 2, width: 130 }}
    >
      <Image
        source={{
          uri: images[0],
        }}
        resizeMode='cover'
        style={{ width: 110, height: 130, borderRadius: 8, margin: 'auto' }}
      />
      <Pressable style={{top: 110, right: 10}} className='flex-row gap-2 absolute self-start bg-primary active:bg-blue-700 justify-center items-center active:scale-95 rounded-xl py-2 px-2 transition duration-150'>
        <Feather color={CONSTANTS.colors.secondary} name='shopping-cart' size={15} />
        <Text className='text-secondary text-center font-semibold' style={{fontSize: 14}}>Add</Text>
      </Pressable>
      <Text
        className='text-primary'
        style={{
          fontSize: 10,
          marginTop: 5,
          fontWeight: 'bold',
          backgroundColor: '#fff',
          alignSelf: 'flex-start',
          paddingHorizontal: 3,
          borderRadius: 5,
        }}
      >
        {quantity}
      </Text>
      <View>
        <Text style={{ wordWrap: 'break-word', lineHeight: 17 }}>
          {name.length > 45 ? name.slice(0, 42) + '...' : name}
        </Text>
        {/* <Text className='font-bold text-wrap'>{brand}</Text> */}
      </View>
      <View className='flex-row items-center mt-4' style={{ gap: 3 }}>
        <FontAwesome6 name='clock' size={9} color='green' />
        <Text style={{ fontSize: 10 }}>{eta.toUpperCase()}</Text>
      </View>
      <View className='flex-row items-center gap-2'>
        <Text className='text-lg font-bold'>₹{prices?.sellingPrice}</Text>
        <Text style={{ fontSize: 11, color: 'gray' }}>MRP</Text>
        <Text style={{ textDecorationLine: 'line-through', fontSize: 11, color: 'gray' }}>
          ₹{prices?.mrp}
        </Text>
      </View>
    </View>
  );
};

export default ProductCard;
