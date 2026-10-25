import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import Feather from '@expo/vector-icons/Feather';
import { searchProduct } from '@/api';
import PlatformLogo from '@/components/PlatformLogo';
import ProductComparisonCard from '@/components/ProductComparisonCard';
import ProductSkeletonGrid from '@/components/ProductSkeletonGrid';
import { getUserLocation } from '@/utils/getUserLocation';
import { CONSTANTS, PLATFORM_DISPLAY_MAP, PLATFORM_FAILURE_MESSAGE_MAP } from '@/utils/constant';
import { MatchedProductGroup, PlatformSearchResult, ShopperLocation } from '@/types';

type SearchViewMode = 'compare' | 'byPlatform';

/** Shown under the search box so a first-time visitor has something to tap. */
const SUGGESTED_QUERY_LIST = ['milk', 'bread', 'eggs', 'onion', 'curd', 'banana'];

const SearchScreen = () => {
  const searchInputRef = useRef<TextInput | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<SearchViewMode>('compare');
  const [checkIfLoading, setCheckIfLoading] = useState(false);
  const [shopperLocation, setShopperLocation] = useState<ShopperLocation | null>(null);
  const [checkIfLocationIsFallback, setCheckIfLocationIsFallback] = useState(false);
  const [matchedProductGroupList, setMatchedProductGroupList] = useState<MatchedProductGroup[]>([]);
  const [platformResultList, setPlatformResultList] = useState<PlatformSearchResult[]>([]);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState<number | null>(null);
  const [checkIfSearched, setCheckIfSearched] = useState(false);

  useEffect(() => {
    (async () => {
      const resolvedLocation = await getUserLocation();
      setShopperLocation(resolvedLocation);
      setCheckIfLocationIsFallback(resolvedLocation.checkIfFallbackUsed);
    })();
    // Autofocus is a nicety on web and a keyboard-popping annoyance on a phone.
    if (Platform.OS === 'web') searchInputRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const trimmedQuery = rawQuery.trim();
      if (!trimmedQuery) return;
      setCheckIfLoading(true);
      setSearchErrorMessage(null);
      setCheckIfSearched(true);
      try {
        const location = shopperLocation ?? (await getUserLocation());
        if (!shopperLocation) setShopperLocation(location);

        const apiResponse = await searchProduct(trimmedQuery, location);
        setMatchedProductGroupList(apiResponse.data.matchedProductGroupList ?? []);
        setPlatformResultList(apiResponse.data.platformResultList ?? []);
        setElapsedMilliseconds(apiResponse.data.elapsedMilliseconds ?? null);
      } catch (error: any) {
        // Say what actually went wrong. A bare "Something went wrong" leaves the shopper — and
        // anyone debugging — with nothing to act on.
        setSearchErrorMessage(
          error?.response?.data?.message ??
            (error?.code === 'ECONNABORTED'
              ? 'The search took too long. Please try again.'
              : `Could not reach the server at ${CONSTANTS.serverUrl}. Is the backend running?`),
        );
        setMatchedProductGroupList([]);
        setPlatformResultList([]);
      } finally {
        setCheckIfLoading(false);
      }
    },
    [shopperLocation],
  );

  const comparableGroupList = matchedProductGroupList.filter((group) => group.platformCount > 1);
  const singlePlatformGroupList = matchedProductGroupList.filter(
    (group) => group.platformCount === 1,
  );
  const succeededPlatformList = platformResultList.filter((result) => result.checkIfSucceeded);

  const renderPlatformStatusStrip = () => (
    <View style={{ flexGrow: 0, flexShrink: 0 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 10, alignItems: 'center' }}
      >
        {platformResultList.map((result) => {
          const platformDisplay = PLATFORM_DISPLAY_MAP[result.platformId];
          // A platform can answer perfectly well and still have nothing for this search. That is
          // neither success nor failure, and showing it as a green "0" reads as a broken column —
          // so it gets its own neutral chip that says what actually happened.
          const checkIfEmptyResult = result.checkIfSucceeded && result.totalProducts === 0;
          return (
            <View
              key={result.platformId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 6,
                borderRadius: 14,
              backgroundColor: checkIfEmptyResult
                ? '#f3f4f6'
                : result.checkIfSucceeded
                  ? '#e8f7ef'
                  : '#fdecec',
              borderWidth: 1,
              borderColor: checkIfEmptyResult
                ? '#e0e2e6'
                : result.checkIfSucceeded
                  ? '#bfe6d0'
                  : '#f5c6c6',
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: checkIfEmptyResult
                  ? CONSTANTS.colors.muted
                  : result.checkIfSucceeded
                    ? CONSTANTS.colors.success
                    : CONSTANTS.colors.danger,
              }}
            />
            <Text style={{ fontSize: 11, fontWeight: '600' }}>
              {platformDisplay?.displayName ?? result.platformDisplayName}
            </Text>
            <Text style={{ fontSize: 11, color: CONSTANTS.colors.muted }}>
              {checkIfEmptyResult
                ? 'No matches'
                : result.checkIfSucceeded
                  ? `${result.totalProducts}`
                  : (PLATFORM_FAILURE_MESSAGE_MAP[result.failureReason ?? ''] ?? 'Unavailable')}
            </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderCompareView = () => {
    if (comparableGroupList.length === 0 && singlePlatformGroupList.length === 0) return null;
    return (
      <FlatList
        data={[...comparableGroupList, ...singlePlatformGroupList]}
        keyExtractor={(group) => group.groupKey}
        renderItem={({ item }) => <ProductComparisonCard group={item} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        ListHeaderComponent={
          <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted, marginBottom: 10 }}>
            {comparableGroupList.length} product
            {comparableGroupList.length === 1 ? '' : 's'} available on more than one platform
            {singlePlatformGroupList.length > 0
              ? `, plus ${singlePlatformGroupList.length} found on only one`
              : ''}
            .
          </Text>
        }
      />
    );
  };

  const renderByPlatformView = () => (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      {platformResultList.map((result) => {
        const platformDisplay = PLATFORM_DISPLAY_MAP[result.platformId];
        return (
          <View key={result.platformId} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <PlatformLogo
                platformId={result.platformId}
                platformDisplayName={result.platformDisplayName}
                width={74}
                height={30}
              />
              <Text style={{ fontSize: 11, color: CONSTANTS.colors.muted }}>
                {result.checkIfSucceeded && result.totalProducts === 0
                  ? 'No matching products at this store'
                  : result.checkIfSucceeded
                  ? `${result.totalProducts} items${result.storeDeliveryEtaInMinutes ? ` · ${result.storeDeliveryEtaInMinutes} min` : ''}${result.checkIfServedFromCache ? ' · cached' : ''}`
                  : (PLATFORM_FAILURE_MESSAGE_MAP[result.failureReason ?? ''] ??
                    result.failureDetail ??
                    'Unavailable')}
              </Text>
            </View>

            {result.productList.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {result.productList.map((product) => (
                  <Pressable
                    key={product.productKey}
                    onPress={() => product.productWebUrl && Linking.openURL(product.productWebUrl)}
                    style={{
                      width: 132,
                      backgroundColor: CONSTANTS.colors.gray,
                      borderRadius: 10,
                      padding: 8,
                      // A sold-out tile is dimmed AND labelled; colour alone would be invisible to
                      // a colour-blind shopper and to anyone scanning quickly.
                      opacity: product.checkIfInStock ? 1 : 0.5,
                    }}
                  >
                    <Image
                      source={{ uri: product.imageUrlList[0] }}
                      style={{ width: '100%', height: 92, borderRadius: 8 }}
                      resizeMode='contain'
                    />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: CONSTANTS.colors.primary, marginTop: 4 }}>
                      {product.packSizeLabel ?? ''}
                    </Text>
                    <Text style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
                      {product.productName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800' }}>
                        ₹{product.pricing.sellingPriceInRupees ?? '—'}
                      </Text>
                      {product.pricing.maximumRetailPriceInRupees !== null &&
                        product.pricing.sellingPriceInRupees !== null &&
                        product.pricing.maximumRetailPriceInRupees > product.pricing.sellingPriceInRupees && (
                          <Text
                            style={{ fontSize: 10, color: CONSTANTS.colors.muted, textDecorationLine: 'line-through' }}
                          >
                            ₹{product.pricing.maximumRetailPriceInRupees}
                          </Text>
                        )}
                    </View>
                    {product.checkIfInStock ? (
                      product.deliveryEtaInMinutes !== null && (
                        <Text style={{ fontSize: 10, color: CONSTANTS.colors.success, marginTop: 2 }}>
                          {product.deliveryEtaInMinutes} min
                        </Text>
                      )
                    ) : (
                      <Text style={{ fontSize: 10, fontWeight: '700', color: CONSTANTS.colors.danger, marginTop: 2 }}>
                        OUT OF STOCK
                      </Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted }}>
                {result.failureDetail ?? 'No products returned for this search.'}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      {/* Search bar */}
      <View style={{ backgroundColor: CONSTANTS.colors.primary, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => router.push('/')} hitSlop={10}>
            <Octicons name='arrow-left' color='#fff' size={22} />
          </Pressable>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 10,
              paddingHorizontal: 10,
            }}
          >
            <Octicons name='search' color='#000' size={18} />
            <TextInput
              ref={searchInputRef}
              style={{ flex: 1, marginLeft: 8, paddingVertical: 10, fontSize: 15, outlineStyle: 'none' } as any}
              placeholder='Search groceries to compare prices'
              placeholderTextColor='#9ca3af'
              returnKeyType='search'
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => runSearch(searchQuery)}
              // `onSubmitEditing` does not fire for a hardware Enter on react-native-web, so the
              // key is handled explicitly too — otherwise pressing Enter on the web build silently
              // did nothing and only the Search button worked.
              onKeyPress={(event: any) => {
                if (event?.nativeEvent?.key === 'Enter') runSearch(searchQuery);
              }}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Octicons name='x' color='#000' size={18} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => runSearch(searchQuery)}
            style={{ backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <Text style={{ color: CONSTANTS.colors.primary, fontWeight: '800' }}>Search</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Feather name='map-pin' size={12} color='#fff' />
            <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>
              {shopperLocation
                ? `${shopperLocation.addressText}${shopperLocation.pincode ? ` · ${shopperLocation.pincode}` : ''}`
                : 'Finding your location…'}
            </Text>
          </View>
          {checkIfLocationIsFallback && (
            <Text style={{ color: '#dbeafe', fontSize: 10, marginLeft: 17, marginTop: 1 }}>
              Default location — allow location access for prices near you
            </Text>
          )}
        </View>
      </View>

      {/* View toggle */}
      {checkIfSearched && !checkIfLoading && platformResultList.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 6 }}>
          {(['compare', 'byPlatform'] as SearchViewMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 18,
                backgroundColor: viewMode === mode ? CONSTANTS.colors.primary : '#eef0f3',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: viewMode === mode ? '#fff' : '#374151',
                }}
              >
                {mode === 'compare' ? 'Compare prices' : 'By platform'}
              </Text>
            </Pressable>
          ))}
          {elapsedMilliseconds !== null && (
            <Text style={{ fontSize: 11, color: CONSTANTS.colors.muted, alignSelf: 'center' }}>
              {succeededPlatformList.length}/{platformResultList.length} platforms ·{' '}
              {(elapsedMilliseconds / 1000).toFixed(1)}s
            </Text>
          )}
        </View>
      )}

      {checkIfSearched && !checkIfLoading && platformResultList.length > 0 && renderPlatformStatusStrip()}

      {/* Body */}
      {checkIfLoading ? (
        <View style={{ flex: 1 }}>
          <View style={{ alignItems: 'center', paddingVertical: 14, gap: 6 }}>
            <ActivityIndicator color={CONSTANTS.colors.primary} />
            <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted }}>
              Checking all platforms for {shopperLocation?.addressText ?? 'your location'}…
            </Text>
          </View>
          <ProductSkeletonGrid />
        </View>
      ) : searchErrorMessage ? (
        <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
          <Feather name='alert-circle' size={26} color={CONSTANTS.colors.danger} />
          <Text style={{ textAlign: 'center', color: CONSTANTS.colors.danger, fontWeight: '600' }}>
            {searchErrorMessage}
          </Text>
        </View>
      ) : !checkIfSearched ? (
        <View style={{ padding: 24, gap: 14 }}>
          <Text style={{ fontSize: 15, fontWeight: '700' }}>Compare a grocery across platforms</Text>
          <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted }}>
            One search checks Blinkit, Zepto, Swiggy Instamart, BB Now, Amazon Now and Flipkart
            Minutes for your location, then groups the same product so you can see who is cheapest.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTED_QUERY_LIST.map((suggestedQuery) => (
              <Pressable
                key={suggestedQuery}
                onPress={() => {
                  setSearchQuery(suggestedQuery);
                  runSearch(suggestedQuery);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 18,
                  backgroundColor: '#eef0ff',
                }}
              >
                <Text style={{ color: CONSTANTS.colors.primary, fontWeight: '600' }}>
                  {suggestedQuery}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : matchedProductGroupList.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center', gap: 6 }}>
          <Text style={{ fontWeight: '700' }}>No products found for “{searchQuery}”.</Text>
          <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted, textAlign: 'center' }}>
            Every platform answered but none carried this item at {shopperLocation?.addressText}.
          </Text>
        </View>
      ) : viewMode === 'compare' ? (
        renderCompareView()
      ) : (
        renderByPlatformView()
      )}
    </View>
  );
};

export default SearchScreen;
