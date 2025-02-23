import { Response } from 'express';

export const responseHandler = (
  res: Response,
  status: number,
  success: boolean,
  message: string,
  data?: unknown,
  error?: unknown,
) => {
  if (success) {
    res.status(status).json({
      success,
      message,
      data,
    });
  } else {
    res.status(status).json({
      success,
      message,
      error,
    });
  }
};
