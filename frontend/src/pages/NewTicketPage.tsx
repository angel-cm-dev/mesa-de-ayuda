import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Field, PageHeader } from '../components/ui';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { api, ApiError, toQuery } from '../lib/api';
import { PRIORITY_LABEL } from '../lib/format';
import type { Article, Category, Page, Priority, SlaPolicy, Ticket } from '../lib/types';
import { hasErrors, validateTicket, type Errors, type TicketForm } from '../lib/validation';

export function NewTicketPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TicketForm>({ title: '', description: '', priority: 'media', categoryId: '' });
  const [errors, setErrors] = useState<Errors<TicketForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = useAsync(() => api.get<Category[]>('/categories'), []);
  const policies = useAsync(() => api.get<SlaPolicy[]>('/sla-policies'), []);

  // Desvío de tickets: mientras el usuario escribe el título se sugieren artículos de la base de conocimiento.
  const titleQuery = useDebounce(form.title.trim(), 500);
  const suggestions = useAsync(
    () => (titleQuery.length >= 4 ? api.get<Page<Article>>(`/kb/articles${toQuery({ q: titleQuery.split(' ')[0], pageSize: 3 })}`) : Promise.resolve(null)),
    [titleQuery],
  );

  const policy = policies.data?.find((p) => p.priority === form.priority);
  const set = (k: keyof TicketForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateTicket(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    setServerError(null);
    try {
      const ticket = await api.post<Ticket>('/tickets', { ...form, categoryId: form.categoryId || null });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
        setErrors(err.byField as Errors<TicketForm>);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Nuevo ticket" subtitle="Describe tu problema y el equipo de soporte te contactará." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {serverError && <Alert>{serverError}</Alert>}
            <Field label="Título" htmlFor="title" error={errors.title}>
              <input id="title" className="input" value={form.title} onChange={set('title')} maxLength={150} placeholder="Ej.: No puedo acceder a la VPN" />
            </Field>
            <Field label="Descripción" htmlFor="description" error={errors.description} hint="Incluye pasos para reproducir, mensajes de error y desde cuándo ocurre.">
              <textarea id="description" className="input min-h-36" value={form.description} onChange={set('description')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prioridad" htmlFor="priority" error={errors.priority} hint={policy ? `SLA: respuesta en ${policy.responseHours} h, resolución en ${policy.resolutionHours} h` : undefined}>
                <select id="priority" className="input" value={form.priority} onChange={set('priority')}>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Categoría" htmlFor="categoryId">
                <select id="categoryId" className="input" value={form.categoryId} onChange={set('categoryId')}>
                  <option value="">Sin categoría</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Crear ticket
              </Button>
            </div>
          </form>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="font-semibold">¿Ya lo intentaste?</h2>
          <p className="mt-1 text-sm text-slate-500">Artículos que podrían resolver tu problema sin esperar:</p>
          <ul className="mt-3 space-y-2 text-sm">
            {suggestions.data?.data.length ? (
              suggestions.data.data.map((a) => (
                <li key={a.id}>
                  <Link to={`/kb/${a.id}`} className="text-brand-600 hover:underline">
                    {a.title}
                  </Link>
                </li>
              ))
            ) : (
              <li className="text-slate-400">Escribe un título para ver sugerencias.</li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
