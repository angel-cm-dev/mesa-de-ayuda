import { Link } from 'react-router-dom';
import { AlertOctagon, Clock, Gauge, Inbox, Smile, Timer } from 'lucide-react';
import { Card, EmptyState, ErrorState, KpiCard, PageHeader, Spinner } from '../components/ui';
import { PriorityBadge, SlaBadge } from '../components/ui/Badges';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { dueText, formatPct, PRIORITY_LABEL, STATUS_LABEL, ticketCode } from '../lib/format';
import type { Metrics, Priority, Ticket, TicketStatus } from '../lib/types';

/** Barra horizontal simple (sin librería de gráficos) para distribución por categoría. */
function BarList<K extends string>({ data, labels, color }: { data: Record<K, number>; labels: Record<K, string>; color: string }) {
  const entries = Object.entries(data) as [K, number][];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <ul className="space-y-2.5">
      {entries.map(([key, value]) => (
        <li key={key} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
          <span className="truncate text-slate-600 dark:text-slate-300">{labels[key]}</span>
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const metrics = useAsync(() => api.get<Metrics>('/metrics/summary'), []);
  const alerts = useAsync(() => api.get<Ticket[]>('/tickets/sla-alerts'), []);

  if (metrics.loading) return <Spinner />;
  if (metrics.error || !metrics.data) return <ErrorState error={metrics.error ?? new Error('Sin datos')} onRetry={metrics.reload} />;
  const m = metrics.data;
  const slaTone = m.slaCompliancePct === null ? 'default' : m.slaCompliancePct >= 90 ? 'good' : m.slaCompliancePct >= 75 ? 'warn' : 'bad';

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Indicadores de servicio en tiempo real" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Tickets abiertos" value={m.openTickets} hint={`${m.totalTickets} en total`} icon={<Inbox className="h-5 w-5" />} />
        <KpiCard label="MTTR (tiempo medio de resolución)" value={m.mttrHours === null ? '—' : `${m.mttrHours} h`} icon={<Timer className="h-5 w-5" />} />
        <KpiCard label="Cumplimiento SLA de resolución" value={formatPct(m.slaCompliancePct)} hint={`Primera respuesta: ${formatPct(m.firstResponseCompliancePct)}`} tone={slaTone} icon={<Gauge className="h-5 w-5" />} />
        <KpiCard label="SLA vencido (abiertos)" value={m.breachedOpen} tone={m.breachedOpen ? 'bad' : 'good'} icon={<AlertOctagon className="h-5 w-5" />} />
        <KpiCard label="En riesgo de vencer" value={m.atRiskOpen} tone={m.atRiskOpen ? 'warn' : 'good'} icon={<Clock className="h-5 w-5" />} />
        <KpiCard label="Satisfacción (CSAT)" value={m.csatAvg === null ? '—' : `${m.csatAvg} / 5`} hint={`${m.csatResponses} encuestas`} tone="good" icon={<Smile className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Alertas de SLA</h2>
          {alerts.loading ? (
            <Spinner />
          ) : alerts.error ? (
            <ErrorState error={alerts.error} onRetry={alerts.reload} />
          ) : !alerts.data?.length ? (
            <EmptyState title="Sin alertas" description="Todos los tickets abiertos están dentro de su SLA." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.data.slice(0, 8).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link to={`/tickets/${t.id}`} className="font-medium hover:text-brand-600">
                      {ticketCode(t.number)} · {t.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {t.assigneeName ?? 'Sin asignar'} · {dueText(t.minutesToDue, t.slaState)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <PriorityBadge priority={t.priority} />
                    <SlaBadge state={t.slaState} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Por estado</h2>
          <BarList<TicketStatus> data={m.byStatus} labels={STATUS_LABEL} color="bg-brand-500" />
          <h2 className="mb-4 mt-6 font-semibold">Por prioridad</h2>
          <BarList<Priority> data={m.byPriority} labels={PRIORITY_LABEL} color="bg-orange-500" />
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto p-5">
        <h2 className="mb-4 font-semibold">Carga por técnico</h2>
        {m.byAssignee.length === 0 ? (
          <EmptyState title="Aún no hay tickets asignados" />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 font-medium">Técnico</th>
                <th className="py-2 text-right font-medium">Abiertos</th>
                <th className="py-2 text-right font-medium">Resueltos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {m.byAssignee.map((a) => (
                <tr key={a.assigneeId}>
                  <td className="py-2">{m.assigneeNames[a.assigneeId] ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">{a.open}</td>
                  <td className="py-2 text-right tabular-nums">{a.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
