import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { buildContainer, type Container } from '../../src/container.js';
import { migrateLatest } from '../../src/infrastructure/db/knex.js';
import { DEMO_PASSWORD, seedDemoData } from '../../src/infrastructure/db/seed.js';

/** Reloj manipulable para simular el paso de las horas en pruebas de SLA. */
export class FakeClock {
  constructor(public current = new Date('2026-06-01T12:00:00.000Z')) {}
  now() {
    return new Date(this.current);
  }
  advanceHours(h: number) {
    this.current = new Date(this.current.getTime() + h * 3_600_000);
  }
}

export interface TestContext {
  app: Express;
  container: Container;
  clock: FakeClock;
  uploadDir: string;
  login(email: string, password?: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Levanta la API completa sobre SQLite en memoria (sin Docker), con migraciones
 * y datos demo. Cada archivo de pruebas obtiene una base aislada.
 */
export async function createTestContext(): Promise<TestContext> {
  const uploadDir = path.join(os.tmpdir(), `helpdesk-test-${randomUUID()}`);
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_CLIENT: 'sqlite',
    SQLITE_FILENAME: ':memory:',
    BCRYPT_ROUNDS: '4',
    UPLOAD_DIR: uploadDir,
    SLA_MONITOR_INTERVAL_MS: '0',
  });
  const clock = new FakeClock();
  const container = buildContainer(config, { clock });
  await migrateLatest(container.db);
  await seedDemoData(container.db, container.hasher, clock.now());
  const app = createApp(container);

  return {
    app,
    container,
    clock,
    uploadDir,
    async login(email, password = DEMO_PASSWORD) {
      const res = await request(app).post('/api/auth/login').send({ email, password });
      if (res.status !== 200) throw new Error(`Login falló para ${email}: ${res.status}`);
      return res.body.token as string;
    },
    async close() {
      await container.db.destroy();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}
