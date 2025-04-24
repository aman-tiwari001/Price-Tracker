import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';

const { width } = Dimensions.get('window');
const ITEM_MARGIN = 8;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (width - ITEM_MARGIN * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

const ProductSkeletonGrid = ({ count = 12 }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-ITEM_WIDTH, ITEM_WIDTH * 2],
  });

  const skeletonItems = Array.from({ length: count });

  return (
    <View style={styles.gridContainer}>
      {skeletonItems.map((_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.imageSkeleton}>
            <Animated.View
              style={[
                styles.shimmer,
                {
                  transform: [{ translateX: shimmerTranslate }],
                },
              ]}
            />
          </View>
          <View style={styles.textLineShort}>
            <Animated.View
              style={[
                styles.shimmer,
                {
                  transform: [{ translateX: shimmerTranslate }],
                },
              ]}
            />
          </View>
          <View style={styles.textLineLong}>
            <Animated.View
              style={[
                styles.shimmer,
                {
                  transform: [{ translateX: shimmerTranslate }],
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
};

const shimmerColor = 'rgba(255,255,255,0.3)';

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: ITEM_MARGIN,
    justifyContent: 'space-between',
  },
  skeletonCard: {
    width: ITEM_WIDTH,
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
    padding: 8,
    overflow: 'hidden',
  },
  imageSkeleton: {
    width: '100%',
    height: ITEM_WIDTH,
    backgroundColor: '#d0d0d0',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  textLineShort: {
    width: '60%',
    height: 10,
    backgroundColor: '#ccc',
    borderRadius: 5,
    marginBottom: 6,
    overflow: 'hidden',
  },
  textLineLong: {
    width: '80%',
    height: 10,
    backgroundColor: '#ccc',
    borderRadius: 5,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    backgroundColor: shimmerColor,
    opacity: 0.5,
    borderRadius: 10,
  },
});

export default ProductSkeletonGrid;
