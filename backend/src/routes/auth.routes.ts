import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { schemaValidator } from '../middlewares/schemaValidator';
import { loginSchema, registerSchema } from '../schemas/auth';

const router = Router();

router.post('/register', schemaValidator(registerSchema), register);
router.post('/login', schemaValidator(loginSchema), login);

export default router;
