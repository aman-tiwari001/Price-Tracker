import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { responseHandler } from '../utils/responseHandler';

export const schemaValidator =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedData = schema.parse(req.body);
      req.body = parsedData;
      next();
    } catch (error: ZodError | any) {
      console.log(error.errors);
      return responseHandler(res, 400, false, 'Validation error', null, error.errors);
    }
  };
