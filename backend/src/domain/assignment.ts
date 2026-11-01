import type { User } from './entities.js';

/**
 * Round-robin persistente: se elige al técnico activo que recibió un ticket hace
 * más tiempo (o nunca). Guardar `lastAssignedAt` en la base, en lugar de un
 * contador en memoria, hace que el reparto sea justo aunque el servidor se reinicie
 * o haya varias instancias de la API.
 *
 * Desempate por nombre para que el resultado sea determinista (y testeable).
 */
export function pickRoundRobin(technicians: ReadonlyArray<Pick<User, 'id' | 'name' | 'active' | 'role' | 'lastAssignedAt'>>): string | null {
  const candidates = technicians.filter((t) => t.active && t.role === 'tecnico');
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const ta = a.lastAssignedAt ? a.lastAssignedAt.getTime() : -Infinity;
    const tb = b.lastAssignedAt ? b.lastAssignedAt.getTime() : -Infinity;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return sorted[0].id;
}
