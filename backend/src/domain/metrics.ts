import type { Priority, Ticket, TicketStatus } from './entities.js';
import { PRIORITIES, TICKET_STATUSES } from './entities.js';
import { evaluateSla } from './sla.js';

export interface MetricsSummary {
  totalTickets: number;
  openTickets: number;
  /** Mean Time To Resolve, en horas, sobre tickets resueltos/cerrados. */
  mttrHours: number | null;
  /** % de tickets resueltos dentro del SLA de resolución. */
  slaCompliancePct: number | null;
  /** % de tickets con primera respuesta dentro del plazo. */
  firstResponseCompliancePct: number | null;
  breachedOpen: number;
  atRiskOpen: number;
  /** Promedio de la encuesta de satisfacción (1 a 5). */
  csatAvg: number | null;
  csatResponses: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<Priority, number>;
  byAssignee: Array<{ assigneeId: string; open: number; resolved: number }>;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Las métricas se calculan en memoria a partir de filas ya filtradas por la base.
 * Así la fórmula es idéntica en PostgreSQL y en SQLite (pruebas) y queda en
 * un solo lugar fácil de leer. Para volúmenes grandes se movería a SQL/vistas.
 */
export function computeMetrics(tickets: Ticket[], ratings: number[], now: Date = new Date()): MetricsSummary {
  const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  const assignee = new Map<string, { open: number; resolved: number }>();

  let resolvedCount = 0;
  let resolvedMs = 0;
  let resolvedInSla = 0;
  let responded = 0;
  let respondedInTime = 0;
  let breachedOpen = 0;
  let atRiskOpen = 0;

  for (const t of tickets) {
    byStatus[t.status]++;
    byPriority[t.priority]++;
    const isOpen = !['resuelto', 'cerrado', 'cancelado'].includes(t.status);

    if (t.assigneeId) {
      const a = assignee.get(t.assigneeId) ?? { open: 0, resolved: 0 };
      if (isOpen) a.open++;
      else if (t.resolvedAt) a.resolved++;
      assignee.set(t.assigneeId, a);
    }

    if (t.resolvedAt && t.status !== 'cancelado') {
      resolvedCount++;
      resolvedMs += t.resolvedAt.getTime() - t.createdAt.getTime();
      if (t.resolvedAt <= t.resolutionDueAt) resolvedInSla++;
    }
    if (t.firstResponseAt) {
      responded++;
      if (t.firstResponseAt <= t.responseDueAt) respondedInTime++;
    }
    if (isOpen) {
      const state = evaluateSla(t, now);
      if (state === 'incumplido') breachedOpen++;
      if (state === 'en_riesgo') atRiskOpen++;
    }
  }

  const csatResponses = ratings.length;
  return {
    totalTickets: tickets.length,
    openTickets: tickets.length - byStatus.resuelto - byStatus.cerrado - byStatus.cancelado,
    mttrHours: resolvedCount ? round(resolvedMs / resolvedCount / 3_600_000) : null,
    slaCompliancePct: resolvedCount ? round((resolvedInSla / resolvedCount) * 100) : null,
    firstResponseCompliancePct: responded ? round((respondedInTime / responded) * 100) : null,
    breachedOpen,
    atRiskOpen,
    csatAvg: csatResponses ? round(ratings.reduce((s, r) => s + r, 0) / csatResponses, 2) : null,
    csatResponses,
    byStatus,
    byPriority,
    byAssignee: [...assignee.entries()].map(([assigneeId, v]) => ({ assigneeId, ...v })),
  };
}
