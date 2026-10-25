import React, { useMemo } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useCartStore } from '@/store/cartStore';
import { CONSTANTS, PLATFORM_DISPLAY_MAP } from '@/utils/constant';
import PlatformLogo from '@/components/PlatformLogo';

/**
 * The shopping list, grouped by platform.
 *
 * It is a LIST, not a checkout: this app cannot place an order for the shopper, so each platform
 * group ends in a link that opens that platform's own site. Saying "Open Blinkit" rather than
 * "Checkout" keeps the promise honest.
 *
 * Grouping is computed with `useMemo` from the store. The previous version mirrored the store into
 * component state inside a `useEffect` and mutated that array in place, so the cart could show a
 * stale total after a quantity change — derived data belongs in a derivation, not in state.
 */
const CartScreen = () => {
  const { items, removeItem, clearCart, incrementQuantity, decrementQuantity } = useCartStore();

  const platformGroupList = useMemo(() => {
    const lineListByPlatformId = new Map<string, typeof items>();
    items.forEach((line) => {
      const existingList = lineListByPlatformId.get(line.product.platformId);
      if (existingList) existingList.push(line);
      else lineListByPlatformId.set(line.product.platformId, [line]);
    });
    return [...lineListByPlatformId.entries()].map(([platformId, lineList]) => ({
      platformId,
      platformDisplay: PLATFORM_DISPLAY_MAP[platformId],
      lineList,
      totalItemCount: lineList.reduce((runningTotal, line) => runningTotal + line.quantity, 0),
      totalPriceInRupees: lineList.reduce(
        (runningTotal, line) =>
          runningTotal + (line.product.sellingPriceInRupees ?? 0) * line.quantity,
        0,
      ),
    }));
  }, [items]);

  const cheapestGroup = platformGroupList.reduce<(typeof platformGroupList)[number] | null>(
    (best, group) => (best === null || group.totalPriceInRupees < best.totalPriceInRupees ? group : best),
    null,
  );

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <Ionicons name='cart-outline' size={52} color={CONSTANTS.colors.muted} />
        <Text style={{ fontSize: 16, fontWeight: '700' }}>Your list is empty</Text>
        <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted, textAlign: 'center' }}>
          Search for a grocery, compare the prices, and add the cheapest to your list.
        </Text>
        <Pressable
          onPress={() => router.push('/search')}
          style={{
            backgroundColor: CONSTANTS.colors.primary,
            paddingHorizontal: 20,
            paddingVertical: 11,
            borderRadius: 10,
            marginTop: 4,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Start comparing</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>Your list</Text>
        <Pressable onPress={clearCart}>
          <Text style={{ color: CONSTANTS.colors.danger, fontWeight: '600', fontSize: 12 }}>
            Clear all
          </Text>
        </Pressable>
      </View>

      {platformGroupList.length > 1 && cheapestGroup && (
        <Text style={{ fontSize: 12, color: CONSTANTS.colors.success, marginBottom: 10, fontWeight: '600' }}>
          Cheapest basket: {cheapestGroup.platformDisplay?.displayName ?? cheapestGroup.platformId} at ₹
          {cheapestGroup.totalPriceInRupees.toFixed(2)}
        </Text>
      )}

      {platformGroupList.map((group) => (
        <View
          key={group.platformId}
          style={{
            borderWidth: 1,
            borderColor: '#ececec',
            borderRadius: 14,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <PlatformLogo
              platformId={group.platformId}
              platformDisplayName={group.platformDisplay?.displayName ?? group.platformId}
              width={74}
              height={28}
            />
            <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted }}>
              {group.totalItemCount} item{group.totalItemCount === 1 ? '' : 's'} · ₹
              {group.totalPriceInRupees.toFixed(2)}
            </Text>
          </View>

          {group.lineList.map((line) => (
            <View
              key={line.product.productKey}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}
            >
              {line.product.imageUrl ? (
                <Image
                  source={{ uri: line.product.imageUrl }}
                  style={{ width: 42, height: 42, borderRadius: 7, backgroundColor: CONSTANTS.colors.gray }}
                  resizeMode='contain'
                />
              ) : (
                <View style={{ width: 42, height: 42, borderRadius: 7, backgroundColor: CONSTANTS.colors.gray }} />
              )}

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12 }} numberOfLines={2}>
                  {line.product.productName}
                </Text>
                <Text style={{ fontSize: 11, color: CONSTANTS.colors.muted }}>
                  {line.product.packSizeLabel ?? ''} · ₹{line.product.sellingPriceInRupees ?? '—'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => decrementQuantity(line.product.productKey)} hitSlop={8}>
                  <Feather name='minus-circle' size={19} color={CONSTANTS.colors.primary} />
                </Pressable>
                <Text style={{ fontWeight: '700', minWidth: 16, textAlign: 'center' }}>
                  {line.quantity}
                </Text>
                <Pressable onPress={() => incrementQuantity(line.product.productKey)} hitSlop={8}>
                  <Feather name='plus-circle' size={19} color={CONSTANTS.colors.primary} />
                </Pressable>
                <Pressable onPress={() => removeItem(line.product.productKey)} hitSlop={8}>
                  <Feather name='trash-2' size={17} color={CONSTANTS.colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => {
              const firstLinkedLine = group.lineList.find((line) => line.product.productWebUrl);
              if (firstLinkedLine?.product.productWebUrl) {
                Linking.openURL(firstLinkedLine.product.productWebUrl);
              }
            }}
            style={{
              backgroundColor: CONSTANTS.colors.primary,
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              Open {group.platformDisplay?.displayName ?? group.platformId} to order
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
};

export default CartScreen;
