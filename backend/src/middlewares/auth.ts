import CONSTANTS from '../config/constant';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { responseHandler } from '../utils/responseHandler';

interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const auth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return responseHandler(res, 401, false, 'No token provided');
  }

  try {
    const decoded = jwt.verify(token, CONSTANTS.JWT_SECRET);
    if (typeof decoded !== 'string') {
      req.user = decoded;
    } else {
      return responseHandler(res, 401, false, 'Token is invalid');
    }
    next();
  } catch (err) {
    console.log('Error verifying token: ', err);
    return responseHandler(res, 401, false, 'Token is invalid');
  }
};
