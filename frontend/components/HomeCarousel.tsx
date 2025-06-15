import { View, Text, Dimensions, Image } from 'react-native';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import { useRef } from 'react';
import { configureReanimatedLogger } from 'react-native-reanimated';

configureReanimatedLogger({
  strict: false,
});

const HomeCarousel = ({ setCurrentIndex }: { setCurrentIndex: Function }) => {
  const width = Dimensions.get('window').width;
  const ref = useRef<ICarouselInstance>(null);
  const carouselItems = [
    {
      text: 'Find the best price at one place',
      imgSrc: require('../assets/images/banner1.png'),
    },
    {
      text: 'No more switching between apps',
      imgSrc: require('../assets/images/banner2.png'),
    },
    {
      text: 'Compare prices and save money',
      imgSrc: null,
    },
    {
      text: 'Search across major quick commerce apps',
      imgSrc: require('../assets/images/banner2.png'),
    },
  ];

  const handleProgressChange = (_: number, progress: number) => {
    const currentIdx = Math.round(progress);
    setCurrentIndex(currentIdx % carouselItems.length);
  };

  return (
    <Carousel
      ref={ref}
      width={width - 30}
      height={width - 100}
      style={{
        borderRadius: 12,
        borderColor: '#fff',
        borderWidth: 1,
        backgroundColor: '#fff',
        shadowColor: '#000',
        elevation: 2,
      }}
      loop={true}
      data={carouselItems}
      autoPlay={true}
      autoPlayInterval={3000}
      onProgressChange={handleProgressChange}
      renderItem={({ item }) => (
        <View
          style={{
            flex: 1,
            padding: 10,
            justifyContent: 'center',
            backgroundColor: '#fff',
          }}
        >
          <Image
            source={item.imgSrc || require('../assets/images/logo.png')}
            style={{ width: '100%', height: 220, resizeMode: 'contain' }}
          />
          <Text className='text-lg text-center font-bold mx-auto mt-4 text-primary'>
            {item.text}
          </Text>
        </View>
      )}
    />
  );
};

export default HomeCarousel;
