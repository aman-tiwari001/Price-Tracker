import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import express from 'express';
import authRoutes from './routes/auth';
import connectDB from './config/database';
import CONSTANTS from './config/constant';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

connectDB();

// Routes
app.use('/api/auth', authRoutes);

app.listen(Number(CONSTANTS.PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${CONSTANTS.PORT}`);
});
