import type {
  AttachmentRepository,
  AuditRepository,
  CommentRepository,
  CommentWithAuthor,
  PageRequest,
  SurveyRepository,
  TicketEventWithActor,
  TicketFilter,
  TicketListItem,
  TicketRepository,
} from '../../application/ports/repositories.js';
import type { Attachment, AuditAction, Comment, Priority, Role, Survey, Ticket, TicketStatus } from '../../domain/entities.js';
import { isPostgres } from '../db/knex.js';
import { type Db, likeLower, paginate, toBool, toDate, toDateOrNull, toRow } from './helpers.js';

const mapTicket = (r: Record<string, unknown>): TicketListItem => ({
  id: String(r.id),
  number: Number(r.number),
  title: String(r.title),
  description: String(r.description),
  status: r.status as TicketStatus,
  priority: r.priority as Priority,
  categoryId: (r.category_id as string | null) ?? null,
  requesterId: String(r.requester_id),
  assigneeId: (r.assignee_id as string | null) ?? null,
  responseDueAt: toDate(r.response_due_at),
  resolutionDueAt: toDate(r.resolution_due_at),
  firstResponseAt: toDateOrNull(r.first_response_at),
  slaPausedAt: toDateOrNull(r.sla_paused_at),
  slaBreached: toBool(r.sla_breached),
  resolvedAt: toDateOrNull(r.resolved_at),
  closedAt: toDateOrNull(r.closed_at),
  reopenCount: Number(r.reopen_count),
  createdAt: toDate(r.created_at),
  updatedAt: toDate(r.updated_at),
  requesterName: String(r.requester_name),
  assigneeName: (r.assignee_name as string | null) ?? null,
  categoryName: (r.category_name as string | null) ?? null,
});

const TICKET_SORT: Record<string, string> = {
  number: 't.number',
  createdAt: 't.created_at',
  updatedAt: 't.updated_at',
  status: 't.status',
  resolutionDueAt: 't.resolution_due_at',
  title: 't.title',
};

export class KnexTicketRepository implements TicketRepository {
  constructor(private readonly db: Db) {}

  /**
   * Correlativo legible (HD-0001). En PostgreSQL se toma un advisory lock de la
   * transacción para que dos tickets simultáneos no obtengan el mismo número;
   * la restricción UNIQUE es la red de seguridad final.
   */
  async nextNumber() {
    if (isPostgres(this.db) && (this.db as { isTransaction?: boolean }).isTransaction) {
      await this.db.raw('select pg_advisory_xact_lock(?)', [4242]);
    }
    const row = (await this.db('tickets').max({ max: 'number' }).first()) as { max: number | string | null } | undefined;
    return Number(row?.max ?? 0) + 1;
  }

  async create(ticket: Ticket) {
    await this.db('tickets').insert(toRow({ ...ticket }));
  }

  async findById(id: string) {
    const row = await this.base().where('t.id', id).first();
    return row ? mapTicket(row) : null;
  }

  async update(id: string, patch: Partial<Ticket>) {
    // Se escriben explícitamente los null (p. ej. limpiar sla_paused_at): toRow solo omite undefined.
    await this.db('tickets').where({ id }).update(toRow(patch));
  }

  list(filter: TicketFilter, page: PageRequest) {
    const q = this.applyFilter(this.base(), filter);
    if (page.sort === 'priority') {
      // El orden de negocio (crítica > alta > media > baja) no coincide con el alfabético.
      q.orderByRaw(`CASE t.priority WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END ${page.order === 'asc' ? 'asc' : 'desc'}`);
      return paginate(q, page, null, mapTicket);
    }
    return paginate(q, page, TICKET_SORT[page.sort] ?? 't.created_at', mapTicket);
  }

  async findAll(filter: TicketFilter) {
    const rows = await this.applyFilter(this.base(), filter).orderBy('t.created_at', 'desc');
    return rows.map(mapTicket);
  }

  private base() {
    return this.db('tickets as t')
      .select('t.*', 'r.name as requester_name', 'a.name as assignee_name', 'c.name as category_name')
      .join('users as r', 'r.id', 't.requester_id')
      .leftJoin('users as a', 'a.id', 't.assignee_id')
      .leftJoin('categories as c', 'c.id', 't.category_id');
  }

  private applyFilter(q: ReturnType<KnexTicketRepository['base']>, f: TicketFilter) {
    if (f.q) {
      const term = f.q.replace(/^HD-0*/i, '');
      q.where((w) => {
        w.whereRaw(...likeLower('t.title', f.q!)).orWhereRaw(...likeLower('t.description', f.q!));
        if (/^\d+$/.test(term)) w.orWhere('t.number', Number(term));
      });
    }
    if (f.status?.length) q.whereIn('t.status', f.status);
    if (f.priority) q.where('t.priority', f.priority);
    if (f.categoryId) q.where('t.category_id', f.categoryId);
    if (f.assigneeId) q.where('t.assignee_id', f.assigneeId);
    if (f.unassigned) q.whereNull('t.assignee_id');
    if (f.requesterId) q.where('t.requester_id', f.requesterId);
    if (f.from) q.where('t.created_at', '>=', f.from.toISOString());
    if (f.to) q.where('t.created_at', '<=', f.to.toISOString());
    return q;
  }
}

export class KnexCommentRepository implements CommentRepository {
  constructor(private readonly db: Db) {}

  async create(comment: Comment) {
    await this.db('ticket_comments').insert(toRow({ ...comment }));
  }

  async listByTicket(ticketId: string, includeInternal: boolean): Promise<CommentWithAuthor[]> {
    const q = this.db('ticket_comments as c')
      .select('c.*', 'u.name as author_name', 'u.role as author_role')
      .join('users as u', 'u.id', 'c.author_id')
      .where('c.ticket_id', ticketId)
      .orderBy('c.created_at', 'asc');
    if (!includeInternal) q.where('c.internal', false);
    const rows = await q;
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      authorId: r.author_id,
      body: r.body,
      internal: toBool(r.internal),
      createdAt: toDate(r.created_at),
      authorName: r.author_name,
      authorRole: r.author_role as Role,
    }));
  }
}

const mapAttachment = (r: Record<string, unknown>): Attachment => ({
  id: String(r.id),
  ticketId: String(r.ticket_id),
  uploadedBy: String(r.uploaded_by),
  originalName: String(r.original_name),
  storedName: String(r.stored_name),
  mimeType: String(r.mime_type),
  sizeBytes: Number(r.size_bytes),
  createdAt: toDate(r.created_at),
});

export class KnexAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Db) {}

  async create(attachment: Attachment) {
    await this.db('ticket_attachments').insert(toRow({ ...attachment }));
  }

  async findById(id: string) {
    const row = await this.db('ticket_attachments').where({ id }).first();
    return row ? mapAttachment(row) : null;
  }

  async listByTicket(ticketId: string) {
    return (await this.db('ticket_attachments').where({ ticket_id: ticketId }).orderBy('created_at')).map(mapAttachment);
  }
}

export class KnexAuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  async record(event: Parameters<AuditRepository['record']>[0]) {
    await this.db('ticket_events').insert(toRow({ ...event }));
  }

  async listByTicket(ticketId: string): Promise<TicketEventWithActor[]> {
    const rows = await this.db('ticket_events as e')
      .select('e.*', 'u.name as actor_name')
      .leftJoin('users as u', 'u.id', 'e.actor_id')
      .where('e.ticket_id', ticketId)
      .orderBy('e.created_at', 'asc');
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      actorId: r.actor_id ?? null,
      action: r.action as AuditAction,
      fromValue: r.from_value ?? null,
      toValue: r.to_value ?? null,
      details: r.details ?? null,
      createdAt: toDate(r.created_at),
      actorName: r.actor_name ?? null,
    }));
  }
}

export class KnexSurveyRepository implements SurveyRepository {
  constructor(private readonly db: Db) {}

  async create(survey: Survey) {
    await this.db('surveys').insert(toRow({ ...survey }));
  }

  async findByTicket(ticketId: string) {
    const r = await this.db('surveys').where({ ticket_id: ticketId }).first();
    return r ? { id: r.id, ticketId: r.ticket_id, rating: Number(r.rating), comment: r.comment ?? null, createdAt: toDate(r.created_at) } : null;
  }

  async listRatings(ticketIds: string[]) {
    if (ticketIds.length === 0) return [];
    const ratings: number[] = [];
    // Se consulta por lotes para no exceder el límite de parámetros de SQLite (999).
    for (let i = 0; i < ticketIds.length; i += 500) {
      const rows = await this.db('surveys').select('rating').whereIn('ticket_id', ticketIds.slice(i, i + 500));
      ratings.push(...rows.map((r) => Number(r.rating)));
    }
    return ratings;
  }
}
