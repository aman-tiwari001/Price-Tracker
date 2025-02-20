const CONSTANTS = {
	MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/price-tracker',
  JWT_SECRET: process.env.JWT_SECRET || '',
  PORT: process.env.PORT || 5000,
  ROLE_TYPES: ['user', 'admin'],
  PERMISSIONS: [],
};

export default CONSTANTS;