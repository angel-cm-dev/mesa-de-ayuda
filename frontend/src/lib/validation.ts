/**
 * Validación de formularios en el cliente. Replica las reglas del backend para
 * dar retroalimentación inmediata; el backend sigue siendo la fuente de verdad.
 */
export type Errors<T> = Partial<Record<keyof T, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Misma política que el backend: 8+ caracteres, una mayúscula y un número. */
export function passwordIssues(value: string): string | undefined {
  if (value.length < 8) return 'Mínimo 8 caracteres';
  if (!/[A-Z]/.test(value)) return 'Debe incluir una mayúscula';
  if (!/[0-9]/.test(value)) return 'Debe incluir un número';
  return undefined;
}

export interface LoginForm {
  email: string;
  password: string;
}

export function validateLogin(f: LoginForm): Errors<LoginForm> {
  const e: Errors<LoginForm> = {};
  if (!isEmail(f.email)) e.email = 'Ingresa un correo válido';
  if (!f.password) e.password = 'Ingresa tu contraseña';
  return e;
}

export interface RegisterForm extends LoginForm {
  name: string;
}

export function validateRegister(f: RegisterForm): Errors<RegisterForm> {
  const e: Errors<RegisterForm> = {};
  if (f.name.trim().length < 3) e.name = 'Mínimo 3 caracteres';
  if (!isEmail(f.email)) e.email = 'Ingresa un correo válido';
  const pw = passwordIssues(f.password);
  if (pw) e.password = pw;
  return e;
}

export interface TicketForm {
  title: string;
  description: string;
  priority: string;
  categoryId: string;
}

export function validateTicket(f: TicketForm): Errors<TicketForm> {
  const e: Errors<TicketForm> = {};
  const title = f.title.trim();
  if (title.length < 5) e.title = 'El título debe tener al menos 5 caracteres';
  else if (title.length > 150) e.title = 'Máximo 150 caracteres';
  if (f.description.trim().length < 10) e.description = 'Describe el problema con al menos 10 caracteres';
  if (!['baja', 'media', 'alta', 'critica'].includes(f.priority)) e.priority = 'Selecciona una prioridad';
  return e;
}

export interface ArticleForm {
  title: string;
  content: string;
}

export function validateArticle(f: ArticleForm): Errors<ArticleForm> {
  const e: Errors<ArticleForm> = {};
  if (f.title.trim().length < 5) e.title = 'Mínimo 5 caracteres';
  if (f.content.trim().length < 20) e.content = 'El contenido debe tener al menos 20 caracteres';
  return e;
}

export const hasErrors = (e: object) => Object.values(e).some(Boolean);
