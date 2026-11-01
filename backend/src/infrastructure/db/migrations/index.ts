import type { Knex } from 'knex';
import * as m001 from './001_esquema_inicial.js';

/**
 * Fuente de migraciones "en código": se importan explícitamente en lugar de
 * leerlas del disco. Funciona igual con tsx (desarrollo), con el JS compilado
 * (producción) y con Vitest, sin depender de rutas ni extensiones.
 * Para agregar una migración: crear 002_xxx.ts y registrarla aquí.
 */
const migrations: Record<string, Knex.Migration> = {
  '001_esquema_inicial': m001,
};

export const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(migrations).sort(),
  getMigrationName: (name) => name,
  getMigration: async (name) => migrations[name],
};
