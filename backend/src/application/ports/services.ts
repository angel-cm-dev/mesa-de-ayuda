import type { AuthUser } from '../../domain/entities.js';

/** Puertos hacia servicios técnicos (seguridad, archivos, tiempo). */

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  sign(user: AuthUser): string;
  verify(token: string): AuthUser;
}

export interface StoredFile {
  storedName: string;
  sizeBytes: number;
}

export interface FileStorage {
  save(folder: string, originalName: string, content: Buffer): Promise<StoredFile>;
  /** Ruta absoluta para servir el archivo. */
  resolve(folder: string, storedName: string): string;
}

/** Reloj inyectable: permite probar vencimientos de SLA sin esperar horas reales. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface AppLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}
