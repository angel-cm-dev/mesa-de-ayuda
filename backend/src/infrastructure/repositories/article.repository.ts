import type { ArticleFilter, ArticleListItem, ArticleRepository, PageRequest } from '../../application/ports/repositories.js';
import type { Article } from '../../domain/entities.js';
import { type Db, likeLower, paginate, toBool, toDate, toRow } from './helpers.js';

const mapArticle = (r: Record<string, unknown>): ArticleListItem => ({
  id: String(r.id),
  title: String(r.title),
  slug: String(r.slug),
  content: String(r.content),
  categoryId: (r.category_id as string | null) ?? null,
  authorId: String(r.author_id),
  published: toBool(r.published),
  views: Number(r.views),
  createdAt: toDate(r.created_at),
  updatedAt: toDate(r.updated_at),
  authorName: String(r.author_name ?? ''),
  categoryName: (r.category_name as string | null) ?? null,
});

const ARTICLE_SORT: Record<string, string> = { title: 'k.title', createdAt: 'k.created_at', views: 'k.views' };

export class KnexArticleRepository implements ArticleRepository {
  constructor(private readonly db: Db) {}

  list(filter: ArticleFilter, page: PageRequest) {
    const q = this.base();
    if (filter.q) {
      const term = filter.q;
      q.where((w) => {
        w.whereRaw(...likeLower('k.title', term)).orWhereRaw(...likeLower('k.content', term));
      });
    }
    if (filter.categoryId) q.where('k.category_id', filter.categoryId);
    if (filter.onlyPublished) q.where('k.published', true);
    return paginate(q, page, ARTICLE_SORT[page.sort] ?? 'k.created_at', mapArticle);
  }

  async findById(id: string) {
    const row = await this.base().where('k.id', id).first();
    return row ? mapArticle(row) : null;
  }

  async findBySlug(slug: string): Promise<Article | null> {
    const row = await this.base().where('k.slug', slug).first();
    return row ? mapArticle(row) : null;
  }

  async create(article: Article) {
    await this.db('kb_articles').insert(toRow({ ...article }));
  }

  async update(id: string, patch: Partial<Article>) {
    await this.db('kb_articles').where({ id }).update(toRow(patch));
  }

  async delete(id: string) {
    await this.db('kb_articles').where({ id }).delete();
  }

  async incrementViews(id: string) {
    await this.db('kb_articles').where({ id }).increment('views', 1);
  }

  private base() {
    return this.db('kb_articles as k')
      .select('k.*', 'u.name as author_name', 'c.name as category_name')
      .join('users as u', 'u.id', 'k.author_id')
      .leftJoin('categories as c', 'c.id', 'k.category_id');
  }
}
