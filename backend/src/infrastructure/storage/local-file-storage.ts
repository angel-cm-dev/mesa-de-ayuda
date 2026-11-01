import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage } from '../../application/ports/services.js';

/**
 * Almacenamiento en disco local. Detrás del puerto FileStorage, por lo que
 * migrar a S3/Azure Blob solo requiere otra implementación.
 *
 * Seguridad: el nombre físico se genera con un UUID y nunca se usa el nombre
 * enviado por el cliente para construir rutas (evita path traversal "../../").
 */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  async save(folder: string, originalName: string, content: Buffer) {
    const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    const storedName = `${randomUUID()}${ext}`;
    const dir = this.safeJoin(folder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, storedName), content);
    return { storedName, sizeBytes: content.length };
  }

  resolve(folder: string, storedName: string) {
    return path.join(this.safeJoin(folder), path.basename(storedName));
  }

  private safeJoin(folder: string) {
    const dir = path.resolve(this.root, path.basename(folder));
    if (!dir.startsWith(this.root)) throw new Error('Ruta de almacenamiento inválida');
    return dir;
  }
}
