import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

describe('Sistema', () => {
  it('GET /health responde ok con la base arriba', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('expone la especificación OpenAPI', async () => {
    const res = await request(ctx.app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });

  it('rutas inexistentes devuelven ProblemDetails 404', async () => {
    const res = await request(ctx.app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('route_not_found');
  });
});

describe('Autenticación', () => {
  it('inicia sesión con la credencial demo y no expone el hash', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'ADMIN@demo.pe', password: 'Demo123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'admin@demo.pe', role: 'admin' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rechaza credenciales inválidas con 401 y mensaje genérico', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'admin@demo.pe', password: 'incorrecta' });
    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Correo o contraseña incorrectos');
  });

  it('valida el cuerpo y lista los errores por campo', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'no-es-correo' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('JSON malformado devuelve 400 controlado', async () => {
    const res = await request(ctx.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('malformed_json');
  });

  it('autoregistro crea siempre rol usuario y exige contraseña fuerte', async () => {
    const weak = await request(ctx.app).post('/api/auth/register').send({ name: 'Ana Pérez', email: 'ana@demo.pe', password: 'debil' });
    expect(weak.status).toBe(400);

    const res = await request(ctx.app).post('/api/auth/register').send({ name: 'Ana Pérez', email: 'ana@demo.pe', password: 'Segura123', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('usuario');

    const dup = await request(ctx.app).post('/api/auth/register').send({ name: 'Ana Pérez', email: 'ana@demo.pe', password: 'Segura123' });
    expect(dup.status).toBe(409);
  });

  it('GET /me requiere token válido', async () => {
    expect((await request(ctx.app).get('/api/auth/me')).status).toBe(401);
    expect((await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer basura')).status).toBe(401);
    const token = await ctx.login('tecnico1@demo.pe');
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('tecnico');
  });
});

describe('Usuarios (solo admin)', () => {
  it('un usuario final recibe 403', async () => {
    const token = await ctx.login('usuario@demo.pe');
    const res = await request(ctx.app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lista con paginación, filtro por rol y búsqueda', async () => {
    const token = await ctx.login('admin@demo.pe');
    const res = await request(ctx.app).get('/api/users?role=tecnico&pageSize=1&page=1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(res.body.data).toHaveLength(1);

    const search = await request(ctx.app).get('/api/users?q=quispe').set('Authorization', `Bearer ${token}`);
    expect(search.body.data[0].email).toBe('tecnico1@demo.pe');
  });

  it('crea un técnico y luego lo desactiva (ya no puede iniciar sesión)', async () => {
    const token = await ctx.login('admin@demo.pe');
    const created = await request(ctx.app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rosa Huamán', email: 'rosa@demo.pe', password: 'Tecnico123', role: 'tecnico' });
    expect(created.status).toBe(201);

    const patched = await request(ctx.app).patch(`/api/users/${created.body.id}`).set('Authorization', `Bearer ${token}`).send({ active: false });
    expect(patched.body.active).toBe(false);

    const login = await request(ctx.app).post('/api/auth/login').send({ email: 'rosa@demo.pe', password: 'Tecnico123' });
    expect(login.status).toBe(401);
  });

  it('un admin no puede desactivarse a sí mismo', async () => {
    const token = await ctx.login('admin@demo.pe');
    const me = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const res = await request(ctx.app).patch(`/api/users/${me.body.id}`).set('Authorization', `Bearer ${token}`).send({ active: false });
    expect(res.status).toBe(422);
  });
});
