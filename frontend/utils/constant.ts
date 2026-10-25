import { Platform } from 'react-native';

/**
 * Where the backend lives.
 *
 * Resolution order, and why: an explicit `EXPO_PUBLIC_SERVER_URL` always wins so a build can point
 * anywhere; on web the app and the API run on the same machine, so `localhost` is right; on a
 * physical Android device `localhost` would mean the phone itself, so a LAN address is needed.
 * The previous version hardcoded one LAN IP, which broke the moment the laptop changed networks.
 */
const resolveServerUrl = (): string => {
  const configuredServerUrl = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configuredServerUrl) return configuredServerUrl;
  if (Platform.OS === 'web') return 'http://localhost:5000';
  // Android emulator maps the host machine to 10.0.2.2; a real device needs EXPO_PUBLIC_SERVER_URL.
  return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
};

/**
 * Per-platform display metadata, keyed by the `platformId` the backend returns.
 *
 * `logoSource` is a bundled asset; `remoteLogoUrl` is the platform's own live icon, used only where
 * the platform actually serves one to a plain request. Probed 2026-10-20: Amazon and Flipkart do;
 * Blinkit (403), Zepto (202), Swiggy (404) and BigBasket (404) block static assets the same way
 * they block everything else, so a phone would render HTML instead of a logo.
 */
export const PLATFORM_DISPLAY_MAP: Record<
  string,
  { displayName: string; brandColor: string; logoSource: number | null; remoteLogoUrl?: string }
> = {
  blinkit: {
    displayName: 'Blinkit',
    brandColor: '#F8CB46',
    logoSource: require('../assets/images/blinkit-logo.png'),
  },
  zepto: {
    displayName: 'Zepto',
    brandColor: '#8B5CF6',
    logoSource: require('../assets/images/zepto-logo.png'),
  },
  swiggyInstamart: {
    displayName: 'Swiggy Instamart',
    brandColor: '#FF6B35',
    logoSource: require('../assets/images/instamart-logo2.png'),
  },
  bigBasket: {
    displayName: 'BB Now',
    brandColor: '#84C225',
    logoSource: require('../assets/images/bbnow-logo.png'),
  },
  amazonNow: {
    displayName: 'Amazon Now',
    brandColor: '#FF9900',
    logoSource: null,
    remoteLogoUrl: 'https://m.media-amazon.com/images/G/31/social_share/amazon_logo._CB633266945_.png',
  },
  flipkartMinutes: {
    displayName: 'Flipkart Minutes',
    brandColor: '#2874F0',
    logoSource: null,
    remoteLogoUrl: 'https://www.flipkart.com/favicon.ico',
  },
};

/** Plain-English reasons, so an empty column never says just "no results". */
export const PLATFORM_FAILURE_MESSAGE_MAP: Record<string, string> = {
  blocked: 'Blocked by the platform right now',
  sessionExpired: 'Session expired, retrying next search',
  rateLimited: 'Too many requests, try again shortly',
  notServiceable: 'Not delivering to this location',
  requiresAuthentication: 'Needs a signed-in account',
  timedOut: 'Took too long to respond',
  unexpectedResponse: 'Sent something we could not read',
  notImplemented: 'Not supported yet',
  // Shown when a platform returned products but could not prove they are for the shopper's area.
  // Worded as OUR caution rather than the platform's fault, because that is what it is.
  locationUnverified: 'Could not confirm your area — excluded to keep prices accurate',
};

export const CONSTANTS = {
  colors: {
    primary: '#191ad7', // dark blue
    secondary: '#ffffff',
    ripple: '#d4d4d6',
    gray: '#f5f5f5',
    success: '#0f8f4d',
    danger: '#d32f2f',
    muted: '#6b7280',
  },
  serverUrl: resolveServerUrl(),
};
