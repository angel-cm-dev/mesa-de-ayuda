import type {
  CategoryRepository,
  Page,
  PageRequest,
  SlaPolicyRepository,
  UserFilter,
  UserRepository,
} from '../../application/ports/repositories.js';
import type { Category, Priority, Role, SlaPolicy, User } from '../../domain/entities.js';
import { type Db, likeLower, paginate, toBool, toDate, toDateOrNull, toRow } from './helpers.js';

const mapUser = (r: Record<string, unknown>): User => ({
  id: String(r.id),
  name: String(r.name),
  email: String(r.email),
  passwordHash: String(r.password_hash),
  role: r.role as Role,
  active: toBool(r.active),
  lastAssignedAt: toDateOrNull(r.last_assigned_at),
  createdAt: toDate(r.created_at),
});

const USER_SORT: Record<string, string> = { name: 'name', email: 'email', role: 'role', createdAt: 'created_at' };

export class KnexUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const row = await this.db('users').where({ id }).first();
    return row ? mapUser(row) : null;
  }

  async findByEmail(email: string) {
    const row = await this.db('users').where({ email: email.toLowerCase() }).first();
    return row ? mapUser(row) : null;
  }

  list(filter: UserFilter, page: PageRequest): Promise<Page<User>> {
    const q = this.db('users').select('*');
    if (filter.q) {
      const term = filter.q;
      q.where((w) => {
        w.whereRaw(...likeLower('name', term)).orWhereRaw(...likeLower('email', term));
      });
    }
    if (filter.role) q.where('role', filter.role);
    if (filter.active !== undefined) q.where('active', filter.active);
    return paginate(q, page, USER_SORT[page.sort] ?? 'name', mapUser);
  }

  async listByRole(role: Role) {
    const rows = await this.db('users').where({ role }).orderBy('name');
    return rows.map(mapUser);
  }

  async create(user: User) {
    await this.db('users').insert(toRow({ ...user }));
  }

  async update(id: string, patch: Partial<User>) {
    await this.db('users').where({ id }).update(toRow(patch));
  }
}

const mapCategory = (r: Record<string, unknown>): Category => ({
  id: String(r.id),
  name: String(r.name),
  description: (r.description as string | null) ?? null,
  active: toBool(r.active),
});

export class KnexCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Db) {}

  async list(onlyActive: boolean) {
    const q = this.db('categories').orderBy('name');
    if (onlyActive) q.where('active', true);
    return (await q).map(mapCategory);
  }

  async findById(id: string) {
    const row = await this.db('categories').where({ id }).first();
    return row ? mapCategory(row) : null;
  }

  async findByName(name: string) {
    const row = await this.db('categories').whereRaw('lower(name) = ?', [name.toLowerCase()]).first();
    return row ? mapCategory(row) : null;
  }

  async create(category: Category) {
    await this.db('categories').insert(toRow({ ...category }));
  }

  async update(id: string, patch: Partial<Category>) {
    await this.db('categories').where({ id }).update(toRow(patch));
  }
}

const mapPolicy = (r: Record<string, unknown>): SlaPolicy => ({
  priority: r.priority as Priority,
  responseHours: Number(r.response_hours),
  resolutionHours: Number(r.resolution_hours),
});

const PRIORITY_ORDER: Priority[] = ['critica', 'alta', 'media', 'baja'];

export class KnexSlaPolicyRepository implements SlaPolicyRepository {
  constructor(private readonly db: Db) {}

  async list() {
    const rows = (await this.db('sla_policies')).map(mapPolicy);
    return rows.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  }

  async findByPriority(priority: Priority) {
    const row = await this.db('sla_policies').where({ priority }).first();
    return row ? mapPolicy(row) : null;
  }

  async upsert(policy: SlaPolicy) {
    await this.db('sla_policies').insert(toRow({ ...policy })).onConflict('priority').merge();
  }
}
