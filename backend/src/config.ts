import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuración tipada y validada al arrancar: si falta una variable crítica
 * la API falla de inmediato con un mensaje claro ("fail fast"), en lugar de
 * romperse más tarde en mitad de una petición.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_CLIENT: z.enum(['pg', 'sqlite']).default('pg'),
  DATABASE_URL: z.string().default('postgres://helpdesk:helpdesk@localhost:5432/helpdesk'),
  SQLITE_FILENAME: z.string().default(':memory:'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  SEED_DEMO: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  AUTO_ASSIGN_ON_CREATE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SLA_MONITOR_INTERVAL_MS: z.coerce.number().int().min(0).default(60_000),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }
  return parsed.data;
}
