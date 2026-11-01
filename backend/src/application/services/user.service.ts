import { randomUUID } from 'node:crypto';
import type { PublicUser, User } from '../../domain/entities.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../domain/errors.js';
import type { CreateUserDto, ListUsersQuery, UpdateUserDto } from '../dtos/index.js';
import type { Page, UnitOfWork } from '../ports/repositories.js';
import type { Clock, PasswordHasher } from '../ports/services.js';
import { toPublicUser } from './auth.service.js';

export class UserService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async list(query: ListUsersQuery): Promise<Page<PublicUser>> {
    const { q, role, active, page, pageSize, sort, order } = query;
    const result = await this.uow.repos.users.list({ q, role, active }, { page, pageSize, sort, order });
    return { ...result, data: result.data.map(toPublicUser) };
  }

  /** Lista mínima de técnicos activos para combos de asignación. */
  async technicians(): Promise<Array<Pick<User, 'id' | 'name' | 'email'>>> {
    const techs = await this.uow.repos.users.listByRole('tecnico');
    return techs.filter((t) => t.active).map(({ id, name, email }) => ({ id, name, email }));
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    if (await this.uow.repos.users.findByEmail(dto.email)) {
      throw new ConflictError('Ya existe una cuenta con ese correo');
    }
    const user: User = {
      id: randomUUID(),
      name: dto.name,
      email: dto.email,
      role: dto.role,
      passwordHash: await this.hasher.hash(dto.password),
      active: true,
      lastAssignedAt: null,
      createdAt: this.clock.now(),
    };
    await this.uow.repos.users.create(user);
    return toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<PublicUser> {
    const user = await this.uow.repos.users.findById(id);
    if (!user) throw new NotFoundError('Usuario', id);
    // Evita que un admin se quite a sí mismo el acceso y deje el sistema sin administrador.
    if (id === actorId && (dto.active === false || (dto.role && dto.role !== 'admin'))) {
      throw new BusinessRuleError('No puedes desactivarte ni quitarte el rol de administrador');
    }
    const { password, ...rest } = dto;
    const patch: Partial<User> = { ...rest };
    if (password) patch.passwordHash = await this.hasher.hash(password);
    await this.uow.repos.users.update(id, patch);
    return toPublicUser({ ...user, ...patch });
  }
}
