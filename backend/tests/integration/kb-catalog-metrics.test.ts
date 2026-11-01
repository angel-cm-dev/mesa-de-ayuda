import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';

let ctx: TestContext;
let admin: string;
let tec: string;
let user: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  ctx = await createTestContext();
  [admin, tec, user] = await Promise.all(['admin@demo.pe', 'tecnico1@demo.pe', 'usuario@demo.pe'].map((e) => ctx.login(e)));
});
afterAll(() => ctx.close());

describe('Base de conocimiento', () => {
  it('el usuario no ve borradores; el técnico sí', async () => {
    const asUser = await request(ctx.app).get('/api/kb/articles?pageSize=50').set(auth(user));
    const asTech = await request(ctx.app).get('/api/kb/articles?pageSize=50').set(auth(tec));
    expect(asUser.body.meta.total).toBe(3);
    expect(asTech.body.meta.total).toBe(4);
  });

  it('busca por texto y suma vistas al leer', async () => {
    const found = await request(ctx.app).get('/api/kb/articles?q=vpn').set(auth(user));
    expect(found.body.data).toHaveLength(1);
    const article = found.body.data[0];
    const read = await request(ctx.app).get(`/api/kb/articles/${article.id}`).set(auth(user));
    expect(read.body.views).toBe(article.views + 1);
  });

  it('crea artículos con slug único; el usuario no puede crear', async () => {
    const body = { title: 'Cómo limpiar la caché del navegador', content: 'Presiona Ctrl+Shift+Supr y elige "Imágenes y archivos en caché".', published: true };
    const a = await request(ctx.app).post('/api/kb/articles').set(auth(tec)).send(body);
    const b = await request(ctx.app).post('/api/kb/articles').set(auth(tec)).send(body);
    expect(a.body.slug).toBe('como-limpiar-la-cache-del-navegador');
    expect(b.body.slug).toBe('como-limpiar-la-cache-del-navegador-2');
    expect((await request(ctx.app).post('/api/kb/articles').set(auth(user)).send(body)).status).toBe(403);
    expect((await request(ctx.app).delete(`/api/kb/articles/${b.body.id}`).set(auth(admin))).status).toBe(204);
  });
});

describe('Catálogos', () => {
  it('admin crea categorías sin duplicados y edita políticas de SLA', async () => {
    const created = await request(ctx.app).post('/api/categories').set(auth(admin)).send({ name: 'Telefonía' });
    expect(created.status).toBe(201);
    const dup = await request(ctx.app).post('/api/categories').set(auth(admin)).send({ name: 'telefonía' });
    expect(dup.status).toBe(409);

    const invalid = await request(ctx.app).put('/api/sla-policies/alta').set(auth(admin)).send({ responseHours: 10, resolutionHours: 5 });
    expect(invalid.status).toBe(400);
    const updated = await request(ctx.app).put('/api/sla-policies/alta').set(auth(admin)).send({ responseHours: 2, resolutionHours: 6 });
    expect(updated.body).toEqual({ priority: 'alta', responseHours: 2, resolutionHours: 6 });

    const policies = await request(ctx.app).get('/api/sla-policies').set(auth(user));
    expect(policies.body.map((p: { priority: string }) => p.priority)).toEqual(['critica', 'alta', 'media', 'baja']);
  });

  it('un técnico no puede modificar catálogos', async () => {
    const res = await request(ctx.app).post('/api/categories').set(auth(tec)).send({ name: 'Otra' });
    expect(res.status).toBe(403);
  });
});

describe('Métricas', () => {
  it('resume MTTR, cumplimiento de SLA y CSAT de los datos demo', async () => {
    const res = await request(ctx.app).get('/api/metrics/summary').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.totalTickets).toBe(12);
    expect(res.body.csatResponses).toBe(4);
    expect(res.body.csatAvg).toBe(4);
    expect(res.body.mttrHours).toBe(10); // (6 + 2 + 12 + 20) / 4
    expect(res.body.slaCompliancePct).toBe(75); // 3 de 4 dentro del plazo
    expect(Object.values(res.body.assigneeNames)).toEqual(expect.arrayContaining(['Carla Quispe', 'Jorge Ramos']));
  });

  it('el usuario final no accede a métricas', async () => {
    expect((await request(ctx.app).get('/api/metrics/summary').set(auth(user))).status).toBe(403);
  });
});
