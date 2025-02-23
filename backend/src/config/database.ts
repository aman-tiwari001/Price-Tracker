import mongoose from 'mongoose';
import CONSTANTS from './constant';

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(CONSTANTS.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

export default connectDB;
