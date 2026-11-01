import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Field, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Article, Category } from '../lib/types';
import { hasErrors, validateArticle, type ArticleForm, type Errors } from '../lib/validation';

type Form = ArticleForm & { categoryId: string; published: boolean };

export function ArticlePage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'tecnico');

  const article = useAsync(() => (id ? api.get<Article>(`/kb/articles/${id}`) : Promise.resolve(null)), [id]);
  const categories = useAsync(() => (canEdit ? api.get<Category[]>('/categories') : Promise.resolve([])), [canEdit]);

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<Form>({ title: '', content: '', categoryId: '', published: true });
  const [errors, setErrors] = useState<Errors<Form>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (article.data) setForm({ title: article.data.title, content: article.data.content, categoryId: article.data.categoryId ?? '', published: article.data.published });
  }, [article.data]);

  if (article.loading && !isNew) return <Spinner />;
  if (article.error) return <ErrorState error={article.error} onRetry={article.reload} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validateArticle(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    setServerError(null);
    try {
      const body = { ...form, categoryId: form.categoryId || null };
      const saved = isNew ? await api.post<Article>('/kb/articles', body) : await api.put<Article>(`/kb/articles/${id}`, body);
      if (isNew) navigate(`/kb/${saved.id}`, { replace: true });
      else {
        setEditing(false);
        article.reload();
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm('¿Eliminar este artículo? Esta acción no se puede deshacer.')) return;
    try {
      await api.delete(`/kb/articles/${id}`);
      navigate('/kb');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error inesperado');
    }
  }

  const a = article.data;
  return (
    <>
      <Link to="/kb" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Base de conocimiento
      </Link>

      {editing ? (
        <>
          <PageHeader title={isNew ? 'Nuevo artículo' : 'Editar artículo'} />
          <Card className="p-6">
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {serverError && <Alert>{serverError}</Alert>}
              <Field label="Título" htmlFor="title" error={errors.title}>
                <input id="title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Contenido" htmlFor="content" error={errors.content} hint="Texto plano; usa saltos de línea para los pasos.">
                <textarea id="content" className="input min-h-64 font-mono text-sm" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoría" htmlFor="category">
                  <select id="category" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                    <option value="">General</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                  Publicado (visible para usuarios)
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => (isNew ? navigate('/kb') : setEditing(false))}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  Guardar
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : (
        a && (
          <Card className="p-6 lg:p-8">
            {serverError && <Alert>{serverError}</Alert>}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-brand-600">{a.categoryName ?? 'General'}</p>
                <h1 className="mt-1 text-2xl font-semibold">{a.title}</h1>
                <p className="mt-1 text-xs text-slate-500">
                  Por {a.authorName} · actualizado {formatDate(a.updatedAt)} · {a.views} vistas {!a.published && '· Borrador'}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                  {hasRole('admin') && (
                    <Button variant="danger" onClick={onDelete} aria-label="Eliminar artículo">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <article className="mt-6 whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">{a.content}</article>
            <div className="mt-8 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
              ¿No resolvió tu problema?{' '}
              <Link to="/tickets/nuevo" className="font-medium text-brand-600 hover:underline">
                Abre un ticket
              </Link>
            </div>
          </Card>
        )
      )}
    </>
  );
}
