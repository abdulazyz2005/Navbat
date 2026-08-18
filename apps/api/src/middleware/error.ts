import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, ERROR_MESSAGES, errorMessage } from '@navbat/shared';
import { env } from '../env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  // State machine xatolari matn sifatida keladi
  if (err instanceof Error && err.message.startsWith('ILLEGAL_')) {
    const code = err.message.split(':')[0];
    res.status(409).json({ error: { code, message: errorMessage(code), details: err.message } });
    return;
  }

  if (!env.isTest) {
    console.error('[api] kutilmagan xatolik:', err);
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: ERROR_MESSAGES.INTERNAL_ERROR,
      details: env.isProduction ? undefined : String(err),
    },
  });
}
