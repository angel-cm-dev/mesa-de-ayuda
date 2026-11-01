import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors.js';

/**
 * Respuesta de error con el formato estándar RFC 7807 (application/problem+json).
 * El frontend puede mostrar siempre `detail` y, si hay, los `errors` por campo.
 */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId?: string;
  errors?: Array<{ field: string; message: string }>;
  [extra: string]: unknown;
}

const TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Prohibido',
  404: 'No encontrado',
  409: 'Conflicto',
  413: 'Contenido demasiado grande',
  422: 'Regla de negocio incumplida',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
};

export const zodIssues = (err: ZodError) =>
  err.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).type('application/problem+json').json({
    type: 'about:blank',
    title: TITLES[404],
    status: 404,
    detail: `La ruta ${req.method} ${req.path} no existe`,
    instance: req.originalUrl,
    code: 'route_not_found',
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'internal_error';
  let detail = 'Ocurrió un error inesperado. Intenta nuevamente.';
  let errors: ProblemDetails['errors'];
  let extra: Record<string, unknown> = {};

  if (err instanceof DomainError) {
    status = err.status;
    code = err.code;
    detail = err.message;
    if (Array.isArray(err.details)) errors = err.details as ProblemDetails['errors'];
    else if (err.details) extra = err.details as Record<string, unknown>;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'validation_error';
    detail = 'Uno o más campos no son válidos';
    errors = zodIssues(err);
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = 'upload_error';
    detail = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el máximo de 5 MB' : err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'malformed_json';
    detail = 'El cuerpo de la petición no es un JSON válido';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'payload_too_large';
    detail = 'El cuerpo de la petición es demasiado grande';
  }

  // Los errores 5xx se registran con stack; los 4xx son "esperados" y solo van a nivel debug.
  if (status >= 500) req.log?.error({ err }, 'Error no controlado');
  else req.log?.debug({ code, detail }, 'Error de cliente');

  const body: ProblemDetails = {
    type: `https://httpstatuses.io/${status}`,
    title: TITLES[status] ?? 'Error',
    status,
    detail,
    instance: req.originalUrl,
    code,
    traceId: String(req.id ?? ''),
    ...(errors ? { errors } : {}),
    ...extra,
  };
  res.status(status).type('application/problem+json').json(body);
};
