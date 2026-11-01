# ADR 0002 — Knex con PostgreSQL en producción y SQLite en pruebas

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

Producción usa PostgreSQL vía docker-compose, pero las pruebas deben ejecutarse **sin Docker** (en la máquina del desarrollador y en CI) y ser rápidas y aisladas.

Opciones evaluadas:

| Opción | Pros | Contras |
|---|---|---|
| Prisma | Tipado generado, migraciones | Un proveedor por schema: cambiar a SQLite en pruebas requiere schemas duplicados; binarios nativos |
| TypeORM | Decoradores, multi-motor | Acopla entidades de dominio al ORM; comportamiento "mágico" |
| pg-mem | Emula PostgreSQL en memoria | Cobertura parcial de SQL; fallos difíciles de diagnosticar |
| **Knex** | Query builder portable, migraciones, transacciones | Sin tipado automático de filas |

## Decisión

Usar **Knex** con `pg` en producción y `better-sqlite3` (solo `devDependency`) en pruebas:

- Migraciones registradas **en código** (`migrationSource`) para que funcionen igual con `tsx`, con el JS compilado y con Vitest.
- Fechas escritas como ISO-8601 UTC y normalizadas al leer (PostgreSQL devuelve `Date`, SQLite texto).
- Búsquedas con `lower(col) LIKE ?` en lugar de `ILIKE` (inexistente en SQLite).
- Los repositorios mapean filas `snake_case` a entidades de dominio, de modo que el resto del código no ve diferencias.

## Consecuencias

- ✅ `npm test` levanta la API completa con migraciones y datos demo en una base en memoria por archivo de pruebas (~4 s la suite).
- ✅ La imagen Docker no incluye SQLite (`npm ci --omit=dev`).
- ⚠️ Riesgo de divergencia entre motores: se evita SQL específico; lo único propio de PostgreSQL (advisory lock del correlativo) está aislado y condicionado. Se recomienda agregar en CI un job con un servicio PostgreSQL (roadmap).
