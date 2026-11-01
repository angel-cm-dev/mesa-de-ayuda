import type { TicketService } from '../../application/services/ticket.service.js';
import type { AppLogger } from '../../application/ports/services.js';

/**
 * Job periódico que detecta incumplimientos de SLA. Con setInterval basta para
 * una sola instancia; con varias réplicas se usaría una cola (BullMQ) o un lock
 * distribuido para que no se ejecute dos veces (ver ADR 0003).
 */
export function startSlaMonitor(tickets: TicketService, logger: AppLogger, intervalMs: number): () => void {
  if (intervalMs <= 0) return () => undefined;
  let running = false;
  const tick = async () => {
    if (running) return; // evita solapamientos si una ejecución tarda más que el intervalo
    running = true;
    try {
      const count = await tickets.markBreaches();
      if (count > 0) logger.info({ count }, 'Monitor SLA: tickets marcados como incumplidos');
    } catch (err) {
      logger.error({ err }, 'Monitor SLA: error en la ejecución');
    } finally {
      running = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  void tick();
  return () => clearInterval(handle);
}
