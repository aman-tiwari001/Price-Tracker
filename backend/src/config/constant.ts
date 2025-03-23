const CONSTANTS = {
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  PORT: process.env.PORT || 5000,
  ROLE_TYPES: ['user', 'admin'],
  PERMISSIONS: [],
  PLATFORMS: {
    blinkit: 'Blinkit',
    zepto: 'Zepto',
    swiggyInstamart: 'Swiggy Instamart',
    bbNow: 'BB Now',
  },
  PASS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/,
  ZEPTO_API_URL1: process.env.ZEPTO_API_URL1 || '',
  ZEPTO_API_URL2: process.env.ZEPTO_API_URL2 || '',
  BB_NOW_API_URL: process.env.BB_NOW_API_URL || '',
  BLINKIT_API_URL: process.env.BLINKIT_API_URL || '',
  SWIGGY_INSTAMART_API_URL: process.env.SWIGGY_INSTAMART_API_URL || '',
  SWIGGY_INSTAMART_WEB_URL: process.env.SWIGGY_INSTAMART_WEB_URL || '',
};

export default CONSTANTS;
