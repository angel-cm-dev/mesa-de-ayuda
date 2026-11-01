import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Lock, Paperclip, Printer, Shuffle, Star } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Spinner } from '../components/ui';
import { PriorityBadge, SlaBadge, StatusBadge } from '../components/ui/Badges';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { api, ApiError } from '../lib/api';
import { dueText, formatBytes, formatDate, PRIORITY_LABEL, STATUS_LABEL, ticketCode, TRANSITION_ACTION } from '../lib/format';
import type { Priority, TicketDetail, TicketEvent, TicketStatus } from '../lib/types';

const EVENT_LABEL: Record<string, string> = {
  creado: 'Ticket creado',
  estado_cambiado: 'Cambio de estado',
  asignado: 'Asignación',
  prioridad_cambiada: 'Cambio de prioridad',
  comentario_agregado: 'Comentario',
  adjunto_agregado: 'Adjunto',
  sla_incumplido: 'SLA incumplido',
  encuesta_respondida: 'Encuesta respondida',
};

function describeEvent(e: TicketEvent, names: Record<string, string>): string {
  switch (e.action) {
    case 'estado_cambiado':
      return `${STATUS_LABEL[e.fromValue as TicketStatus] ?? e.fromValue} → ${STATUS_LABEL[e.toValue as TicketStatus] ?? e.toValue}`;
    case 'asignado':
      return `Asignado a ${names[e.toValue ?? ''] ?? 'técnico'} (${e.details})`;
    case 'prioridad_cambiada':
      return `${PRIORITY_LABEL[e.fromValue as Priority]} → ${PRIORITY_LABEL[e.toValue as Priority]}`;
    case 'comentario_agregado':
      return e.details === 'interno' ? 'Nota interna' : 'Comentario público';
    case 'adjunto_agregado':
      return e.toValue ?? '';
    case 'encuesta_respondida':
      return `Calificación ${e.toValue}/5`;
    default:
      return e.details ?? '';
  }
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { user, hasRole } = useAuth();
  const staff = hasRole('admin', 'tecnico');
  const { data: t, loading, error, reload } = useAsync(() => api.get<TicketDetail>(`/tickets/${id}`), [id]);
  const technicians = useAsync(() => (staff ? api.get<Array<{ id: string; name: string }>>('/users/technicians') : Promise.resolve([])), [staff]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [rating, setRating] = useState(0);
  const [surveyComment, setSurveyComment] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading && !t) return <Spinner />;
  if (error || !t) return <ErrorState error={error ?? new Error('No encontrado')} onRetry={reload} />;

  /** Ejecuta una acción, muestra el error de negocio si falla y recarga el detalle. */
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      reload();
      return true;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Error inesperado');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const names: Record<string, string> = Object.fromEntries((technicians.data ?? []).map((x) => [x.id, x.name]));
  if (t.assigneeId && t.assigneeName) names[t.assigneeId] = t.assigneeName;
  const isFinal = ['cerrado', 'cancelado'].includes(t.status);
  const canSurvey = user?.id === t.requesterId && ['resuelto', 'cerrado'].includes(t.status) && !t.survey;

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    if (await run('comment', () => api.post(`/tickets/${id}/comments`, { body: comment, internal }))) {
      setComment('');
      setInternal(false);
    }
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setActionError('El archivo supera el máximo de 5 MB');
    const fd = new FormData();
    fd.append('file', file);
    await run('upload', () => api.post(`/tickets/${id}/attachments`, fd));
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to="/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Volver a tickets
        </Link>
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">{ticketCode(t.number)}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} />
          <PriorityBadge priority={t.priority} />
          <SlaBadge state={t.slaState} />
          {t.reopenCount > 0 && <span className="text-xs text-slate-500">Reabierto {t.reopenCount}×</span>}
        </div>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}

      {t.availableTransitions.length > 0 && (
        <Card className="no-print mb-6 p-4">
          <p className="mb-2 text-sm font-medium">Acciones</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input className="input md:max-w-md" placeholder="Nota opcional (se publica como comentario)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota del cambio de estado" />
            <div className="flex flex-wrap gap-2">
              {t.availableTransitions.map((s) => (
                <Button
                  key={s}
                  variant={s === 'cancelado' ? 'danger' : s === 'resuelto' || s === 'cerrado' ? 'primary' : 'secondary'}
                  loading={busy === s}
                  onClick={async () => {
                    if (await run(s, () => api.patch(`/tickets/${id}/status`, { status: s, note: note.trim() || undefined }))) setNote('');
                  }}
                >
                  {s === 'en_progreso' && t.status === 'resuelto' ? 'Reabrir' : TRANSITION_ACTION[s]}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-2 font-semibold">Descripción</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t.description}</p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Conversación ({t.comments.length})</h2>
            <ul className="space-y-4">
              {t.comments.map((c) => (
                <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.internal ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800'}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{c.authorName}</span>
                    {c.internal && (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <Lock className="h-3 w-3" /> Nota interna
                      </span>
                    )}
                    <span>· {formatDate(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
              {t.comments.length === 0 && <li className="text-sm text-slate-500">Aún no hay comentarios.</li>}
            </ul>
            {!isFinal && (
              <form onSubmit={onComment} className="no-print mt-4 space-y-2">
                <textarea className="input min-h-24" placeholder="Escribe un comentario…" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Nuevo comentario" />
                <div className="flex items-center justify-between">
                  {staff ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Nota interna (no visible para el usuario)
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button type="submit" loading={busy === 'comment'} disabled={!comment.trim()}>
                    Comentar
                  </Button>
                </div>
              </form>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Adjuntos ({t.attachments.length})</h2>
              {!isFinal && (
                <>
                  <input ref={fileRef} type="file" className="hidden" accept=".png,.jpg,.jpeg,.gif,.pdf,.txt,.csv,.docx,.xlsx" onChange={(e) => onUpload(e.target.files?.[0])} />
                  <Button variant="secondary" className="no-print" loading={busy === 'upload'} onClick={() => fileRef.current?.click()}>
                    <Paperclip className="h-4 w-4" /> Adjuntar
                  </Button>
                </>
              )}
            </div>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {t.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="truncate">
                    {a.originalName} <span className="text-xs text-slate-500">({formatBytes(a.sizeBytes)})</span>
                  </span>
                  <Button variant="ghost" aria-label={`Descargar ${a.originalName}`} onClick={() => run('dl', () => api.download(`/tickets/${id}/attachments/${a.id}`, a.originalName))}>
                    <Download className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {t.attachments.length === 0 && <li className="py-2 text-slate-500">Sin adjuntos. Máx. 5 MB (imágenes, PDF, texto, Office).</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Detalles</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Solicitante</dt>
              <dd>{t.requesterName}</dd>
              <dt className="text-slate-500">Técnico</dt>
              <dd>{t.assigneeName ?? 'Sin asignar'}</dd>
              <dt className="text-slate-500">Categoría</dt>
              <dd>{t.categoryName ?? '—'}</dd>
              <dt className="text-slate-500">Creado</dt>
              <dd>{formatDate(t.createdAt)}</dd>
              <dt className="text-slate-500">1.ª respuesta</dt>
              <dd>{t.firstResponseAt ? formatDate(t.firstResponseAt) : `Vence ${formatDate(t.responseDueAt)}`}</dd>
              <dt className="text-slate-500">Resolución</dt>
              <dd>
                {formatDate(t.resolutionDueAt)}
                {!['resuelto', 'cerrado', 'cancelado'].includes(t.status) && <p className="text-xs text-slate-500">{dueText(t.minutesToDue, t.slaState)}</p>}
              </dd>
              {t.resolvedAt && (
                <>
                  <dt className="text-slate-500">Resuelto</dt>
                  <dd>{formatDate(t.resolvedAt)}</dd>
                </>
              )}
            </dl>
          </Card>

          {staff && !isFinal && t.status !== 'resuelto' && (
            <Card className="no-print space-y-4 p-5">
              <div>
                <h2 className="mb-2 font-semibold">Asignación</h2>
                {hasRole('admin') ? (
                  <div className="space-y-2">
                    <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Técnico">
                      <option value="">Elegir técnico…</option>
                      {technicians.data?.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={!assignee} loading={busy === 'assign'} onClick={() => run('assign', () => api.post(`/tickets/${id}/assign`, { mode: 'manual', assigneeId: assignee }))}>
                        Asignar
                      </Button>
                      <Button variant="secondary" className="flex-1" loading={busy === 'auto'} onClick={() => run('auto', () => api.post(`/tickets/${id}/assign`, { mode: 'auto' }))} title="Asigna al técnico que lleva más tiempo sin recibir tickets">
                        <Shuffle className="h-4 w-4" /> Round-robin
                      </Button>
                    </div>
                  </div>
                ) : !t.assigneeId ? (
                  <Button className="w-full" loading={busy === 'take'} onClick={() => run('take', () => api.post(`/tickets/${id}/assign`, { mode: 'manual', assigneeId: user!.id }))}>
                    Tomar este ticket
                  </Button>
                ) : (
                  <p className="text-sm text-slate-500">Solo un administrador puede reasignar.</p>
                )}
              </div>
              <div>
                <h2 className="mb-2 font-semibold">Prioridad</h2>
                <select className="input" value={t.priority} onChange={(e) => run('priority', () => api.patch(`/tickets/${id}/priority`, { priority: e.target.value }))} aria-label="Cambiar prioridad">
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Al cambiarla se recalcula el vencimiento del SLA.</p>
              </div>
            </Card>
          )}

          {(canSurvey || t.survey) && (
            <Card className="p-5">
              <h2 className="mb-2 font-semibold">Encuesta de satisfacción</h2>
              {t.survey ? (
                <div className="text-sm">
                  <div className="flex gap-1" aria-label={`${t.survey.rating} de 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-5 w-5 ${n <= t.survey!.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  {t.survey.comment && <p className="mt-2 text-slate-600 dark:text-slate-300">“{t.survey.comment}”</p>}
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (rating) run('survey', () => api.post(`/tickets/${id}/survey`, { rating, comment: surveyComment || null }));
                  }}
                >
                  <p className="text-sm text-slate-500">¿Cómo calificarías la atención recibida?</p>
                  <div className="flex gap-1" role="radiogroup" aria-label="Calificación">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} estrellas`} onClick={() => setRating(n)}>
                        <Star className={`h-7 w-7 transition ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea className="input" placeholder="Comentario (opcional)" value={surveyComment} onChange={(e) => setSurveyComment(e.target.value)} />
                  <Button type="submit" disabled={!rating} loading={busy === 'survey'}>
                    Enviar calificación
                  </Button>
                </form>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Historial</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-4 text-sm dark:border-slate-700">
              {t.events.map((e) => (
                <li key={e.id}>
                  <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${e.action === 'sla_incumplido' ? 'bg-red-500' : 'bg-brand-500'}`} aria-hidden />
                  <p className="font-medium">{EVENT_LABEL[e.action] ?? e.action}</p>
                  <p className="text-slate-600 dark:text-slate-300">{describeEvent(e, names)}</p>
                  <p className="text-xs text-slate-500">
                    {e.actorName ?? 'Sistema'} · {formatDate(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
