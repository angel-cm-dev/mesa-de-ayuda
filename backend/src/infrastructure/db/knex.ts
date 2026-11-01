import knexFactory, { type Knex } from 'knex';
import type { AppConfig } from '../../config.js';
import { migrationSource } from './migrations/index.js';

/**
 * Crea la conexión. PostgreSQL en producción; SQLite (better-sqlite3) en pruebas
 * y como opción rápida para desarrollo sin Docker. El SQL de los repositorios se
 * escribe con el query builder de Knex para que sea portable entre ambos.
 */
export function createKnex(config: Pick<AppConfig, 'DB_CLIENT' | 'DATABASE_URL' | 'SQLITE_FILENAME'>): Knex {
  if (config.DB_CLIENT === 'sqlite') {
    return knexFactory({
      client: 'better-sqlite3',
      connection: { filename: config.SQLITE_FILENAME },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
        // SQLite no aplica claves foráneas a menos que se active por conexión.
        afterCreate: (conn: { pragma: (s: string) => void }, done: (err: Error | null, conn: unknown) => void) => {
          conn.pragma('foreign_keys = ON');
          done(null, conn);
        },
      },
    });
  }
  return knexFactory({
    client: 'pg',
    connection: config.DATABASE_URL,
    pool: { min: 0, max: 10 },
  });
}

export async function migrateLatest(db: Knex): Promise<void> {
  await db.migrate.latest({ migrationSource });
}

export function isPostgres(db: Knex | Knex.Transaction): boolean {
  return db.client.config.client === 'pg';
}
