import type { Knex } from 'knex';
import type { Repositories, UnitOfWork } from '../../application/ports/repositories.js';
import { KnexArticleRepository } from './article.repository.js';
import type { Db } from './helpers.js';
import {
  KnexAttachmentRepository,
  KnexAuditRepository,
  KnexCommentRepository,
  KnexSurveyRepository,
  KnexTicketRepository,
} from './ticket.repositories.js';
import { KnexCategoryRepository, KnexSlaPolicyRepository, KnexUserRepository } from './user-catalog.repositories.js';

export function createRepositories(db: Db): Repositories {
  return {
    users: new KnexUserRepository(db),
    categories: new KnexCategoryRepository(db),
    slaPolicies: new KnexSlaPolicyRepository(db),
    tickets: new KnexTicketRepository(db),
    comments: new KnexCommentRepository(db),
    attachments: new KnexAttachmentRepository(db),
    audit: new KnexAuditRepository(db),
    surveys: new KnexSurveyRepository(db),
    articles: new KnexArticleRepository(db),
  };
}

/** Implementación de la unidad de trabajo sobre transacciones de Knex. */
export class KnexUnitOfWork implements UnitOfWork {
  readonly repos: Repositories;

  constructor(private readonly db: Knex) {
    this.repos = createRepositories(db);
  }

  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    // Si `work` lanza, Knex hace ROLLBACK automáticamente: o se guarda todo o nada.
    return this.db.transaction((trx) => work(createRepositories(trx)));
  }
}
