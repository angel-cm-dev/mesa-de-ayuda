import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './api/openapi.js';
import { errorHandler, notFoundHandler } from './api/middlewares/error-handler.js';
import { authRoutes, userRoutes } from './api/routes/auth-users.routes.js';
import { catalogRoutes, knowledgeBaseRoutes, metricsRoutes } from './api/routes/catalog-kb-metrics.routes.js';
import { ticketRoutes } from './api/routes/tickets.routes.js';
import type { Container } from './container.js';

/**
 * Construye la aplicación Express sin abrir el puerto: así las pruebas de
 * integración (supertest) pueden usarla directamente.
 */
export function createApp(c: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de nginx: necesario para IP real en rate limiting

  app.use(
    pinoHttp({
      logger: c.logger,
      // Correlación: se respeta el X-Request-Id que envíe un proxy o se genera uno.
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: c.config.NODE_ENV !== 'test',
    }),
  );

  // Swagger UI usa scripts propios: se monta antes de la CSP estricta de helmet.
  app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Mesa de Ayuda API' }));

  app.use(helmet());
  app.use(cors({ origin: c.config.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: false }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    try {
      await c.db.raw('select 1');
      res.json({ status: 'ok', database: 'up', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api/auth', authRoutes(c));
  app.use('/api/users', userRoutes(c));
  app.use('/api', catalogRoutes(c));
  app.use('/api/tickets', ticketRoutes(c));
  app.use('/api/kb', knowledgeBaseRoutes(c));
  app.use('/api/metrics', metricsRoutes(c));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
