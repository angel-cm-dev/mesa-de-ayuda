/**
 * Cliente HTTP mínimo sobre fetch:
 *  - agrega el token JWT a cada petición,
 *  - convierte respuestas de error (ProblemDetails) en ApiError tipado,
 *  - ante un 401 notifica a la app para cerrar sesión.
 */

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: FieldError[] = [],
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Errores por campo como objeto { campo: mensaje } para pintar en formularios. */
  get byField(): Record<string, string> {
    return Object.fromEntries(this.fieldErrors.map((e) => [e.field, e.message]));
  }
}

const TOKEN_KEY = 'helpdesk.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible (modo privado): la sesión dura lo que la pestaña */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/** Construye un querystring omitiendo valores vacíos. */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export async function parseError(res: Response): Promise<ApiError> {
  let body: { detail?: string; title?: string; errors?: FieldError[]; code?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* respuesta sin cuerpo JSON */
  }
  const message = body.detail ?? body.title ?? `Error ${res.status}`;
  return new ApiError(res.status, message, body.errors ?? [], body.code);
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  if (!res.ok) {
    const error = await parseError(res);
    if (res.status === 401 && token) onUnauthorized?.();
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),

  /** Descarga un archivo protegido (requiere el token, por eso no basta con un <a href>). */
  async download(path: string, filename: string) {
    const token = tokenStore.get();
    const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw await parseError(res);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
