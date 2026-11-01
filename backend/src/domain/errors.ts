/**
 * Errores de dominio. La capa API los traduce a respuestas ProblemDetails (RFC 7807)
 * sin que el dominio conozca nada de HTTP: solo declara el "tipo" de fallo.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' no existe` : `${resource} no existe`, 'not_found', 404);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'validation_error', 400, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Credenciales inválidas o token ausente') {
    super(message, 'unauthorized', 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'No tienes permiso para realizar esta acción') {
    super(message, 'forbidden', 403);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'conflict', 409);
  }
}

/** Regla de negocio violada (p. ej. transición de estado no permitida). */
export class BusinessRuleError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'business_rule', 422, details);
  }
}
