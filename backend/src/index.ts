import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import express from 'express';
import authRoutes from './routes/auth.routes';
import appRoutes from './routes/app.routes';
import connectDB from './config/database';
import CONSTANTS from './config/constant';
import { closeHeadlessBrowser, warmUpHeadlessBrowser } from './services/headlessBrowserPool';
import { shutdownImpersonationClients } from './services/httpImpersonationClient';
import { responseHandler } from './utils/responseHandler';

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

const server = app.listen(Number(CONSTANTS.PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${CONSTANTS.PORT}`);
  // Zepto searches run through a real browser; launching it now keeps that cost out of the first
  // shopper's request.
  void warmUpHeadlessBrowser();
});

/**
 * CycleTLS runs a Go child process and Puppeteer runs Chrome; neither is a child of the HTTP server,
 * so without this the process hangs on shutdown instead of exiting. Both shutdowns are best-effort:
 * a failure to close a helper must not stop the server from exiting.
 */
const shutdownGracefully = async (signalName: string): Promise<void> => {
  console.log(`Received ${signalName}, shutting down.`);
  server.close();
  await Promise.allSettled([shutdownImpersonationClients(), closeHeadlessBrowser()]);
  process.exit(0);
};

process.on('SIGINT', () => void shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => void shutdownGracefully('SIGTERM'));
