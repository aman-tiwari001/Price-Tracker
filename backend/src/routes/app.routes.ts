import { Router } from 'express';
import { listPlatforms, reportPlatformHealth, searchProduct } from '../controllers/app.controller';

const router = Router();

router.get('/search', searchProduct);
router.get('/platforms', listPlatforms);
// Which transport last worked per platform — makes silent access decay observable.
router.get('/health', reportPlatformHealth);

export default router;
