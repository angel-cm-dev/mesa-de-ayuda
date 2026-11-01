import { describe, expect, it } from 'vitest';
import { BusinessRuleError, ForbiddenError } from '../../src/domain/errors.js';
import { assertTransition, availableTransitions, canTransition, TRANSITIONS } from '../../src/domain/ticket-state-machine.js';
import type { TicketStatus } from '../../src/domain/entities.js';

const ticket = (status: TicketStatus, assigneeId: string | null = 'tec-1') => ({ status, requesterId: 'user-1', assigneeId });
const admin = { id: 'admin-1', role: 'admin' as const };
const tec = { id: 'tec-1', role: 'tecnico' as const };
const otherTec = { id: 'tec-2', role: 'tecnico' as const };
const user = { id: 'user-1', role: 'usuario' as const };

describe('máquina de estados del ticket', () => {
  it('los estados finales no tienen salida', () => {
    expect(TRANSITIONS.cerrado).toEqual([]);
    expect(TRANSITIONS.cancelado).toEqual([]);
  });

  it('permite el flujo feliz completo', () => {
    expect(canTransition('nuevo', 'asignado')).toBe(true);
    expect(canTransition('asignado', 'en_progreso')).toBe(true);
    expect(canTransition('en_progreso', 'resuelto')).toBe(true);
    expect(canTransition('resuelto', 'cerrado')).toBe(true);
  });

  it('rechaza saltos inválidos con error de negocio', () => {
    expect(() => assertTransition(ticket('nuevo'), 'resuelto', admin)).toThrow(BusinessRuleError);
    expect(() => assertTransition(ticket('cerrado'), 'en_progreso', admin)).toThrow(BusinessRuleError);
  });

  it('rechaza transicionar al mismo estado', () => {
    expect(() => assertTransition(ticket('en_progreso'), 'en_progreso', admin)).toThrow(/ya se encuentra/);
  });

  it('no permite pasar a "asignado" manualmente (se usa la acción de asignación)', () => {
    expect(() => assertTransition(ticket('nuevo', null), 'asignado', admin)).toThrow(/asignación/);
  });

  it('solo el técnico asignado puede mover el ticket', () => {
    expect(() => assertTransition(ticket('asignado'), 'en_progreso', tec)).not.toThrow();
    expect(() => assertTransition(ticket('asignado'), 'en_progreso', otherTec)).toThrow(ForbiddenError);
  });

  it('el usuario solo puede cancelar, cerrar o reabrir lo suyo', () => {
    expect(() => assertTransition(ticket('nuevo'), 'cancelado', user)).not.toThrow();
    expect(() => assertTransition(ticket('resuelto'), 'cerrado', user)).not.toThrow();
    expect(() => assertTransition(ticket('resuelto'), 'en_progreso', user)).not.toThrow();
    expect(() => assertTransition(ticket('en_progreso'), 'resuelto', user)).toThrow(ForbiddenError);
    expect(() => assertTransition({ ...ticket('nuevo'), requesterId: 'otro' }, 'cancelado', user)).toThrow(ForbiddenError);
  });

  it('calcula las transiciones disponibles según el actor', () => {
    expect(availableTransitions(ticket('en_progreso'), tec).sort()).toEqual(['cancelado', 'en_espera', 'resuelto']);
    expect(availableTransitions(ticket('en_progreso'), user)).toEqual([]);
    expect(availableTransitions(ticket('resuelto'), user).sort()).toEqual(['cerrado', 'en_progreso']);
  });
});
