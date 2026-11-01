import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { TokenService } from '../../application/ports/services.js';
import type { AuthUser, Role } from '../../domain/entities.js';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verifica el JWT del encabezado `Authorization: Bearer <token>`. */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(new UnauthorizedError());
    try {
      req.user = tokens.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Autorización por rol a nivel de endpoint. */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}

/** Obtiene el usuario autenticado (lanza si la ruta olvidó `authenticate`). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
