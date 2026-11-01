import { randomUUID } from 'node:crypto';
import type { Category, Priority, SlaPolicy } from '../../domain/entities.js';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { CategoryDto, SlaPolicyDto } from '../dtos/index.js';
import type { UnitOfWork } from '../ports/repositories.js';

/** Catálogos de configuración: categorías y políticas de SLA por prioridad. */
export class CatalogService {
  constructor(private readonly uow: UnitOfWork) {}

  listCategories(onlyActive: boolean): Promise<Category[]> {
    return this.uow.repos.categories.list(onlyActive);
  }

  async createCategory(dto: CategoryDto): Promise<Category> {
    if (await this.uow.repos.categories.findByName(dto.name)) {
      throw new ConflictError(`La categoría '${dto.name}' ya existe`);
    }
    const category: Category = {
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? null,
      active: dto.active ?? true,
    };
    await this.uow.repos.categories.create(category);
    return category;
  }

  async updateCategory(id: string, dto: CategoryDto): Promise<Category> {
    const current = await this.uow.repos.categories.findById(id);
    if (!current) throw new NotFoundError('Categoría', id);
    const duplicate = await this.uow.repos.categories.findByName(dto.name);
    if (duplicate && duplicate.id !== id) throw new ConflictError(`La categoría '${dto.name}' ya existe`);
    const patch = { name: dto.name, description: dto.description ?? null, active: dto.active ?? current.active };
    await this.uow.repos.categories.update(id, patch);
    return { ...current, ...patch };
  }

  listSlaPolicies(): Promise<SlaPolicy[]> {
    return this.uow.repos.slaPolicies.list();
  }

  /**
   * Cambiar una política afecta solo a tickets nuevos: los existentes conservan
   * el vencimiento con el que fueron creados (lo pactado al momento del reporte).
   */
  async updateSlaPolicy(priority: Priority, dto: SlaPolicyDto): Promise<SlaPolicy> {
    const policy: SlaPolicy = { priority, ...dto };
    await this.uow.repos.slaPolicies.upsert(policy);
    return policy;
  }
}
