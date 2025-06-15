import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';

const { width } = Dimensions.get('window');
const ITEM_MARGIN = 12;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (width - ITEM_MARGIN * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

// Base color variations
const BASE_COLOR = '#191ad7';
const LIGHTER_SHADE = 'rgba(25, 26, 215, 0.05)';
const LIGHT_SHADE = 'rgba(25, 26, 215, 0.08)';
const MEDIUM_SHADE = 'rgba(25, 26, 215, 0.12)';
const SHIMMER_COLOR = 'rgba(255, 255, 255, 0.4)';

const ProductSkeletonGrid = ({ count = 12 }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        })
      ])
    );
    
    animation.start();
    
    return () => {
      animation.stop();
    };
  }, [shimmerAnim]);

  const getShimmerAnimation = (index: number) => {
    const delay = index * 120;
    
    const translateX = shimmerAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [-ITEM_WIDTH, 0, ITEM_WIDTH],
    });
    
    const translateY = shimmerAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [-ITEM_WIDTH, 0, ITEM_WIDTH],
    });

    const opacity = shimmerAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.3, 0.6, 0.3],
    });

    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: '35deg' },
      ],
      opacity,
    };
  };

  const renderShimmer = (index: number) => (
    <Animated.View
      style={[
        styles.shimmer,
        getShimmerAnimation(index),
      ]}
    />
  );

  return (
    <View style={styles.gridContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.imageSkeleton}>
            {renderShimmer(index)}
          </View>
          <View style={styles.contentContainer}>
            <View style={styles.titleContainer}>
              <View style={styles.textLineShort}>
                {renderShimmer(index)}
              </View>
              <View style={[styles.textLineLong, styles.description]}>
                {renderShimmer(index)}
              </View>
            </View>
            <View style={styles.priceSection}>
              <View style={styles.price}>
                {renderShimmer(index)}
              </View>
              <View style={styles.discount}>
                {renderShimmer(index)}
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: ITEM_MARGIN,
    gap: ITEM_MARGIN,
    backgroundColor: 'white',
  },
  skeletonCard: {
    width: ITEM_WIDTH,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    overflow: 'hidden',
    shadowColor: BASE_COLOR,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: LIGHTER_SHADE,
  },
  imageSkeleton: {
    width: '100%',
    height: ITEM_WIDTH * 0.9,
    backgroundColor: LIGHTER_SHADE,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  contentContainer: {
    gap: 12,
  },
  titleContainer: {
    gap: 8,
  },
  textLineShort: {
    width: '65%',
    height: 14,
    backgroundColor: LIGHT_SHADE,
    borderRadius: 7,
    overflow: 'hidden',
  },
  textLineLong: {
    width: '85%',
    height: 12,
    backgroundColor: LIGHTER_SHADE,
    borderRadius: 6,
    overflow: 'hidden',
  },
  description: {
    marginTop: 4,
  },
  priceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  price: {
    width: '45%',
    height: 20,
    backgroundColor: MEDIUM_SHADE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  discount: {
    width: '35%',
    height: 20,
    backgroundColor: LIGHT_SHADE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  shimmer: {
    width: '250%',
    height: '250%',
    backgroundColor: SHIMMER_COLOR,
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    borderRadius: 20,
  },
});

export default ProductSkeletonGrid;