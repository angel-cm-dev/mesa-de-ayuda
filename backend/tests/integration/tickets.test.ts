import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './setup.js';

let ctx: TestContext;
let admin: string;
let tec1: string;
let tec2: string;
let user: string;
let user2: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createTicket(token: string, body: Record<string, unknown> = {}) {
  const res = await request(ctx.app)
    .post('/api/tickets')
    .set(auth(token))
    .send({ title: 'No funciona la impresora', description: 'La impresora del segundo piso no imprime nada.', priority: 'alta', ...body });
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  ctx = await createTestContext();
  [admin, tec1, tec2, user, user2] = await Promise.all(
    ['admin@demo.pe', 'tecnico1@demo.pe', 'tecnico2@demo.pe', 'usuario@demo.pe', 'usuario2@demo.pe'].map((e) => ctx.login(e)),
  );
});
afterAll(() => ctx.close());

describe('Creación y visibilidad', () => {
  it('crea un ticket con número correlativo y vencimientos según la política de SLA', async () => {
    const t = await createTicket(user);
    expect(t.status).toBe('nuevo');
    expect(t.number).toBe(13); // el seed crea 12
    const created = new Date(t.createdAt).getTime();
    expect(new Date(t.responseDueAt).getTime() - created).toBe(4 * 3_600_000);
    expect(new Date(t.resolutionDueAt).getTime() - created).toBe(8 * 3_600_000);
    expect(t.slaState).toBe('a_tiempo');
  });

  it('valida campos obligatorios', async () => {
    const res = await request(ctx.app).post('/api/tickets').set(auth(user)).send({ title: 'x', priority: 'urgente' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('un usuario solo ve sus propios tickets y recibe 404 en ajenos', async () => {
    const mine = await createTicket(user2, { title: 'Ticket privado de Martín' });
    const list = await request(ctx.app).get('/api/tickets?pageSize=100').set(auth(user));
    expect(list.status).toBe(200);
    expect(list.body.data.every((t: { requesterName: string }) => t.requesterName === 'Lucía Torres')).toBe(true);
    expect((await request(ctx.app).get(`/api/tickets/${mine.id}`).set(auth(user))).status).toBe(404);
  });

  it('lista con filtros, búsqueda por número y orden por prioridad', async () => {
    const byStatus = await request(ctx.app).get('/api/tickets?status=nuevo,asignado&pageSize=100').set(auth(admin));
    expect(byStatus.body.data.every((t: { status: string }) => ['nuevo', 'asignado'].includes(t.status))).toBe(true);

    const byNumber = await request(ctx.app).get('/api/tickets?q=HD-0006').set(auth(admin));
    expect(byNumber.body.data[0].number).toBe(6);

    const sorted = await request(ctx.app).get('/api/tickets?sort=priority&order=desc&pageSize=1').set(auth(admin));
    expect(sorted.body.data[0].priority).toBe('critica');
    expect(sorted.body.meta.totalPages).toBeGreaterThan(1);
  });
});

describe('Asignación', () => {
  it('round-robin reparte al técnico con asignación más antigua y alterna', async () => {
    const a = await createTicket(user);
    const b = await createTicket(user);
    const r1 = await request(ctx.app).post(`/api/tickets/${a.id}/assign`).set(auth(admin)).send({ mode: 'auto' });
    const r2 = await request(ctx.app).post(`/api/tickets/${b.id}/assign`).set(auth(admin)).send({ mode: 'auto' });
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('asignado');
    expect(r1.body.assigneeName).toBe('Jorge Ramos'); // tenía la asignación más antigua en el seed
    expect(r2.body.assigneeName).toBe('Carla Quispe');
  });

  it('un técnico puede tomar un ticket libre pero no reasignar', async () => {
    const t = await createTicket(user);
    const techs = await request(ctx.app).get('/api/users/technicians').set(auth(tec1));
    const carla = techs.body.find((x: { email: string }) => x.email === 'tecnico1@demo.pe');
    const jorge = techs.body.find((x: { email: string }) => x.email === 'tecnico2@demo.pe');

    const take = await request(ctx.app).post(`/api/tickets/${t.id}/assign`).set(auth(tec1)).send({ mode: 'manual', assigneeId: carla.id });
    expect(take.status).toBe(200);
    const steal = await request(ctx.app).post(`/api/tickets/${t.id}/assign`).set(auth(tec2)).send({ mode: 'manual', assigneeId: jorge.id });
    expect(steal.status).toBe(403);
  });

  it('el usuario final no puede asignar', async () => {
    const t = await createTicket(user);
    const res = await request(ctx.app).post(`/api/tickets/${t.id}/assign`).set(auth(user)).send({ mode: 'auto' });
    expect(res.status).toBe(403);
  });
});

describe('Ciclo de vida, SLA y auditoría', () => {
  it('flujo completo: asignar → en progreso → espera → resuelto → encuesta → cerrado', async () => {
    const t = await createTicket(user, { priority: 'media' }); // resolución 24 h
    const techs = await request(ctx.app).get('/api/users/technicians').set(auth(admin));
    const carla = techs.body.find((x: { email: string }) => x.email === 'tecnico1@demo.pe');
    await request(ctx.app).post(`/api/tickets/${t.id}/assign`).set(auth(admin)).send({ mode: 'manual', assigneeId: carla.id });

    const progress = await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(tec1)).send({ status: 'en_progreso' });
    expect(progress.status).toBe(200);
    expect(progress.body.firstResponseAt).not.toBeNull();

    // Pausa de 5 h: el vencimiento debe correrse exactamente 5 h.
    await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(tec1)).send({ status: 'en_espera', note: '¿Puedes enviar una captura?' });
    const paused = await request(ctx.app).get(`/api/tickets/${t.id}`).set(auth(tec1));
    expect(paused.body.slaState).toBe('pausado');
    ctx.clock.advanceHours(5);
    const resumed = await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(tec1)).send({ status: 'en_progreso' });
    expect(new Date(resumed.body.resolutionDueAt).getTime() - new Date(t.resolutionDueAt).getTime()).toBe(5 * 3_600_000);

    // Encuesta antes de resolver: no permitida.
    const early = await request(ctx.app).post(`/api/tickets/${t.id}/survey`).set(auth(user)).send({ rating: 5 });
    expect(early.status).toBe(422);

    const resolved = await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(tec1)).send({ status: 'resuelto', note: 'Se reinstaló el driver.' });
    expect(resolved.body.slaState).toBe('cumplido');

    const survey = await request(ctx.app).post(`/api/tickets/${t.id}/survey`).set(auth(user)).send({ rating: 4, comment: 'Gracias' });
    expect(survey.status).toBe(201);
    const twice = await request(ctx.app).post(`/api/tickets/${t.id}/survey`).set(auth(user)).send({ rating: 5 });
    expect(twice.status).toBe(422);

    const closed = await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(user)).send({ status: 'cerrado' });
    expect(closed.body.status).toBe('cerrado');

    const detail = await request(ctx.app).get(`/api/tickets/${t.id}`).set(auth(admin));
    const actions = detail.body.events.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['creado', 'asignado', 'estado_cambiado', 'encuesta_respondida']));
    expect(detail.body.comments.map((c: { body: string }) => c.body)).toContain('Se reinstaló el driver.');
    expect(detail.body.availableTransitions).toEqual([]);
  });

  it('rechaza transiciones inválidas con 422 e informa las permitidas', async () => {
    const t = await createTicket(user);
    const res = await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(admin)).send({ status: 'resuelto' });
    expect(res.status).toBe(422);
    expect(res.body.allowed).toEqual(['asignado', 'cancelado']);
  });

  it('reabrir un ticket resuelto incrementa el contador de reaperturas', async () => {
    const t = await createTicket(user);
    await request(ctx.app).post(`/api/tickets/${t.id}/assign`).set(auth(admin)).send({ mode: 'auto' });
    await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(admin)).send({ status: 'en_progreso' });
    await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(admin)).send({ status: 'resuelto' });
    const reopened = await request(ctx.app).patch(`/api/tickets/${t.id}/status`).set(auth(user)).send({ status: 'en_progreso' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.reopenCount).toBe(1);
    expect(reopened.body.resolvedAt).toBeNull();
  });

  it('alertas de SLA y job de incumplimiento con auditoría', async () => {
    const t = await createTicket(user, { priority: 'critica' }); // 4 h para resolver
    ctx.clock.advanceHours(3.5);
    const alerts = await request(ctx.app).get('/api/tickets/sla-alerts').set(auth(tec1));
    expect(alerts.status).toBe(200);
    expect(alerts.body.find((a: { id: string }) => a.id === t.id).slaState).toBe('en_riesgo');

    ctx.clock.advanceHours(1);
    const marked = await ctx.container.services.tickets.markBreaches();
    expect(marked).toBeGreaterThanOrEqual(1);
    expect(await ctx.container.services.tickets.markBreaches()).toBe(0); // idempotente

    const detail = await request(ctx.app).get(`/api/tickets/${t.id}`).set(auth(admin));
    expect(detail.body.slaBreached).toBe(true);
    expect(detail.body.slaState).toBe('incumplido');
    expect(detail.body.events.some((e: { action: string }) => e.action === 'sla_incumplido')).toBe(true);
  });

  it('cambiar la prioridad recalcula el vencimiento', async () => {
    const t = await createTicket(user, { priority: 'baja' });
    const res = await request(ctx.app).patch(`/api/tickets/${t.id}/priority`).set(auth(admin)).send({ priority: 'critica' });
    expect(res.status).toBe(200);
    expect(new Date(res.body.resolutionDueAt).getTime() - new Date(t.createdAt).getTime()).toBe(4 * 3_600_000);
  });
});

describe('Comentarios y adjuntos', () => {
  it('las notas internas no son visibles para el usuario y él no puede crearlas', async () => {
    const t = await createTicket(user);
    await request(ctx.app).post(`/api/tickets/${t.id}/comments`).set(auth(tec1)).send({ body: 'Posible falla de hardware', internal: true });
    await request(ctx.app).post(`/api/tickets/${t.id}/comments`).set(auth(tec1)).send({ body: 'Estamos revisando tu caso' });

    const forbidden = await request(ctx.app).post(`/api/tickets/${t.id}/comments`).set(auth(user)).send({ body: 'hola', internal: true });
    expect(forbidden.status).toBe(403);

    const asUser = await request(ctx.app).get(`/api/tickets/${t.id}`).set(auth(user));
    expect(asUser.body.comments.map((c: { body: string }) => c.body)).toEqual(['Estamos revisando tu caso']);
    expect(asUser.body.events.some((e: { details: string }) => e.details === 'interno')).toBe(false);

    const asTech = await request(ctx.app).get(`/api/tickets/${t.id}`).set(auth(tec1));
    expect(asTech.body.comments).toHaveLength(2);
    // La primera respuesta pública cuenta para el SLA de respuesta.
    expect(asTech.body.firstResponseAt).not.toBeNull();
  });

  it('sube y descarga un adjunto; rechaza tipos no permitidos', async () => {
    const t = await createTicket(user);
    const up = await request(ctx.app)
      .post(`/api/tickets/${t.id}/attachments`)
      .set(auth(user))
      .attach('file', Buffer.from('log de error de prueba'), { filename: 'error.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body.storedName).not.toContain('error');

    const down = await request(ctx.app).get(`/api/tickets/${t.id}/attachments/${up.body.id}`).set(auth(user));
    expect(down.status).toBe(200);
    expect(down.headers['content-disposition']).toContain('error.txt');
    expect(down.text).toBe('log de error de prueba');

    const bad = await request(ctx.app)
      .post(`/api/tickets/${t.id}/attachments`)
      .set(auth(user))
      .attach('file', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);

    const other = await request(ctx.app).get(`/api/tickets/${t.id}/attachments/${up.body.id}`).set(auth(user2));
    expect(other.status).toBe(404);
  });
});
