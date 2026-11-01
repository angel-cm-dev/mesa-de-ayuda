import { BusinessRuleError, ForbiddenError } from './errors.js';
import type { Role, Ticket, TicketStatus } from './entities.js';

/**
 * Máquina de estados del ticket.
 *
 *   nuevo ──► asignado ──► en_progreso ◄──► en_espera
 *     │          │              │               │
 *     └──► cancelado ◄──────────┘               ▼
 *                               └──────────► resuelto ──► cerrado
 *                                               │
 *                                               └──► en_progreso (reapertura)
 *
 * Se declara como tabla (y no con if/else dispersos) para que sea la única fuente
 * de verdad: el servicio, las pruebas y la documentación se basan en ella.
 */
export const TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  nuevo: ['asignado', 'cancelado'],
  asignado: ['en_progreso', 'en_espera', 'cancelado'],
  en_progreso: ['en_espera', 'resuelto', 'cancelado'],
  en_espera: ['en_progreso', 'resuelto'],
  resuelto: ['cerrado', 'en_progreso'],
  cerrado: [],
  cancelado: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

interface Actor {
  id: string;
  role: Role;
}

/**
 * Transiciones que puede pedir quien reportó el ticket (rol "usuario").
 * Un usuario final solo puede: cancelar algo que nadie empezó a trabajar,
 * confirmar la solución (cerrar) o rechazarla (reabrir).
 */
const REQUESTER_TRANSITIONS: ReadonlyArray<[TicketStatus, TicketStatus]> = [
  ['nuevo', 'cancelado'],
  ['asignado', 'cancelado'],
  ['resuelto', 'cerrado'],
  ['resuelto', 'en_progreso'],
];

/**
 * Valida que `actor` pueda llevar `ticket` al estado `to`.
 * Lanza un error de negocio (422) si la transición no existe en la máquina
 * y un 403 si existe pero el rol no la tiene permitida.
 */
export function assertTransition(ticket: Pick<Ticket, 'status' | 'requesterId' | 'assigneeId'>, to: TicketStatus, actor: Actor): void {
  if (ticket.status === to) {
    throw new BusinessRuleError(`El ticket ya se encuentra en estado '${to}'`);
  }
  if (!canTransition(ticket.status, to)) {
    throw new BusinessRuleError(`Transición no permitida: '${ticket.status}' → '${to}'`, {
      allowed: TRANSITIONS[ticket.status],
    });
  }
  // "asignado" solo se alcanza mediante el caso de uso de asignación, que exige un técnico.
  if (to === 'asignado') {
    throw new BusinessRuleError('Para asignar un ticket usa la acción de asignación');
  }
  if (actor.role === 'admin') return;

  if (actor.role === 'usuario') {
    const allowed = ticket.requesterId === actor.id && REQUESTER_TRANSITIONS.some(([f, t]) => f === ticket.status && t === to);
    if (!allowed) throw new ForbiddenError('Como usuario solo puedes cancelar, cerrar o reabrir tus propios tickets');
    return;
  }

  // Técnico: trabaja sobre los tickets que tiene asignados.
  if (ticket.assigneeId !== actor.id) {
    throw new ForbiddenError('Solo el técnico asignado puede cambiar el estado de este ticket');
  }
}

/** Lista de estados destino válidos para un actor (la usa el frontend para pintar botones). */
export function availableTransitions(ticket: Pick<Ticket, 'status' | 'requesterId' | 'assigneeId'>, actor: Actor): TicketStatus[] {
  return TRANSITIONS[ticket.status].filter((to) => {
    try {
      assertTransition(ticket, to, actor);
      return true;
    } catch {
      return false;
    }
  });
}
