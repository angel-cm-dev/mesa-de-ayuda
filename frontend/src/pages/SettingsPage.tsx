import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, ErrorState, PageHeader, Spinner } from '../components/ui';
import { PriorityBadge } from '../components/ui/Badges';
import { useAsync } from '../hooks/useAsync';
import { api, ApiError } from '../lib/api';
import type { Category, SlaPolicy } from '../lib/types';

function SlaRow({ policy, onSaved }: { policy: SlaPolicy; onSaved: (msg: string, ok: boolean) => void }) {
  const [response, setResponse] = useState(String(policy.responseHours));
  const [resolution, setResolution] = useState(String(policy.resolutionHours));
  const [saving, setSaving] = useState(false);
  const dirty = response !== String(policy.responseHours) || resolution !== String(policy.resolutionHours);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/sla-policies/${policy.priority}`, { responseHours: Number(response), resolutionHours: Number(resolution) });
      onSaved(`Política "${policy.priority}" actualizada`, true);
    } catch (err) {
      onSaved(err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'Error', false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td className="px-4 py-3"><PriorityBadge priority={policy.priority} /></td>
      <td className="px-4 py-3"><input type="number" min="0.5" step="0.5" className="input w-24" value={response} onChange={(e) => setResponse(e.target.value)} aria-label={`Horas de respuesta ${policy.priority}`} /></td>
      <td className="px-4 py-3"><input type="number" min="0.5" step="0.5" className="input w-24" value={resolution} onChange={(e) => setResolution(e.target.value)} aria-label={`Horas de resolución ${policy.priority}`} /></td>
      <td className="px-4 py-3 text-right"><Button variant="secondary" disabled={!dirty} loading={saving} onClick={save}>Guardar</Button></td>
    </tr>
  );
}

export function SettingsPage() {
  const policies = useAsync(() => api.get<SlaPolicy[]>('/sla-policies'), []);
  const categories = useAsync(() => api.get<Category[]>('/categories?all=true'), []);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setMessage({ text: 'El nombre debe tener al menos 2 caracteres', ok: false });
    try {
      await api.post('/categories', { name, description: description || null });
      setName('');
      setDescription('');
      setMessage({ text: 'Categoría creada', ok: true });
      categories.reload();
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : 'Error', ok: false });
    }
  }

  async function toggleCategory(c: Category) {
    await api.put(`/categories/${c.id}`, { name: c.name, description: c.description, active: !c.active });
    categories.reload();
  }

  return (
    <>
      <PageHeader title="Configuración" subtitle="Políticas de SLA y catálogo de categorías" />
      {message && (
        <div className="mb-4">
          <Alert kind={message.ok ? 'success' : 'error'}>{message.text}</Alert>
        </div>
      )}

      <Card className="mb-6 overflow-x-auto">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="font-semibold">Políticas de SLA (horas calendario)</h2>
          <p className="text-sm text-slate-500">Los cambios aplican a tickets nuevos; los existentes conservan su vencimiento.</p>
        </div>
        {policies.loading ? <Spinner /> : policies.error ? <ErrorState error={policies.error} onRetry={policies.reload} /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Prioridad</th>
                <th className="px-4 py-2 font-medium">1.ª respuesta (h)</th>
                <th className="px-4 py-2 font-medium">Resolución (h)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {policies.data?.map((p) => (
                <SlaRow key={`${p.priority}-${p.responseHours}-${p.resolutionHours}`} policy={p} onSaved={(text, ok) => { setMessage({ text, ok }); if (ok) policies.reload(); }} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="font-semibold">Categorías</h2>
        </div>
        <form onSubmit={addCategory} className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row">
          <input className="input md:w-60" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre de categoría" />
          <input className="input" placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Descripción de categoría" />
          <Button type="submit">Agregar</Button>
        </form>
        {categories.loading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {categories.data?.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className={`font-medium ${c.active ? '' : 'text-slate-400 line-through'}`}>{c.name}</p>
                  {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                </div>
                <Button variant="ghost" onClick={() => toggleCategory(c)}>{c.active ? 'Desactivar' : 'Activar'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
