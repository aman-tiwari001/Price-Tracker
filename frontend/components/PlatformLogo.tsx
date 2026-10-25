import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { CONSTANTS, PLATFORM_DISPLAY_MAP } from '@/utils/constant';

/**
 * One platform's mark, with a fallback that still reads as intentional.
 *
 * Three sources, in order, because no single one covers every platform:
 *
 *  1. a bundled asset, for the four platforms this repo ships art for;
 *  2. the platform's own live icon, for Amazon Now and Flipkart Minutes — probed 2026-10-20, these
 *     two are the ONLY ones that serve an image to a plain request (Blinkit answers 403, Zepto 202,
 *     Swiggy 404 and BigBasket 404, because their bot defences cover static assets too, so a phone
 *     fetching those URLs would render HTML, not a logo);
 *  3. a coloured name chip, which is also where a broken image lands at runtime.
 *
 * *Transferable shape:* when a remote asset can fail, design the fallback as a first-class state
 * rather than letting a broken image box be the user-visible result.
 */
const PlatformLogo: React.FC<{
  platformId: string;
  platformDisplayName: string;
  width?: number;
  height?: number;
}> = ({ platformId, platformDisplayName, width = 58, height = 24 }) => {
  const platformDisplay = PLATFORM_DISPLAY_MAP[platformId];
  const [hasImageFailed, setHasImageFailed] = useState(false);

  const logoImageSource = platformDisplay?.logoSource
    ? platformDisplay.logoSource
    : platformDisplay?.remoteLogoUrl
      ? { uri: platformDisplay.remoteLogoUrl }
      : null;

  if (logoImageSource && !hasImageFailed) {
    return (
      <Image
        source={logoImageSource}
        onError={() => setHasImageFailed(true)}
        accessibilityLabel={platformDisplay?.displayName ?? platformDisplayName}
        style={{
          width,
          height,
          borderRadius: 4,
          backgroundColor: `${platformDisplay?.brandColor ?? CONSTANTS.colors.muted}22`,
        }}
        resizeMode='contain'
      />
    );
  }

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 4,
        justifyContent: 'center',
        paddingHorizontal: 3,
        backgroundColor: `${platformDisplay?.brandColor ?? CONSTANTS.colors.muted}22`,
        borderWidth: 1,
        borderColor: `${platformDisplay?.brandColor ?? CONSTANTS.colors.muted}66`,
      }}
    >
      <Text
        style={{ fontSize: 9, textAlign: 'center', fontWeight: '800', color: '#374151' }}
        numberOfLines={2}
      >
        {platformDisplay?.displayName ?? platformDisplayName}
      </Text>
    </View>
  );
};

export default PlatformLogo;
