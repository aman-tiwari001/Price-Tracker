import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import express from 'express';
import authRoutes from './routes/auth.routes';
import appRoutes from './routes/app.routes';
import connectDB from './config/database';
import CONSTANTS from './config/constant';
import { responseHandler } from './utils/responseHandler';
import { fetchFromSwiggyInstamart } from './adapters/swiggy';
import { extractSwiggyProducts } from './services/swiggyExtractor';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

connectDB();

// Routes
app.get('/api', (_, res) => {
  return responseHandler(res, 200, true, 'Welcome to the API');
});
app.use('/api/auth', authRoutes);
app.use('/api/app', appRoutes);

app.use((_, res) => {
  return responseHandler(res, 404, false, 'Route not found');
});

app.listen(Number(CONSTANTS.PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${CONSTANTS.PORT}`);
});
