import type {
  Article,
  Attachment,
  Category,
  Comment,
  Priority,
  Role,
  SlaPolicy,
  Survey,
  Ticket,
  TicketEvent,
  TicketStatus,
  User,
} from '../../domain/entities.js';

/**
 * Puertos (interfaces) de persistencia. La capa de aplicación depende de estas
 * abstracciones y no de Knex: así los servicios se pueden probar con dobles
 * y cambiar de motor (PostgreSQL ↔ SQLite) sin tocar reglas de negocio.
 */

export interface PageRequest {
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UserFilter {
  q?: string;
  role?: Role;
  active?: boolean;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(filter: UserFilter, page: PageRequest): Promise<Page<User>>;
  listByRole(role: Role): Promise<User[]>;
  create(user: User): Promise<void>;
  update(id: string, patch: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void>;
}

export interface CategoryRepository {
  list(onlyActive: boolean): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  findByName(name: string): Promise<Category | null>;
  create(category: Category): Promise<void>;
  update(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void>;
}

export interface SlaPolicyRepository {
  list(): Promise<SlaPolicy[]>;
  findByPriority(priority: Priority): Promise<SlaPolicy | null>;
  upsert(policy: SlaPolicy): Promise<void>;
}

export interface TicketFilter {
  q?: string;
  status?: TicketStatus[];
  priority?: Priority;
  categoryId?: string;
  assigneeId?: string;
  /** Restringe a los tickets reportados por este usuario (rol "usuario"). */
  requesterId?: string;
  unassigned?: boolean;
  from?: Date;
  to?: Date;
}

export interface TicketListItem extends Ticket {
  requesterName: string;
  assigneeName: string | null;
  categoryName: string | null;
}

export interface TicketRepository {
  nextNumber(): Promise<number>;
  create(ticket: Ticket): Promise<void>;
  findById(id: string): Promise<TicketListItem | null>;
  update(id: string, patch: Partial<Omit<Ticket, 'id' | 'number' | 'createdAt'>>): Promise<void>;
  list(filter: TicketFilter, page: PageRequest): Promise<Page<TicketListItem>>;
  /** Todas las filas que cumplan el filtro, sin paginar (métricas, alertas). */
  findAll(filter: TicketFilter): Promise<TicketListItem[]>;
}

export interface CommentWithAuthor extends Comment {
  authorName: string;
  authorRole: Role;
}

export interface CommentRepository {
  create(comment: Comment): Promise<void>;
  listByTicket(ticketId: string, includeInternal: boolean): Promise<CommentWithAuthor[]>;
}

export interface AttachmentRepository {
  create(attachment: Attachment): Promise<void>;
  findById(id: string): Promise<Attachment | null>;
  listByTicket(ticketId: string): Promise<Attachment[]>;
}

export interface TicketEventWithActor extends TicketEvent {
  actorName: string | null;
}

export interface AuditRepository {
  record(event: TicketEvent): Promise<void>;
  listByTicket(ticketId: string): Promise<TicketEventWithActor[]>;
}

export interface SurveyRepository {
  create(survey: Survey): Promise<void>;
  findByTicket(ticketId: string): Promise<Survey | null>;
  listRatings(ticketIds: string[]): Promise<number[]>;
}

export interface ArticleFilter {
  q?: string;
  categoryId?: string;
  onlyPublished?: boolean;
}

export interface ArticleListItem extends Article {
  authorName: string;
  categoryName: string | null;
}

export interface ArticleRepository {
  list(filter: ArticleFilter, page: PageRequest): Promise<Page<ArticleListItem>>;
  findById(id: string): Promise<ArticleListItem | null>;
  findBySlug(slug: string): Promise<Article | null>;
  create(article: Article): Promise<void>;
  update(id: string, patch: Partial<Omit<Article, 'id' | 'createdAt'>>): Promise<void>;
  delete(id: string): Promise<void>;
  incrementViews(id: string): Promise<void>;
}

/** Conjunto de repositorios que comparten conexión (o transacción). */
export interface Repositories {
  users: UserRepository;
  categories: CategoryRepository;
  slaPolicies: SlaPolicyRepository;
  tickets: TicketRepository;
  comments: CommentRepository;
  attachments: AttachmentRepository;
  audit: AuditRepository;
  surveys: SurveyRepository;
  articles: ArticleRepository;
}

/**
 * Unidad de trabajo: agrupa varias escrituras en una transacción atómica
 * (p. ej. cambiar el estado del ticket y registrar la auditoría).
 */
export interface UnitOfWork {
  readonly repos: Repositories;
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
