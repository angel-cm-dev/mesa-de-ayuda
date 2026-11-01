import { describe, expect, it } from 'vitest';
import { computeDeadlines, evaluateSla, isBreached, minutesToDue, resumeAfterPause } from '../../src/domain/sla.js';
import type { TicketStatus } from '../../src/domain/entities.js';

const H = 3_600_000;
const t0 = new Date('2026-03-02T08:00:00.000Z');
const at = (hours: number) => new Date(t0.getTime() + hours * H);

const base = (overrides: Partial<{ status: TicketStatus; resolvedAt: Date | null; slaPausedAt: Date | null; slaBreached: boolean }> = {}) => ({
  status: 'en_progreso' as TicketStatus,
  createdAt: t0,
  resolutionDueAt: at(8),
  resolvedAt: null,
  slaPausedAt: null,
  slaBreached: false,
  ...overrides,
});

describe('SLA', () => {
  it('calcula vencimientos de respuesta y resolución según la política', () => {
    const d = computeDeadlines(t0, { priority: 'alta', responseHours: 4, resolutionHours: 8 });
    expect(d.responseDueAt).toEqual(at(4));
    expect(d.resolutionDueAt).toEqual(at(8));
  });

  it('a tiempo antes del 75 % y en riesgo después', () => {
    expect(evaluateSla(base(), at(5))).toBe('a_tiempo');
    expect(evaluateSla(base(), at(6))).toBe('en_riesgo');
  });

  it('incumplido cuando se supera el vencimiento', () => {
    expect(evaluateSla(base(), at(8.1))).toBe('incumplido');
    expect(minutesToDue(base(), at(9))).toBe(-60);
  });

  it('cumplido o incumplido según la fecha de resolución', () => {
    expect(evaluateSla(base({ status: 'resuelto', resolvedAt: at(7) }), at(100))).toBe('cumplido');
    expect(evaluateSla(base({ status: 'cerrado', resolvedAt: at(9) }), at(100))).toBe('incumplido');
  });

  it('un ticket en espera queda "pausado" aunque pase el tiempo', () => {
    expect(evaluateSla(base({ status: 'en_espera', slaPausedAt: at(2) }), at(50))).toBe('pausado');
  });

  it('al reanudar se corre el vencimiento lo que duró la pausa', () => {
    expect(resumeAfterPause(at(8), at(2), at(5))).toEqual(at(11));
  });

  it('isBreached solo marca tickets abiertos, vencidos y no marcados antes', () => {
    expect(isBreached(base(), at(9))).toBe(true);
    expect(isBreached(base({ slaBreached: true }), at(9))).toBe(false);
    expect(isBreached(base({ status: 'resuelto', resolvedAt: at(7) }), at(9))).toBe(false);
    expect(isBreached(base(), at(7))).toBe(false);
  });
});
