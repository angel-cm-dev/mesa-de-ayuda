import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { PasswordHasher } from '../../application/ports/services.js';
import type { Category, Priority, SlaPolicy, Ticket, TicketStatus, User } from '../../domain/entities.js';
import { computeDeadlines } from '../../domain/sla.js';
import { createRepositories } from '../repositories/unit-of-work.js';

/** Políticas de SLA por defecto (horas calendario). Referenciales y editables desde la UI. */
export const DEFAULT_SLA: SlaPolicy[] = [
  { priority: 'critica', responseHours: 1, resolutionHours: 4 },
  { priority: 'alta', responseHours: 4, resolutionHours: 8 },
  { priority: 'media', responseHours: 8, resolutionHours: 24 },
  { priority: 'baja', responseHours: 24, resolutionHours: 72 },
];

export const DEMO_PASSWORD = 'Demo123!';

const HOUR = 3_600_000;

/**
 * Datos de ejemplo 100 % ficticios. Es idempotente: si ya existen usuarios no hace nada,
 * por lo que es seguro ejecutarlo en cada arranque del contenedor.
 */
export async function seedDemoData(db: Knex, hasher: PasswordHasher, now = new Date()): Promise<boolean> {
  const existing = (await db('users').count({ n: '*' }).first()) as { n: number | string };
  if (Number(existing.n) > 0) return false;

  await db.transaction(async (trx) => {
    const repos = createRepositories(trx);
    const hash = await hasher.hash(DEMO_PASSWORD);
    const mkUser = (name: string, email: string, role: User['role'], lastAssignedAt: Date | null = null): User => ({
      id: randomUUID(),
      name,
      email,
      passwordHash: hash,
      role,
      active: true,
      lastAssignedAt,
      createdAt: new Date(now.getTime() - 30 * 24 * HOUR),
    });

    const admin = mkUser('Administrador Demo', 'admin@demo.pe', 'admin');
    const tec1 = mkUser('Carla Quispe', 'tecnico1@demo.pe', 'tecnico', new Date(now.getTime() - 2 * HOUR));
    const tec2 = mkUser('Jorge Ramos', 'tecnico2@demo.pe', 'tecnico', new Date(now.getTime() - 5 * HOUR));
    const user1 = mkUser('Lucía Torres', 'usuario@demo.pe', 'usuario');
    const user2 = mkUser('Martín Salazar', 'usuario2@demo.pe', 'usuario');
    for (const u of [admin, tec1, tec2, user1, user2]) await repos.users.create(u);

    for (const p of DEFAULT_SLA) await repos.slaPolicies.upsert(p);

    const cat = (name: string, description: string): Category => ({ id: randomUUID(), name, description, active: true });
    const categories = {
      hardware: cat('Hardware', 'Laptops, impresoras, periféricos'),
      software: cat('Software', 'Instalación y errores de aplicaciones'),
      redes: cat('Redes y VPN', 'Conectividad, Wi-Fi y acceso remoto'),
      accesos: cat('Accesos y cuentas', 'Altas, bajas y restablecimiento de contraseñas'),
      correo: cat('Correo electrónico', 'Buzones, listas y calendario'),
    };
    for (const c of Object.values(categories)) await repos.categories.create(c);

    let number = 0;
    const mkTicket = async (
      title: string,
      description: string,
      priority: Priority,
      status: TicketStatus,
      hoursAgo: number,
      opts: { category: Category; requester: User; assignee?: User; resolvedAfterH?: number; rating?: number },
    ) => {
      const createdAt = new Date(now.getTime() - hoursAgo * HOUR);
      const policy = DEFAULT_SLA.find((p) => p.priority === priority)!;
      const deadlines = computeDeadlines(createdAt, policy);
      const resolvedAt = opts.resolvedAfterH !== undefined ? new Date(createdAt.getTime() + opts.resolvedAfterH * HOUR) : null;
      const ticket: Ticket = {
        id: randomUUID(),
        number: ++number,
        title,
        description,
        status,
        priority,
        categoryId: opts.category.id,
        requesterId: opts.requester.id,
        assigneeId: opts.assignee?.id ?? null,
        ...deadlines,
        firstResponseAt: opts.assignee && status !== 'asignado' ? new Date(createdAt.getTime() + 0.5 * HOUR) : null,
        slaPausedAt: status === 'en_espera' ? new Date(now.getTime() - 1 * HOUR) : null,
        slaBreached: false,
        resolvedAt,
        closedAt: status === 'cerrado' && resolvedAt ? new Date(resolvedAt.getTime() + 2 * HOUR) : null,
        reopenCount: 0,
        createdAt,
        updatedAt: resolvedAt ?? createdAt,
      };
      await repos.tickets.create(ticket);
      await repos.audit.record({ id: randomUUID(), ticketId: ticket.id, actorId: opts.requester.id, action: 'creado', fromValue: null, toValue: 'nuevo', details: `Prioridad ${priority}`, createdAt });
      if (opts.assignee) {
        await repos.audit.record({ id: randomUUID(), ticketId: ticket.id, actorId: admin.id, action: 'asignado', fromValue: null, toValue: opts.assignee.id, details: 'round-robin', createdAt: new Date(createdAt.getTime() + 0.2 * HOUR) });
        await repos.comments.create({ id: randomUUID(), ticketId: ticket.id, authorId: opts.assignee.id, body: 'Hola, ya estoy revisando tu caso. Te mantendré informado.', internal: false, createdAt: new Date(createdAt.getTime() + 0.5 * HOUR) });
      }
      if (status !== 'nuevo' && status !== 'asignado') {
        await repos.audit.record({ id: randomUUID(), ticketId: ticket.id, actorId: opts.assignee?.id ?? admin.id, action: 'estado_cambiado', fromValue: 'asignado', toValue: status, details: null, createdAt: resolvedAt ?? new Date(createdAt.getTime() + 0.6 * HOUR) });
      }
      if (opts.rating && resolvedAt) {
        await repos.surveys.create({ id: randomUUID(), ticketId: ticket.id, rating: opts.rating, comment: opts.rating >= 4 ? 'Atención rápida y clara.' : 'Tardó más de lo esperado.', createdAt: new Date(resolvedAt.getTime() + HOUR) });
      }
      return ticket;
    };

    const c = categories;
    await mkTicket('No enciende la laptop del área de ventas', 'La laptop Lenovo asignada no enciende desde esta mañana, el LED de carga parpadea.', 'alta', 'cerrado', 240, { category: c.hardware, requester: user1, assignee: tec1, resolvedAfterH: 6, rating: 5 });
    await mkTicket('Restablecer contraseña de ERP', 'Bloqueé mi usuario del ERP por intentos fallidos, necesito restablecerlo.', 'media', 'cerrado', 200, { category: c.accesos, requester: user2, assignee: tec2, resolvedAfterH: 2, rating: 4 });
    await mkTicket('VPN se desconecta cada 10 minutos', 'Trabajando desde casa, la VPN corporativa se cae constantemente y pierdo la sesión.', 'alta', 'resuelto', 120, { category: c.redes, requester: user1, assignee: tec2, resolvedAfterH: 12, rating: 2 });
    await mkTicket('Instalar Power BI Desktop', 'Necesito Power BI Desktop para el reporte mensual de indicadores.', 'baja', 'cerrado', 150, { category: c.software, requester: user2, assignee: tec1, resolvedAfterH: 20, rating: 5 });
    await mkTicket('Impresora del 3er piso atasca papel', 'La impresora HP del tercer piso atasca hojas en la bandeja 2.', 'media', 'en_progreso', 20, { category: c.hardware, requester: user2, assignee: tec1 });
    await mkTicket('Caída del servidor de archivos', 'Nadie en contabilidad puede acceder a la unidad compartida \\\\fs01\\contabilidad.', 'critica', 'en_progreso', 3.5, { category: c.redes, requester: user1, assignee: tec2 });
    await mkTicket('Correo no sincroniza en el celular', 'Desde ayer el correo corporativo no se sincroniza en mi teléfono Android.', 'media', 'en_espera', 10, { category: c.correo, requester: user1, assignee: tec1 });
    await mkTicket('Alta de usuario para practicante', 'Ingresa un practicante el lunes, requiere correo y acceso al sistema de ventas.', 'media', 'asignado', 4, { category: c.accesos, requester: user2, assignee: tec2 });
    await mkTicket('Excel se cierra al abrir macros', 'Al abrir el archivo de presupuesto con macros, Excel se cierra sin mensaje.', 'baja', 'nuevo', 2, { category: c.software, requester: user1 });
    await mkTicket('Monitor con líneas verticales', 'El monitor secundario muestra líneas verticales de colores.', 'baja', 'nuevo', 30, { category: c.hardware, requester: user2 });
    await mkTicket('Lentitud general de la red Wi-Fi', 'La red Wi-Fi de la sala de reuniones está muy lenta en las tardes.', 'alta', 'nuevo', 9, { category: c.redes, requester: user1 });
    await mkTicket('Solicitud cancelada de prueba', 'Ticket creado por error, se cancela.', 'baja', 'cancelado', 48, { category: c.software, requester: user1 });

    const article = (title: string, slug: string, content: string, category: Category, views: number) =>
      repos.articles.create({ id: randomUUID(), title, slug, content, categoryId: category.id, authorId: tec1.id, published: true, views, createdAt: new Date(now.getTime() - 15 * 24 * HOUR), updatedAt: new Date(now.getTime() - 15 * 24 * HOUR) });
    await article('Cómo restablecer tu contraseña', 'como-restablecer-tu-contrasena', '1. Ingresa al portal de autoservicio.\n2. Haz clic en "Olvidé mi contraseña".\n3. Revisa tu correo alterno y sigue el enlace.\n\nSi no recibes el correo en 10 minutos, abre un ticket en la categoría "Accesos y cuentas".', c.accesos, 42);
    await article('Configurar la VPN en Windows', 'configurar-la-vpn-en-windows', 'Descarga el cliente VPN desde el portal interno, instala con permisos de administrador e ingresa el servidor vpn.empresa-demo.pe. Usa tu usuario de red sin el dominio.', c.redes, 31);
    await article('Agregar el correo corporativo en Android', 'agregar-el-correo-corporativo-en-android', 'Abre la app de Outlook, elige "Agregar cuenta", ingresa tu correo corporativo y acepta la política de seguridad del dispositivo.', c.correo, 18);
    await repos.articles.create({ id: randomUUID(), title: 'Borrador: política de equipos personales', slug: 'borrador-politica-de-equipos-personales', content: 'Documento en revisión por el área de seguridad de la información.', categoryId: c.hardware.id, authorId: admin.id, published: false, views: 0, createdAt: now, updatedAt: now });
  });
  return true;
}
