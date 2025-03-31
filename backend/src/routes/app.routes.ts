import { Router } from 'express';
import { searchProduct } from '../controllers/app.controller';

const router = Router();

router.get('/search', searchProduct);

export default router;
