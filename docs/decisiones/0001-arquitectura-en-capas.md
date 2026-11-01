# ADR 0001 — Arquitectura en capas con puertos y adaptadores

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

Las reglas de una mesa de ayuda (estados válidos, SLA, pausas, permisos por rol) cambian con frecuencia y son el núcleo del valor del sistema. Si se mezclan con Express y SQL, probarlas exige levantar servidor y base de datos, y cualquier cambio de infraestructura las pone en riesgo.

## Decisión

Organizar el backend en cuatro capas — **dominio, aplicación, infraestructura y API** — con dependencias hacia adentro:

- El dominio contiene funciones puras (`assertTransition`, `evaluateSla`, `pickRoundRobin`, `computeMetrics`).
- La aplicación define **puertos** (interfaces) y los servicios los consumen.
- La infraestructura implementa los puertos (Knex, bcrypt, JWT, disco).
- `container.ts` compone todo con inyección de dependencias manual por constructor.

## Consecuencias

- ✅ Las reglas de negocio se prueban en milisegundos sin base de datos (21 pruebas unitarias).
- ✅ Se puede cambiar el motor (PostgreSQL ↔ SQLite) o el almacenamiento (disco → S3) sin tocar casos de uso.
- ✅ Un reloj inyectable permite probar vencimientos de SLA de forma determinista.
- ⚠️ Más archivos e interfaces que un CRUD simple; se mitiga agrupando repositorios relacionados y evitando abstracciones sin uso.
- ⚠️ Sin contenedor IoC: el cableado es explícito y hay que mantenerlo a mano en `container.ts` (aceptable para este tamaño).
