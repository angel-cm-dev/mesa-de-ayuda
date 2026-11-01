/**
 * CLI de base de datos:
 *   npm run db:migrate   → aplica migraciones pendientes
 *   npm run db:seed      → migra y carga datos demo (si la base está vacía)
 */
import { loadConfig } from '../../config.js';
import { BcryptPasswordHasher } from '../security/security.js';
import { createKnex, migrateLatest } from './knex.js';
import { seedDemoData } from './seed.js';

const command = process.argv[2];
const config = loadConfig();
const db = createKnex(config);

try {
  await migrateLatest(db);
  console.log('Migraciones aplicadas');
  if (command === 'seed') {
    const seeded = await seedDemoData(db, new BcryptPasswordHasher(config.BCRYPT_ROUNDS));
    console.log(seeded ? 'Datos demo cargados' : 'La base ya tenía datos: seed omitido');
  }
} finally {
  await db.destroy();
}
