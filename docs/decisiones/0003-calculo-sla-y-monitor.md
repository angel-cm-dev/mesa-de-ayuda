# ADR 0003 — Cálculo del SLA y monitor de incumplimientos

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

Cada prioridad tiene un plazo de primera respuesta y otro de resolución. Necesitamos: mostrar el estado del SLA en tiempo real, no penalizar esperas atribuibles al usuario, y alertar **una sola vez** cuando un ticket vence.

## Decisión

1. **Snapshot al crear:** `response_due_at` y `resolution_due_at` se calculan con la política vigente y se guardan en el ticket. Cambiar la política no altera tickets existentes; cambiar la **prioridad** del ticket sí recalcula (estaba mal clasificado).
2. **Horas calendario** (24×7) como simplificación documentada.
3. **Pausa:** al entrar en `en_espera` se guarda `sla_paused_at`; al salir, `resolution_due_at += ahora − sla_paused_at`.
4. **Estado calculado al leer** (`evaluateSla`): `a_tiempo`, `en_riesgo` (≥ 75 % del plazo consumido), `incumplido`, `cumplido`, `pausado`. Siempre exacto, sin depender de jobs.
5. **Monitor periódico** (`setInterval`, 60 s por defecto): busca tickets abiertos vencidos sin marcar, pone `sla_breached = true`, registra `sla_incumplido` en la auditoría y emite un log `warn` que simula la notificación. Es **idempotente** y evita ejecuciones solapadas.

## Consecuencias

- ✅ Lógica pura y probada (unitarias + integración con reloj simulado).
- ✅ La alerta no se repite y queda trazada en el historial.
- ⚠️ Con varias réplicas de la API el job correría en cada una; la idempotencia evita datos duplicados pero no logs duplicados. Para escalar: lock distribuido (advisory lock / Redis) o cola (BullMQ) — en el roadmap.
- ⚠️ Horario laboral y feriados no están contemplados; se documentan como mejora.
