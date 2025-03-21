const CONSTANTS = {
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  PORT: process.env.PORT || 5000,
  ROLE_TYPES: ['user', 'admin'],
  PERMISSIONS: [],
  PLATFORMS: ['Blinkit', 'Zepto', 'Swiggy Instamart', 'BB Now'],
  PASS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/,
  BLINKIT_API_URL: process.env.BLINKIT_API_URL || '',
  ZEPTO_API_URL: process.env.ZEPTO_API_URL || '',
  SWIGGY_INSTAMART_API_URL: process.env.SWIGGY_INSTAMART_API_URL || '',
  BB_NOW_API_URL: process.env.BB_NOW_API_URL || '',
};

export default CONSTANTS;
