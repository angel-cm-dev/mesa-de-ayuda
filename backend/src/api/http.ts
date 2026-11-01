import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { ValidationError } from '../domain/errors.js';
import { zodIssues } from './middlewares/error-handler.js';

/**
 * Express 4 no captura promesas rechazadas: este envoltorio reenvía el error
 * al manejador global para no repetir try/catch en cada controlador.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Valida datos de entrada contra un DTO Zod y devuelve el valor tipado y normalizado. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError('Uno o más campos no son válidos', zodIssues(result.error));
  return result.data;
}

export const idParam = z.string().uuid('El identificador debe ser un UUID');
