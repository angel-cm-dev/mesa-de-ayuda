import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '../components/ui';
import { PriorityBadge, SlaBadge, StatusBadge } from '../components/ui/Badges';
import { useAuth } from '../context/AuthContext';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { api, toQuery } from '../lib/api';
import { dueText, formatDate, PRIORITY_LABEL, STATUS_LABEL, ticketCode } from '../lib/format';
import type { Category, Page, Priority, Ticket, TicketStatus } from '../lib/types';

const OPEN = 'nuevo,asignado,en_progreso,en_espera';

export function TicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const staff = user?.role !== 'usuario';

  const [q, setQ] = useState('');
  const [status, setStatus] = useState(staff ? OPEN : '');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [scope, setScope] = useState<'' | 'mine' | 'unassigned'>('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const search = useDebounce(q);

  const categories = useAsync(() => api.get<Category[]>('/categories'), []);
  const [sortField, order] = sort.split(':');
  const tickets = useAsync(
    () =>
      api.get<Page<Ticket>>(
        `/tickets${toQuery({ q: search, status, priority, categoryId, page, pageSize: 10, sort: sortField, order, mine: scope === 'mine' || undefined, unassigned: scope === 'unassigned' || undefined })}`,
      ),
    [search, status, priority, categoryId, scope, sort, page],
  );

  // Cualquier cambio de filtro vuelve a la primera página.
  const onFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title={staff ? 'Tickets' : 'Mis tickets'}
        subtitle={staff ? 'Cola de atención del equipo de soporte' : 'Seguimiento de tus solicitudes'}
        actions={
          <Button onClick={() => navigate('/tickets/nuevo')}>
            <Plus className="h-4 w-4" /> Nuevo ticket
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input className="input pl-9" placeholder="Buscar por título, descripción o HD-0001" value={q} onChange={(e) => onFilter(setQ)(e.target.value)} aria-label="Buscar tickets" />
          </div>
          <select className="input" value={status} onChange={(e) => onFilter(setStatus)(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value={OPEN}>Abiertos</option>
            {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="input" value={priority} onChange={(e) => onFilter(setPriority)(e.target.value as Priority | '')} aria-label="Filtrar por prioridad">
            <option value="">Todas las prioridades</option>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <select className="input" value={categoryId} onChange={(e) => onFilter(setCategoryId)(e.target.value)} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            {staff && (
              <select className="input" value={scope} onChange={(e) => onFilter(setScope)(e.target.value as typeof scope)} aria-label="Alcance">
                <option value="">Todos</option>
                <option value="mine">Asignados a mí</option>
                <option value="unassigned">Sin asignar</option>
              </select>
            )}
            <select className="input" value={sort} onChange={(e) => onFilter(setSort)(e.target.value)} aria-label="Ordenar">
              <option value="createdAt:desc">Más recientes</option>
              <option value="createdAt:asc">Más antiguos</option>
              <option value="priority:desc">Prioridad</option>
              <option value="resolutionDueAt:asc">Vencimiento</option>
            </select>
          </div>
        </div>

        {tickets.loading ? (
          <Spinner />
        ) : tickets.error ? (
          <ErrorState error={tickets.error} onRetry={tickets.reload} />
        ) : !tickets.data?.data.length ? (
          <EmptyState title="No hay tickets" description="Prueba con otros filtros o crea un nuevo ticket." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ticket</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Prioridad</th>
                    <th className="px-4 py-3 font-medium">SLA</th>
                    {staff && <th className="px-4 py-3 font-medium">Solicitante</th>}
                    <th className="px-4 py-3 font-medium">Técnico</th>
                    <th className="px-4 py-3 font-medium">Creado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tickets.data.data.map((t) => (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => navigate(`/tickets/${t.id}`)}>
                      <td className="max-w-xs px-4 py-3">
                        <Link to={`/tickets/${t.id}`} className="font-medium hover:text-brand-600" onClick={(e) => e.stopPropagation()}>
                          {t.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {ticketCode(t.number)} · {t.categoryName ?? 'Sin categoría'}
                        </p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3">
                        <SlaBadge state={t.slaState} />
                        <p className="mt-1 whitespace-nowrap text-xs text-slate-500">{['resuelto', 'cerrado', 'cancelado'].includes(t.status) ? '' : dueText(t.minutesToDue, t.slaState)}</p>
                      </td>
                      {staff && <td className="whitespace-nowrap px-4 py-3">{t.requesterName}</td>}
                      <td className="whitespace-nowrap px-4 py-3">{t.assigneeName ?? <span className="text-slate-400">Sin asignar</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={tickets.data.meta.page} totalPages={tickets.data.meta.totalPages} total={tickets.data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
