import { randomUUID } from 'node:crypto';
import type { AuthUser, PublicUser, User } from '../../domain/entities.js';
import { ConflictError, UnauthorizedError } from '../../domain/errors.js';
import type { LoginDto, RegisterDto } from '../dtos/index.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { Clock, PasswordHasher, TokenService } from '../ports/services.js';

export function toPublicUser(user: User): PublicUser {
  // Nunca se expone el hash, ni siquiera a administradores.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export class AuthService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    const user = await this.uow.repos.users.findByEmail(dto.email);
    // Mismo mensaje para "no existe" y "clave incorrecta": evita enumerar correos registrados.
    const valid = user ? await this.hasher.verify(dto.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedError('Correo o contraseña incorrectos');
    if (!user.active) throw new UnauthorizedError('La cuenta está desactivada');

    return { token: this.tokens.sign(toAuthUser(user)), user: toPublicUser(user) };
  }

  /** Autoregistro: siempre crea rol "usuario"; los roles elevados solo los asigna un admin. */
  async register(dto: RegisterDto): Promise<{ token: string; user: PublicUser }> {
    if (await this.uow.repos.users.findByEmail(dto.email)) {
      throw new ConflictError('Ya existe una cuenta con ese correo');
    }
    const user: User = {
      id: randomUUID(),
      name: dto.name,
      email: dto.email,
      passwordHash: await this.hasher.hash(dto.password),
      role: 'usuario',
      active: true,
      lastAssignedAt: null,
      createdAt: this.clock.now(),
    };
    await this.uow.repos.users.create(user);
    return { token: this.tokens.sign(toAuthUser(user)), user: toPublicUser(user) };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.uow.repos.users.findById(userId);
    if (!user || !user.active) throw new UnauthorizedError('La sesión ya no es válida');
    return toPublicUser(user);
  }
}
