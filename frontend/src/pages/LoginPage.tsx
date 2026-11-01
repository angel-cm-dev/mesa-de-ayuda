import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { Alert, Button, Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { hasErrors, validateLogin, validateRegister, type Errors, type RegisterForm } from '../lib/validation';

const DEMO_ACCOUNTS = [
  { email: 'admin@demo.pe', label: 'Admin' },
  { email: 'tecnico1@demo.pe', label: 'Técnico' },
  { email: 'usuario@demo.pe', label: 'Usuario' },
];

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState<RegisterForm>({ name: '', email: 'admin@demo.pe', password: 'Demo123!' });
  const [errors, setErrors] = useState<Errors<RegisterForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  const set = (k: keyof RegisterForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = mode === 'login' ? validateLogin(form) : validateRegister(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSubmitting(true);
    setServerError(null);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
        setErrors(err.byField as Errors<RegisterForm>);
      } else setServerError('Error inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-indigo-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <LifeBuoy className="h-7 w-7" aria-hidden /> Mesa de Ayuda
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Soporte TI con SLA medibles, trazabilidad completa y autoservicio.</h2>
          <ul className="mt-6 space-y-2 text-brand-100">
            <li>• Tickets con máquina de estados y auditoría</li>
            <li>• Alertas de SLA y asignación round-robin</li>
            <li>• Base de conocimiento y encuestas de satisfacción</li>
          </ul>
        </div>
        <p className="text-sm text-brand-100">Proyecto de portafolio · datos ficticios</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
          <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Ingresa con tu cuenta corporativa.' : 'Las cuentas nuevas tienen rol de usuario.'}</p>

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            {serverError && <Alert>{serverError}</Alert>}
            {mode === 'register' && (
              <Field label="Nombre completo" htmlFor="name" error={errors.name}>
                <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" />
              </Field>
            )}
            <Field label="Correo" htmlFor="email" error={errors.email}>
              <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>
            <Field label="Contraseña" htmlFor="password" error={errors.password} hint={mode === 'register' ? 'Mín. 8 caracteres, una mayúscula y un número' : undefined}>
              <input id="password" type="password" className="input" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            <Button type="submit" loading={submitting} className="w-full">
              {mode === 'login' ? 'Ingresar' : 'Registrarme'}
            </Button>
          </form>

          <button
            className="mt-4 w-full text-center text-sm text-brand-600 hover:underline dark:text-brand-500"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setErrors({});
              setServerError(null);
            }}
          >
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>

          {mode === 'login' && (
            <div className="mt-8 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
              <p className="mb-2 font-medium">Cuentas demo (contraseña Demo123!):</p>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button key={a.email} type="button" className="rounded-md bg-slate-100 px-2 py-1 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700" onClick={() => setForm((f) => ({ ...f, email: a.email, password: 'Demo123!' }))}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
