import mongoose from 'mongoose';
import CONSTANTS from './constant';

/**
 * Connects to MongoDB, without making it a condition of the server starting.
 *
 * MongoDB backs only the `User` and `Role` documents used by the auth routes. Price search — the
 * whole product — touches neither. The previous version called `process.exit(1)` on a failed
 * connection, so a database that is merely unreachable took the entire price-comparison API down
 * with it. Now the auth routes fail on their own if they are used, and search keeps working.
 *
 * *Transferable shape:* fail-open on a dependency that only part of the system needs; reserve
 * fail-closed for dependencies the whole system cannot be correct without.
 */
const connectDB = async (): Promise<void> => {
  if (!CONSTANTS.MONGODB_URI) {
    console.warn('MONGODB_URI is not set — auth routes will not work, search is unaffected.');
    return;
  }
  try {
    await mongoose.connect(CONSTANTS.MONGODB_URI, {
      // Without this, a missing database makes every auth request hang for 30 s before failing.
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.warn(
      'MongoDB connection failed — auth routes will not work, search is unaffected:',
      error instanceof Error ? error.message : error,
    );
  }
};

export default connectDB;
