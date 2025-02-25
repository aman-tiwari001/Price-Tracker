const CONSTANTS = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/price-tracker',
  JWT_SECRET: process.env.JWT_SECRET || '',
  PORT: process.env.PORT || 5000,
  ROLE_TYPES: ['user', 'admin'],
  PERMISSIONS: [],
  PLATFORMS: ['blinkit', 'zepto', 'swiggy', 'bigbasket'],
  PASS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/,
};

export default CONSTANTS;
