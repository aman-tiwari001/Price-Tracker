import { CONSTANTS } from '@/utils/constant';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Octicons from '@expo/vector-icons/Octicons';
import HomeCarousel from '@/components/HomeCarousel';
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getUserLocation } from '@/utils/getUserLocation';
import { useLocationStore } from '@/store/locationStore';

export default function HomeScreen() {
  const searchRef = useRef<TextInput>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { location, updateLocation } = useLocationStore();

  const onShare = async () => {
    try {
      const result = await Share.share({
        message:
          'Check out this awesome app: https://huppor.com\nCompare grocery prices across Blinkit, Zepto, Instamart, BigBasket & more!',
        url: 'https://huppor.com',
        title: 'Huppor: Compare Grocery Prices',
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log('Shared with activity type:', result.activityType);
        } else {
          console.log('Shared successfully');
        }
      } else if (result.action === Share.dismissedAction) {
        console.log('Share dismissed');
      }
    } catch (error: any) {
      Alert.alert('Error sharing', error.message);
    }
  };

  useEffect(() => {
    (async () => {
      const res = await getUserLocation();
      updateLocation({
        lat: res.lat,
        lng: res.lng,
        address: res.address,
      });
    })();
  }, []);

  return (
    <GestureHandlerRootView>
      <ScrollView className='h-full w-full'>
        <View className='bg-primary p-4 pb-7'>
          <View className='flex flex-row justify-start pb-2 text-white gap-3'>
            <FontAwesome6 name='location-dot' size={20} color={CONSTANTS.colors.secondary} />
            <Text className='text-xl text-secondary'>
              {location?.address
                ? location.address.name +
                  ', ' +
                  location.address.district +
                  ', ' +
                  location.address.city
                : 'Your Location'}
            </Text>
          </View>
          <View className='mt-4 w-full flex-row items-center rounded-xl bg-gray-100 px-4 py-4'>
            <Octicons name='search' color='#000' size={24} />
            <Text className='flex-1 ml-2 text-lg' onPress={() => router.push('/search')}>
              Search your groceries
            </Text>
          </View>
        </View>
        <View className='mx-auto my-10 flex items-center justify-center'>
          <HomeCarousel setCurrentIndex={setCurrentIndex} />

          <View className='flex-row items-center justify-center gap-2 mt-4'>
            {[...Array(4)].map((_, index) => (
              <View
                key={index}
                className={`${index === currentIndex ? 'bg-primary' : 'bg-gray-400'} h-2 w-2 rounded-full`}
              />
            ))}
          </View>

          {/* <Pressable
            onPress={() => Linking.openURL(`whatsapp://send?phone=99999999999&text=Hi`)}
            className='absolute bottom-[-260px] right-0 rounded-full p-0 active:scale-95 transition duration-150 bg-white'
          >
            <Image
              source={require('../../assets/images/whatsapp-logo.png')}
              className='w-16 h-16 rounded-full'
            />
          </Pressable> */}
        </View>
        <Pressable className='bg-primary active:bg-blue-700 mb-7 active:scale-95 rounded-xl mx-auto py-3 px-2 w-[40%] transition duration-150'>
          <Text
            className='text-secondary font-semibold text-center text-lg'
            onPress={() => router.push('/search')}
          >
            Start Comparing
          </Text>
        </Pressable>
        <View>
          <Image
            source={require('../../assets/images/logo.png')}
            style={{ width: '35%', height: 50, resizeMode: 'contain' }}
            className='mx-auto mt-5'
          />
          <Pressable onPress={onShare} className='mx-auto flex my-5 flex-row items-center gap-2'>
            <Feather name='share' size={20} color={CONSTANTS.colors.primary} />
            <Text className='text-lg text-primary font-bold'>Share App</Text>
          </Pressable>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
