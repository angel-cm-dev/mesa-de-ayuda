import { useState, type FormEvent } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Alert, Button, Card, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { api, ApiError, toQuery } from '../lib/api';
import { formatDate, ROLE_LABEL } from '../lib/format';
import type { Page, Role, User } from '../lib/types';
import { hasErrors, validateRegister, type Errors, type RegisterForm } from '../lib/validation';

type NewUser = RegisterForm & { role: Role };

export function UsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [page, setPage] = useState(1);
  const search = useDebounce(q);
  const users = useAsync(() => api.get<Page<User>>(`/users${toQuery({ q: search, role, page, pageSize: 10 })}`), [search, role, page]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewUser>({ name: '', email: '', password: '', role: 'tecnico' });
  const [errors, setErrors] = useState<Errors<NewUser>>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const v = validateRegister(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    try {
      await api.post('/users', form);
      setMessage({ kind: 'success', text: `Usuario ${form.email} creado` });
      setForm({ name: '', email: '', password: '', role: 'tecnico' });
      setShowForm(false);
      users.reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage({ kind: 'error', text: err.message });
        setErrors(err.byField as Errors<NewUser>);
      }
    } finally {
      setSaving(false);
    }
  }

  async function update(u: User, patch: Partial<Pick<User, 'role' | 'active'>>) {
    try {
      await api.patch(`/users/${u.id}`, patch);
      users.reload();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Error inesperado' });
    }
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de cuentas y roles"
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            <UserPlus className="h-4 w-4" /> Nuevo usuario
          </Button>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}

      {showForm && (
        <Card className="mb-6 p-5">
          <form onSubmit={onCreate} noValidate className="grid gap-4 md:grid-cols-5 md:items-start">
            <Field label="Nombre" htmlFor="u-name" error={errors.name}>
              <input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Correo" htmlFor="u-email" error={errors.email}>
              <input id="u-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Contraseña" htmlFor="u-pass" error={errors.password}>
              <input id="u-pass" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Rol" htmlFor="u-role">
              <select id="u-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" loading={saving} className="md:mt-6">
              Crear
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input className="input pl-9" placeholder="Buscar por nombre o correo" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Buscar usuarios" />
          </div>
          <select className="input sm:w-48" value={role} onChange={(e) => { setRole(e.target.value as Role | ''); setPage(1); }} aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {users.loading ? (
          <Spinner />
        ) : users.error ? (
          <ErrorState error={users.error} onRetry={users.reload} />
        ) : !users.data?.data.length ? (
          <EmptyState title="Sin usuarios" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Rol</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Alta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.data.data.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select className="input py-1" value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u, { role: e.target.value as Role })} aria-label={`Rol de ${u.name}`}>
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={u.id === me?.id}
                          onClick={() => update(u, { active: !u.active })}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${u.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                          title="Clic para activar/desactivar"
                        >
                          {u.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={users.data.meta.page} totalPages={users.data.meta.totalPages} total={users.data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
