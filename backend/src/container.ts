import type { Knex } from 'knex';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import { systemClock, type Clock, type TokenService } from './application/ports/services.js';
import { AuthService } from './application/services/auth.service.js';
import { CatalogService } from './application/services/catalog.service.js';
import { KnowledgeBaseService } from './application/services/knowledge-base.service.js';
import { MetricsService } from './application/services/metrics.service.js';
import { TicketService } from './application/services/ticket.service.js';
import { UserService } from './application/services/user.service.js';
import { createKnex } from './infrastructure/db/knex.js';
import { createLogger } from './infrastructure/logger.js';
import { KnexUnitOfWork } from './infrastructure/repositories/unit-of-work.js';
import { BcryptPasswordHasher, JwtTokenService } from './infrastructure/security/security.js';
import { LocalFileStorage } from './infrastructure/storage/local-file-storage.js';

/**
 * Raíz de composición (Composition Root): el ÚNICO lugar donde se instancian
 * las implementaciones concretas y se "cablean" con los servicios.
 * Inyección de dependencias manual por constructor: explícita, sin magia ni
 * decoradores, y fácil de sustituir en pruebas (p. ej. un reloj falso).
 */
export interface Container {
  config: AppConfig;
  logger: Logger;
  db: Knex;
  clock: Clock;
  tokens: TokenService;
  hasher: BcryptPasswordHasher;
  services: {
    auth: AuthService;
    users: UserService;
    catalog: CatalogService;
    tickets: TicketService;
    kb: KnowledgeBaseService;
    metrics: MetricsService;
  };
}

export function buildContainer(config: AppConfig, overrides: { clock?: Clock; db?: Knex } = {}): Container {
  const logger = createLogger(config.LOG_LEVEL);
  const db = overrides.db ?? createKnex(config);
  const clock = overrides.clock ?? systemClock;
  const uow = new KnexUnitOfWork(db);
  const hasher = new BcryptPasswordHasher(config.BCRYPT_ROUNDS);
  const tokens = new JwtTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN);
  const storage = new LocalFileStorage(config.UPLOAD_DIR);

  return {
    config,
    logger,
    db,
    clock,
    tokens,
    hasher,
    services: {
      auth: new AuthService(uow, hasher, tokens, clock),
      users: new UserService(uow, hasher, clock),
      catalog: new CatalogService(uow),
      tickets: new TicketService(uow, storage, clock, logger, { autoAssignOnCreate: config.AUTO_ASSIGN_ON_CREATE }),
      kb: new KnowledgeBaseService(uow, clock),
      metrics: new MetricsService(uow, clock),
    },
  };
}
