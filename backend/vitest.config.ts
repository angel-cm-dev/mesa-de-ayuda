import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Cada archivo de pruebas crea su propia base SQLite en memoria: no hay estado compartido.
    pool: 'forks',
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'secreto-solo-para-pruebas-con-32-caracteres',
    },
  },
});
