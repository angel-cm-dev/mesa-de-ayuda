import type { Knex } from 'knex';
import type { Page, PageRequest } from '../../application/ports/repositories.js';

/** Conexión o transacción: los repositorios funcionan igual con ambas. */
export type Db = Knex | Knex.Transaction;

/** PostgreSQL devuelve Date; SQLite devuelve el texto ISO guardado. Se normaliza aquí. */
export const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));
export const toDateOrNull = (v: unknown): Date | null => (v === null || v === undefined ? null : toDate(v));
export const toBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 't' || v === 'true';

/** Las fechas se guardan como ISO-8601 UTC: ordenables como texto en SQLite y válidas en PostgreSQL. */
export const toDbDate = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Convierte claves camelCase a snake_case y fechas a ISO para escribir en la base. */
export function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const column = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    row[column] = value instanceof Date ? value.toISOString() : value;
  }
  return row;
}

/** Búsqueda insensible a mayúsculas portable (ILIKE no existe en SQLite). */
export function likeLower(column: string, term: string): [string, string[]] {
  return [`lower(${column}) like ?`, [`%${term.toLowerCase()}%`]];
}

export async function paginate<T>(
  query: Knex.QueryBuilder,
  page: PageRequest,
  /** Columna de orden ya validada contra una lista blanca; null si el llamador ordenó con SQL propio. */
  sortColumn: string | null,
  map: (row: Record<string, unknown>) => T,
): Promise<Page<T>> {
  const countRow = (await query.clone().clearSelect().clearOrder().count({ total: '*' }).first()) as { total: number | string } | undefined;
  const total = Number(countRow?.total ?? 0);
  if (sortColumn) query.orderBy(sortColumn, page.order);
  const rows = (await query
    .limit(page.pageSize)
    .offset((page.page - 1) * page.pageSize)) as Record<string, unknown>[];
  return {
    data: rows.map(map),
    meta: { page: page.page, pageSize: page.pageSize, total, totalPages: Math.max(1, Math.ceil(total / page.pageSize)) },
  };
}
