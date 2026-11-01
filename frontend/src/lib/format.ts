import type { Priority, Role, SlaState, TicketStatus } from './types';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_progreso: 'En progreso',
  en_espera: 'En espera',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export const SLA_LABEL: Record<SlaState, string> = {
  a_tiempo: 'A tiempo',
  en_riesgo: 'En riesgo',
  incumplido: 'Incumplido',
  cumplido: 'Cumplido',
  pausado: 'Pausado',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  usuario: 'Usuario',
};

/** Texto del botón para llevar un ticket a cada estado. */
export const TRANSITION_ACTION: Record<TicketStatus, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignar',
  en_progreso: 'Iniciar / reabrir',
  en_espera: 'Poner en espera',
  resuelto: 'Marcar resuelto',
  cerrado: 'Cerrar',
  cancelado: 'Cancelar',
};

/** Código legible del ticket: 7 → "HD-0007". */
export function ticketCode(n: number): string {
  return `HD-${String(n).padStart(4, '0')}`;
}

const dateFmt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

/** Minutos → "2 h 5 min", "3 d 4 h". Con signo negativo indica "vencido hace". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.abs(Math.round(totalMinutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

/** Texto para la columna SLA según el estado del ticket. */
export function dueText(minutesToDue: number, state: SlaState): string {
  if (state === 'cumplido') return 'Cumplido';
  if (state === 'pausado') return 'Pausado (en espera)';
  return minutesToDue < 0 ? `Vencido hace ${formatDuration(minutesToDue)}` : `Vence en ${formatDuration(minutesToDue)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} %`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
