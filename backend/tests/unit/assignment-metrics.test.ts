import { describe, expect, it } from 'vitest';
import { pickRoundRobin } from '../../src/domain/assignment.js';
import { computeMetrics } from '../../src/domain/metrics.js';
import type { Ticket } from '../../src/domain/entities.js';
import { slugify } from '../../src/application/services/knowledge-base.service.js';

const tech = (id: string, name: string, last: string | null, active = true) => ({
  id,
  name,
  active,
  role: 'tecnico' as const,
  lastAssignedAt: last ? new Date(last) : null,
});

describe('round-robin', () => {
  it('elige primero a quien nunca recibió tickets', () => {
    expect(pickRoundRobin([tech('a', 'Ana', '2026-01-01'), tech('b', 'Beto', null)])).toBe('b');
  });

  it('elige al que lleva más tiempo sin asignación e ignora inactivos', () => {
    const techs = [tech('a', 'Ana', '2026-01-03'), tech('b', 'Beto', '2026-01-02'), tech('c', 'Caro', '2026-01-01', false)];
    expect(pickRoundRobin(techs)).toBe('b');
  });

  it('desempata por nombre y devuelve null sin técnicos', () => {
    expect(pickRoundRobin([tech('z', 'Zoe', null), tech('a', 'Ana', null)])).toBe('a');
    expect(pickRoundRobin([])).toBeNull();
  });
});

describe('métricas', () => {
  const H = 3_600_000;
  const t0 = new Date('2026-03-01T00:00:00Z');
  let seq = 0;
  const mk = (o: Partial<Ticket>): Ticket => ({
    id: `t${++seq}`,
    number: seq,
    title: 't',
    description: 'd',
    status: 'nuevo',
    priority: 'media',
    categoryId: null,
    requesterId: 'u',
    assigneeId: null,
    responseDueAt: new Date(t0.getTime() + 8 * H),
    resolutionDueAt: new Date(t0.getTime() + 24 * H),
    firstResponseAt: null,
    slaPausedAt: null,
    slaBreached: false,
    resolvedAt: null,
    closedAt: null,
    reopenCount: 0,
    createdAt: t0,
    updatedAt: t0,
    ...o,
  });

  it('calcula MTTR, cumplimiento de SLA y CSAT', () => {
    const tickets = [
      mk({ status: 'cerrado', resolvedAt: new Date(t0.getTime() + 10 * H), assigneeId: 'x', firstResponseAt: new Date(t0.getTime() + H) }),
      mk({ status: 'resuelto', resolvedAt: new Date(t0.getTime() + 30 * H), assigneeId: 'x', firstResponseAt: new Date(t0.getTime() + 9 * H) }),
      mk({ status: 'en_progreso', assigneeId: 'y' }),
      mk({ status: 'cancelado' }),
    ];
    const m = computeMetrics(tickets, [5, 3], new Date(t0.getTime() + 2 * H));
    expect(m.totalTickets).toBe(4);
    expect(m.openTickets).toBe(1);
    expect(m.mttrHours).toBe(20);
    expect(m.slaCompliancePct).toBe(50);
    expect(m.firstResponseCompliancePct).toBe(50);
    expect(m.csatAvg).toBe(4);
    expect(m.byAssignee.find((a) => a.assigneeId === 'x')).toEqual({ assigneeId: 'x', open: 0, resolved: 2 });
  });

  it('devuelve null cuando no hay datos', () => {
    const m = computeMetrics([], []);
    expect(m.mttrHours).toBeNull();
    expect(m.slaCompliancePct).toBeNull();
    expect(m.csatAvg).toBeNull();
  });
});

describe('slugify', () => {
  it('normaliza tildes, espacios y símbolos', () => {
    expect(slugify('¿Cómo configurar la VPN?')).toBe('como-configurar-la-vpn');
  });
});
