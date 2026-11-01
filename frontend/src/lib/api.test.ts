import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler, toQuery, tokenStore } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('cliente API', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.set(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    setUnauthorizedHandler(null);
  });

  it('toQuery omite valores vacíos', () => {
    expect(toQuery({ q: 'vpn', page: 2, status: '', x: undefined, mine: true })).toBe('?q=vpn&page=2&mine=true');
    expect(toQuery({})).toBe('');
  });

  it('envía el token Bearer y el cuerpo JSON', async () => {
    tokenStore.set('abc');
    fetchMock.mockResolvedValue(json(201, { id: '1' }));
    const res = await api.post<{ id: string }>('/tickets', { title: 'x' });
    expect(res.id).toBe('1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tickets');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer abc');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('convierte ProblemDetails en ApiError con errores por campo', async () => {
    fetchMock.mockResolvedValue(json(400, { detail: 'Uno o más campos no son válidos', errors: [{ field: 'title', message: 'Muy corto' }] }));
    const err = (await api.post('/tickets', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.byField).toEqual({ title: 'Muy corto' });
  });

  it('ante un 401 con sesión activa invoca el cierre de sesión', async () => {
    tokenStore.set('expirado');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(json(401, { detail: 'Token inválido o expirado' }));
    await expect(api.get('/auth/me')).rejects.toThrow('Token inválido o expirado');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('informa errores de red con un mensaje amigable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/tickets')).rejects.toMatchObject({ status: 0 });
  });

  it('204 No Content devuelve undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete('/kb/articles/1')).resolves.toBeUndefined();
  });
});
