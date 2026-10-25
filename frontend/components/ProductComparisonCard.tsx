import React from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { CONSTANTS, PLATFORM_DISPLAY_MAP } from '@/utils/constant';
import { MatchedPlatformOffer, MatchedProductGroup } from '@/types';
import { useCartStore } from '@/store/cartStore';
import PlatformLogo from './PlatformLogo';

/** Below this the club is a weaker guess, and the card says so rather than implying certainty. */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

const PlatformOfferRow: React.FC<{
  offer: MatchedPlatformOffer;
  groupKey: string;
  packSizeLabel: string | null;
  /** False when every in-stock offer ties, so the badge would mark every row and mean nothing. */
  shouldShowCheapestBadge: boolean;
}> = ({ offer, groupKey, packSizeLabel, shouldShowCheapestBadge }) => {
  const { addItem } = useCartStore();
  const platformDisplay = PLATFORM_DISPLAY_MAP[offer.platformId];
  const checkIfDiscounted =
    offer.maximumRetailPriceInRupees !== null &&
    offer.sellingPriceInRupees !== null &&
    offer.maximumRetailPriceInRupees > offer.sellingPriceInRupees;

  return (
    <Pressable
      onPress={() => offer.productWebUrl && Linking.openURL(offer.productWebUrl)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        marginBottom: 6,
        backgroundColor: offer.checkIfCheapest && shouldShowCheapestBadge ? '#e8f7ef' : '#fafafa',
        borderWidth: 1,
        borderColor:
          offer.checkIfCheapest && shouldShowCheapestBadge ? CONSTANTS.colors.success : '#ececec',
        opacity: offer.checkIfInStock ? 1 : 0.55,
      }}
    >
      <PlatformLogo
        platformId={offer.platformId}
        platformDisplayName={offer.platformDisplayName}
      />

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 11, color: CONSTANTS.colors.muted }} numberOfLines={1}>
          {offer.productName}
        </Text>
        {offer.deliveryEtaInMinutes !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Feather name='clock' size={9} color={CONSTANTS.colors.success} />
            <Text style={{ fontSize: 10, color: CONSTANTS.colors.success }}>
              {offer.deliveryEtaInMinutes} min
            </Text>
          </View>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', minWidth: 78 }}>
        {offer.checkIfInStock ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '800' }}>
                ₹{offer.sellingPriceInRupees ?? '—'}
              </Text>
              {checkIfDiscounted && (
                <Text
                  style={{ fontSize: 10, color: CONSTANTS.colors.muted, textDecorationLine: 'line-through' }}
                >
                  ₹{offer.maximumRetailPriceInRupees}
                </Text>
              )}
            </View>
            {offer.checkIfCheapest && shouldShowCheapestBadge && (
              <Text style={{ fontSize: 9, fontWeight: '700', color: CONSTANTS.colors.success }}>
                CHEAPEST
              </Text>
            )}
          </>
        ) : (
          <Text style={{ fontSize: 11, fontWeight: '700', color: CONSTANTS.colors.danger }}>
            Out of stock
          </Text>
        )}
      </View>

      {offer.checkIfInStock && (
        <Pressable
          // `stopPropagation` matters: without it this also fires the row's own press, which opens
          // the platform's website — so adding to the list would navigate the shopper away.
          onPress={(event) => {
            event.stopPropagation();
            addItem({
              productKey: `${groupKey}:${offer.platformId}`,
              productName: offer.productName,
              platformId: offer.platformId,
              packSizeLabel: offer.packSizeLabel ?? packSizeLabel,
              imageUrl: offer.imageUrl,
              sellingPriceInRupees: offer.sellingPriceInRupees,
              maximumRetailPriceInRupees: offer.maximumRetailPriceInRupees,
              productWebUrl: offer.productWebUrl,
            });
          }}
          hitSlop={8}
          style={{ marginLeft: 10, padding: 4 }}
        >
          <Feather name='plus-circle' size={20} color={CONSTANTS.colors.primary} />
        </Pressable>
      )}
    </Pressable>
  );
};

/**
 * One product, priced on every platform that sells it.
 *
 * This is the app's whole point, so the card leads with the comparison — the saving and the
 * cheapest platform — rather than with the product, which the shopper already knows they want.
 */
const ProductComparisonCard: React.FC<{ group: MatchedProductGroup }> = ({ group }) => {
  const cheapestOffer = group.offerList.find((offer) => offer.checkIfCheapest);
  const checkIfLowConfidence = group.matchConfidence < LOW_CONFIDENCE_THRESHOLD;
  // Stock is as decision-relevant as price: a cheaper platform that cannot deliver it is not an
  // option, so the card states the out-of-stock count instead of leaving the shopper to read rows.
  const outOfStockOfferList = group.offerList.filter((offer) => !offer.checkIfInStock);
  // A badge on every row is the same as a badge on none. When the cheapest and dearest in-stock
  // prices are equal there is no winner to point at, and the heading already says so.
  const shouldShowCheapestBadge =
    group.cheapestPriceInRupees !== null &&
    group.dearestPriceInRupees !== null &&
    group.cheapestPriceInRupees < group.dearestPriceInRupees;
  const checkIfEveryOfferOutOfStock = outOfStockOfferList.length === group.offerList.length;

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#ececec',
      }}
    >
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        {group.imageUrl ? (
          <Image
            source={{ uri: group.imageUrl }}
            style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: CONSTANTS.colors.gray }}
            resizeMode='contain'
          />
        ) : (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 10,
              backgroundColor: CONSTANTS.colors.gray,
            }}
          />
        )}

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', lineHeight: 19 }} numberOfLines={2}>
            {group.canonicalProductName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {group.packSizeLabel && (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: CONSTANTS.colors.primary,
                  backgroundColor: '#eef0ff',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 5,
                }}
              >
                {group.packSizeLabel}
              </Text>
            )}
            <Text style={{ fontSize: 11, color: CONSTANTS.colors.muted }}>
              {group.platformCount} platform{group.platformCount > 1 ? 's' : ''}
            </Text>
          </View>

          {checkIfEveryOfferOutOfStock ? (
            <Text style={{ fontSize: 12, fontWeight: '700', color: CONSTANTS.colors.danger, marginTop: 5 }}>
              Out of stock on all {group.platformCount} platform{group.platformCount > 1 ? 's' : ''}
            </Text>
          ) : group.maximumSavingInRupees !== null && group.maximumSavingInRupees > 0 ? (
            <Text style={{ fontSize: 12, fontWeight: '700', color: CONSTANTS.colors.success, marginTop: 5 }}>
              Save ₹{group.maximumSavingInRupees} on {cheapestOffer?.platformDisplayName}
            </Text>
          ) : (
            group.platformCount > 1 && (
              <Text style={{ fontSize: 12, color: CONSTANTS.colors.muted, marginTop: 5 }}>
                Same price everywhere
              </Text>
            )
          )}

          {!checkIfEveryOfferOutOfStock && outOfStockOfferList.length > 0 && (
            <Text style={{ fontSize: 11, color: CONSTANTS.colors.danger, marginTop: 3 }}>
              Out of stock on {outOfStockOfferList.map((offer) => offer.platformDisplayName).join(', ')}
            </Text>
          )}
        </View>
      </View>

      {group.offerList.map((offer) => (
        <PlatformOfferRow
          key={`${group.groupKey}:${offer.platformId}`}
          offer={offer}
          groupKey={group.groupKey}
          packSizeLabel={group.packSizeLabel}
          shouldShowCheapestBadge={shouldShowCheapestBadge}
        />
      ))}

      {checkIfLowConfidence && (
        <Text style={{ fontSize: 10, color: CONSTANTS.colors.muted, marginTop: 2 }}>
          These may be slightly different variants — check the names before buying.
        </Text>
      )}
    </View>
  );
};

export default ProductComparisonCard;
