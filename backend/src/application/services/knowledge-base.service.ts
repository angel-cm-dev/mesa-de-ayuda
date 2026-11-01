import { randomUUID } from 'node:crypto';
import type { Article, AuthUser } from '../../domain/entities.js';
import { NotFoundError, ValidationError } from '../../domain/errors.js';
import type { ArticleDto, ListArticlesQuery } from '../dtos/index.js';
import type { ArticleListItem, Page, UnitOfWork } from '../ports/repositories.js';
import type { Clock } from '../ports/services.js';

/** Genera un slug legible para URLs: "Cómo restablecer VPN" → "como-restablecer-vpn". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Base de conocimiento: artículos de autoservicio. El objetivo de negocio es
 * "desviar" tickets: si el usuario encuentra la solución, no abre un caso.
 */
export class KnowledgeBaseService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  list(query: ListArticlesQuery, actor: AuthUser): Promise<Page<ArticleListItem>> {
    const { q, categoryId, page, pageSize, sort, order } = query;
    // Los borradores solo los ve el personal de soporte.
    return this.uow.repos.articles.list({ q, categoryId, onlyPublished: actor.role === 'usuario' }, { page, pageSize, sort, order });
  }

  async get(id: string, actor: AuthUser): Promise<ArticleListItem> {
    const article = await this.uow.repos.articles.findById(id);
    if (!article || (!article.published && actor.role === 'usuario')) throw new NotFoundError('Artículo', id);
    await this.uow.repos.articles.incrementViews(id);
    return { ...article, views: article.views + 1 };
  }

  async create(dto: ArticleDto, actor: AuthUser): Promise<Article> {
    const now = this.clock.now();
    const article: Article = {
      id: randomUUID(),
      title: dto.title,
      slug: await this.uniqueSlug(dto.title),
      content: dto.content,
      categoryId: dto.categoryId ?? null,
      authorId: actor.id,
      published: dto.published,
      views: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.uow.repos.articles.create(article);
    return article;
  }

  async update(id: string, dto: ArticleDto): Promise<Article> {
    const current = await this.uow.repos.articles.findById(id);
    if (!current) throw new NotFoundError('Artículo', id);
    const slug = dto.title === current.title ? current.slug : await this.uniqueSlug(dto.title, id);
    const patch = { title: dto.title, slug, content: dto.content, categoryId: dto.categoryId ?? null, published: dto.published, updatedAt: this.clock.now() };
    await this.uow.repos.articles.update(id, patch);
    return { ...current, ...patch };
  }

  async remove(id: string): Promise<void> {
    if (!(await this.uow.repos.articles.findById(id))) throw new NotFoundError('Artículo', id);
    await this.uow.repos.articles.delete(id);
  }

  private async uniqueSlug(title: string, ignoreId?: string): Promise<string> {
    const base = slugify(title);
    if (!base) throw new ValidationError('El título debe contener letras o números');
    let slug = base;
    for (let i = 2; ; i++) {
      const existing = await this.uow.repos.articles.findBySlug(slug);
      if (!existing || existing.id === ignoreId) return slug;
      slug = `${base}-${i}`;
    }
  }
}
