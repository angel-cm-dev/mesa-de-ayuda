import { pino, type Logger } from 'pino';

/**
 * Logging estructurado en JSON (pino): cada línea es un objeto con nivel, hora,
 * requestId, etc. Es lo que esperan Loki, CloudWatch o ELK para filtrar y alertar.
 * En desarrollo se puede embellecer con `npm run dev | npx pino-pretty`.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: 'mesa-de-ayuda-api' },
    // Nunca escribir secretos en los logs.
    redact: ['req.headers.authorization', 'password', '*.password', 'passwordHash'],
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
