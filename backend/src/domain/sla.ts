import type { SlaPolicy, Ticket, TicketStatus } from './entities.js';
import { FINAL_STATUSES } from './entities.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Porcentaje del tiempo de resolución consumido a partir del cual el ticket se
 * considera "en riesgo". 75 % es un umbral habitual en mesas de ayuda ITIL: deja
 * margen para escalar antes de incumplir.
 */
export const AT_RISK_THRESHOLD = 0.75;

export type SlaState = 'a_tiempo' | 'en_riesgo' | 'incumplido' | 'cumplido' | 'pausado';

export interface SlaDeadlines {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

/**
 * Calcula los vencimientos a partir de la fecha de creación.
 * Simplificación didáctica: se usan horas calendario (24x7). Una versión
 * empresarial descontaría fines de semana y feriados (ver roadmap).
 */
export function computeDeadlines(createdAt: Date, policy: SlaPolicy): SlaDeadlines {
  return {
    responseDueAt: new Date(createdAt.getTime() + policy.responseHours * HOUR_MS),
    resolutionDueAt: new Date(createdAt.getTime() + policy.resolutionHours * HOUR_MS),
  };
}

/**
 * Cuando el ticket sale de "en_espera" el reloj del SLA se reanuda:
 * el vencimiento se corre tanto como duró la pausa, porque la demora
 * dependía del usuario (p. ej. esperando que envíe una captura), no del técnico.
 */
export function resumeAfterPause(resolutionDueAt: Date, pausedAt: Date, now: Date): Date {
  const pausedMs = Math.max(0, now.getTime() - pausedAt.getTime());
  return new Date(resolutionDueAt.getTime() + pausedMs);
}

type SlaInput = Pick<Ticket, 'status' | 'createdAt' | 'resolutionDueAt' | 'resolvedAt' | 'slaPausedAt'>;

/** Estado del SLA de resolución en el instante `now`. */
export function evaluateSla(ticket: SlaInput, now: Date = new Date()): SlaState {
  const due = ticket.resolutionDueAt.getTime();

  if (ticket.status === 'cancelado') return 'cumplido';
  if (ticket.resolvedAt && FINAL_STATUSES.includes(ticket.status)) {
    return ticket.resolvedAt.getTime() <= due ? 'cumplido' : 'incumplido';
  }
  if (ticket.slaPausedAt) {
    // Mientras está pausado se evalúa "congelado" en el momento de la pausa.
    return ticket.slaPausedAt.getTime() > due ? 'incumplido' : 'pausado';
  }
  if (now.getTime() > due) return 'incumplido';

  const total = due - ticket.createdAt.getTime();
  const elapsed = now.getTime() - ticket.createdAt.getTime();
  return total > 0 && elapsed / total >= AT_RISK_THRESHOLD ? 'en_riesgo' : 'a_tiempo';
}

/** Minutos restantes hasta el vencimiento (negativo si ya venció). */
export function minutesToDue(ticket: Pick<Ticket, 'resolutionDueAt'>, now: Date = new Date()): number {
  return Math.round((ticket.resolutionDueAt.getTime() - now.getTime()) / 60000);
}

/** Indica si un ticket abierto debe marcarse como incumplido por el job de monitoreo. */
export function isBreached(ticket: SlaInput & { slaBreached: boolean }, now: Date = new Date()): boolean {
  return !ticket.slaBreached && !isFinal(ticket.status) && !ticket.slaPausedAt && now > ticket.resolutionDueAt;
}

export function isFinal(status: TicketStatus): boolean {
  return FINAL_STATUSES.includes(status);
}
