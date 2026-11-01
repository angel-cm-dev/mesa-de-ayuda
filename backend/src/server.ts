import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { buildContainer } from './container.js';
import { migrateLatest } from './infrastructure/db/knex.js';
import { seedDemoData } from './infrastructure/db/seed.js';
import { startSlaMonitor } from './infrastructure/jobs/sla-monitor.js';

const config = loadConfig();
const container = buildContainer(config);
const { logger, db } = container;

// Migrar al arrancar simplifica el despliegue en un solo contenedor. En entornos
// con varias réplicas conviene ejecutar `npm run db:migrate` como paso previo.
await migrateLatest(db);
if (config.SEED_DEMO && (await seedDemoData(db, container.hasher))) {
  logger.info('Datos demo cargados (admin@demo.pe / Demo123!)');
}

const stopMonitor = startSlaMonitor(container.services.tickets, logger, config.SLA_MONITOR_INTERVAL_MS);
const server = createApp(container).listen(config.PORT, () => {
  logger.info({ port: config.PORT, docs: `http://localhost:${config.PORT}/api/docs` }, 'API de Mesa de Ayuda iniciada');
});

// Apagado ordenado: deja terminar las peticiones en curso y cierra el pool de conexiones.
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Cerrando servidor');
  stopMonitor();
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
