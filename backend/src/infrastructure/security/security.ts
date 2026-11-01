import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { PasswordHasher, TokenService } from '../../application/ports/services.js';
import { ROLES, type AuthUser, type Role } from '../../domain/entities.js';
import { UnauthorizedError } from '../../domain/errors.js';

/**
 * bcrypt con costo configurable (12 por defecto ≈ 250 ms por hash): suficientemente
 * lento para frenar ataques de fuerza bruta offline y con sal única por contraseña.
 * En pruebas se usa costo 4 para que la suite sea rápida.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds: number) {}

  hash(plain: string) {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }
}

interface Claims {
  sub: string;
  role: Role;
  name: string;
  email: string;
}

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(user: AuthUser): string {
    const claims: Claims = { sub: user.id, role: user.role, name: user.name, email: user.email };
    // Se fija el algoritmo para evitar ataques de "alg confusion".
    return jwt.sign(claims, this.secret, { algorithm: 'HS256', expiresIn: this.expiresIn as SignOptions['expiresIn'] });
  }

  verify(token: string): AuthUser {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as Claims;
      if (!ROLES.includes(payload.role)) throw new Error('rol inválido');
      return { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }
}
