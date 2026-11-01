import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAsync, useDebounce } from '../hooks/useAsync';
import { api, toQuery } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Article, Category, Page } from '../lib/types';

export function KnowledgeBasePage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState('views');
  const [page, setPage] = useState(1);
  const search = useDebounce(q);

  const categories = useAsync(() => api.get<Category[]>('/categories'), []);
  const articles = useAsync(() => api.get<Page<Article>>(`/kb/articles${toQuery({ q: search, categoryId, sort, order: sort === 'title' ? 'asc' : 'desc', page, pageSize: 9 })}`), [search, categoryId, sort, page]);

  return (
    <>
      <PageHeader
        title="Base de conocimiento"
        subtitle="Guías de autoservicio para resolver problemas frecuentes"
        actions={
          hasRole('admin', 'tecnico') && (
            <Button onClick={() => navigate('/kb/nuevo')}>
              <Plus className="h-4 w-4" /> Nuevo artículo
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <input className="input pl-9" placeholder="¿Qué necesitas resolver?" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Buscar artículos" />
        </div>
        <select className="input" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
          <option value="views">Más vistos</option>
          <option value="createdAt">Más recientes</option>
          <option value="title">Alfabético</option>
        </select>
      </div>

      {articles.loading ? (
        <Spinner />
      ) : articles.error ? (
        <ErrorState error={articles.error} onRetry={articles.reload} />
      ) : !articles.data?.data.length ? (
        <Card>
          <EmptyState title="Sin resultados" description="No encontramos artículos. Si el problema persiste, abre un ticket." action={<Link className="text-sm text-brand-600 hover:underline" to="/tickets/nuevo">Crear ticket</Link>} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {articles.data.data.map((a) => (
              <Link key={a.id} to={`/kb/${a.id}`} className="card flex flex-col p-5 transition hover:border-brand-500 hover:shadow-md">
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{a.categoryName ?? 'General'}</span>
                  {!a.published && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Borrador</span>}
                </div>
                <h2 className="font-semibold">{a.title}</h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-500">{a.content}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDate(a.updatedAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {a.views}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <Card className="mt-4">
            <Pagination page={articles.data.meta.page} totalPages={articles.data.meta.totalPages} total={articles.data.meta.total} onChange={setPage} />
          </Card>
        </>
      )}
    </>
  );
}
