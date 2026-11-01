import { randomUUID } from 'node:crypto';
import { pickRoundRobin } from '../../domain/assignment.js';
import type { AuditAction, AuthUser, Priority, Ticket, TicketStatus } from '../../domain/entities.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors.js';
import { computeDeadlines, evaluateSla, isBreached, isFinal, minutesToDue, resumeAfterPause, type SlaState } from '../../domain/sla.js';
import { assertTransition, availableTransitions } from '../../domain/ticket-state-machine.js';
import type { AssignDto, ChangeStatusDto, CommentDto, CreateTicketDto, ListTicketsQuery, SurveyDto } from '../dtos/index.js';
import type { Page, Repositories, TicketFilter, TicketListItem, UnitOfWork } from '../ports/repositories.js';
import type { AppLogger, Clock, FileStorage } from '../ports/services.js';

export const OPEN_STATUSES: TicketStatus[] = ['nuevo', 'asignado', 'en_progreso', 'en_espera'];

/** Tipos MIME aceptados como adjunto: imágenes, PDF, texto y documentos de oficina comunes. */
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export interface TicketView extends TicketListItem {
  slaState: SlaState;
  minutesToDue: number;
}

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface TicketServiceOptions {
  /** Si es true, cada ticket nuevo se asigna automáticamente por round-robin. */
  autoAssignOnCreate: boolean;
}

export class TicketService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly storage: FileStorage,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
    private readonly options: TicketServiceOptions = { autoAssignOnCreate: false },
  ) {}

  // ---------------------------------------------------------------- consultas

  async list(query: ListTicketsQuery, actor: AuthUser): Promise<Page<TicketView>> {
    const { page, pageSize, sort, order, q, status, priority, categoryId, assigneeId, mine, unassigned } = query;
    const filter: TicketFilter = { q, status, priority, categoryId, assigneeId, unassigned };
    // Un usuario final solo ve lo que él reportó, sin importar los filtros que envíe.
    if (actor.role === 'usuario') filter.requesterId = actor.id;
    else if (mine) filter.assigneeId = actor.id;

    const result = await this.uow.repos.tickets.list(filter, { page, pageSize, sort, order });
    const now = this.clock.now();
    return { ...result, data: result.data.map((t) => this.toView(t, now)) };
  }

  async getDetail(id: string, actor: AuthUser) {
    const ticket = await this.findVisible(id, actor);
    const staff = actor.role !== 'usuario';
    const repos = this.uow.repos;
    const [comments, attachments, events, survey] = await Promise.all([
      repos.comments.listByTicket(id, staff),
      repos.attachments.listByTicket(id),
      repos.audit.listByTicket(id),
      repos.surveys.findByTicket(id),
    ]);
    return {
      ...this.toView(ticket, this.clock.now()),
      comments,
      attachments,
      // El historial de notas internas tampoco se muestra al usuario final.
      events: staff ? events : events.filter((e) => e.details !== 'interno'),
      survey,
      availableTransitions: availableTransitions(ticket, actor),
    };
  }

  /** Tickets abiertos cuyo SLA de resolución está en riesgo o vencido. */
  async slaAlerts(): Promise<TicketView[]> {
    const now = this.clock.now();
    const open = await this.uow.repos.tickets.findAll({ status: OPEN_STATUSES });
    return open
      .map((t) => this.toView(t, now))
      .filter((t) => t.slaState === 'en_riesgo' || t.slaState === 'incumplido')
      .sort((a, b) => a.resolutionDueAt.getTime() - b.resolutionDueAt.getTime());
  }

  // ---------------------------------------------------------------- comandos

  async create(dto: CreateTicketDto, actor: AuthUser): Promise<TicketView> {
    const repos = this.uow.repos;
    if (dto.categoryId) {
      const category = await repos.categories.findById(dto.categoryId);
      if (!category || !category.active) throw new ValidationError('La categoría no existe o está inactiva');
    }
    const policy = await repos.slaPolicies.findByPriority(dto.priority);
    if (!policy) throw new BusinessRuleError(`No hay política de SLA configurada para '${dto.priority}'`);

    const now = this.clock.now();
    const id = randomUUID();
    await this.uow.transaction(async (tx) => {
      const ticket: Ticket = {
        id,
        number: await tx.tickets.nextNumber(),
        title: dto.title,
        description: dto.description,
        status: 'nuevo',
        priority: dto.priority,
        categoryId: dto.categoryId ?? null,
        requesterId: actor.id,
        assigneeId: null,
        ...computeDeadlines(now, policy),
        firstResponseAt: null,
        slaPausedAt: null,
        slaBreached: false,
        resolvedAt: null,
        closedAt: null,
        reopenCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await tx.tickets.create(ticket);
      await this.audit(tx, id, actor.id, 'creado', null, 'nuevo', `Prioridad ${dto.priority}`);
      if (this.options.autoAssignOnCreate) {
        await this.assignInTx(tx, ticket, null, actor.id, 'round-robin');
      }
    });
    return this.getView(id);
  }

  async changeStatus(id: string, dto: ChangeStatusDto, actor: AuthUser): Promise<TicketView> {
    const ticket = await this.findVisible(id, actor);
    assertTransition(ticket, dto.status, actor);

    const now = this.clock.now();
    const patch: Partial<Ticket> = { status: dto.status, updatedAt: now };

    // Salir de "en_espera" reanuda el reloj del SLA desplazando el vencimiento.
    if (ticket.slaPausedAt && dto.status !== 'en_espera') {
      patch.resolutionDueAt = resumeAfterPause(ticket.resolutionDueAt, ticket.slaPausedAt, now);
      patch.slaPausedAt = null;
    }
    switch (dto.status) {
      case 'en_espera':
        patch.slaPausedAt = now;
        break;
      case 'en_progreso':
        if (!ticket.firstResponseAt) patch.firstResponseAt = now;
        if (ticket.status === 'resuelto') {
          // Reapertura: la solución no funcionó. Se contabiliza para medir calidad.
          patch.reopenCount = ticket.reopenCount + 1;
          patch.resolvedAt = null;
        }
        break;
      case 'resuelto':
        patch.resolvedAt = now;
        if (!ticket.firstResponseAt) patch.firstResponseAt = now;
        break;
      case 'cerrado':
        patch.closedAt = now;
        break;
      default:
        break;
    }

    await this.uow.transaction(async (tx) => {
      await tx.tickets.update(id, patch);
      await this.audit(tx, id, actor.id, 'estado_cambiado', ticket.status, dto.status, dto.note ?? null);
      if (dto.note) {
        await tx.comments.create({ id: randomUUID(), ticketId: id, authorId: actor.id, body: dto.note, internal: false, createdAt: now });
      }
    });
    return this.getView(id);
  }

  async assign(id: string, dto: AssignDto, actor: AuthUser): Promise<TicketView> {
    const ticket = await this.findVisible(id, actor);
    if (isFinal(ticket.status)) throw new BusinessRuleError('No se puede reasignar un ticket finalizado');

    if (actor.role === 'tecnico') {
      // Un técnico solo puede "tomar" tickets libres para sí mismo; reasignar es tarea del admin.
      const selfTake = dto.mode === 'manual' && dto.assigneeId === actor.id && !ticket.assigneeId;
      if (!selfTake) throw new ForbiddenError('Un técnico solo puede tomar tickets sin asignar para sí mismo');
    }

    let assigneeId: string | null = null;
    if (dto.mode === 'manual') {
      const tech = await this.uow.repos.users.findById(dto.assigneeId);
      if (!tech || tech.role !== 'tecnico' || !tech.active) {
        throw new ValidationError('El responsable debe ser un técnico activo');
      }
      assigneeId = tech.id;
    }
    await this.uow.transaction((tx) => this.assignInTx(tx, ticket, assigneeId, actor.id, dto.mode === 'auto' ? 'round-robin' : 'manual'));
    return this.getView(id);
  }

  async changePriority(id: string, priority: Priority, actor: AuthUser): Promise<TicketView> {
    const ticket = await this.findVisible(id, actor);
    if (isFinal(ticket.status)) throw new BusinessRuleError('No se puede cambiar la prioridad de un ticket finalizado');
    if (ticket.priority === priority) return this.getView(id);
    const policy = await this.uow.repos.slaPolicies.findByPriority(priority);
    if (!policy) throw new BusinessRuleError(`No hay política de SLA para '${priority}'`);

    // Si la prioridad estaba mal clasificada, el SLA debe reflejar la urgencia real:
    // los vencimientos se recalculan desde la fecha de creación con la nueva política.
    const deadlines = computeDeadlines(ticket.createdAt, policy);
    const now = this.clock.now();
    await this.uow.transaction(async (tx) => {
      await tx.tickets.update(id, { priority, ...deadlines, slaBreached: false, updatedAt: now });
      await this.audit(tx, id, actor.id, 'prioridad_cambiada', ticket.priority, priority, null);
    });
    return this.getView(id);
  }

  async addComment(id: string, dto: CommentDto, actor: AuthUser) {
    const ticket = await this.findVisible(id, actor);
    if (dto.internal && actor.role === 'usuario') throw new ForbiddenError('Solo el personal de soporte puede crear notas internas');
    if (ticket.status === 'cerrado' || ticket.status === 'cancelado') {
      throw new BusinessRuleError('No se puede comentar un ticket cerrado o cancelado');
    }
    const now = this.clock.now();
    const comment = { id: randomUUID(), ticketId: id, authorId: actor.id, body: dto.body, internal: dto.internal, createdAt: now };

    await this.uow.transaction(async (tx) => {
      await tx.comments.create(comment);
      const patch: Partial<Ticket> = { updatedAt: now };
      // La primera respuesta PÚBLICA de soporte es la que cuenta para el SLA de respuesta:
      // una nota interna no le comunica nada al usuario.
      if (actor.role !== 'usuario' && !dto.internal && !ticket.firstResponseAt) patch.firstResponseAt = now;
      await tx.tickets.update(id, patch);
      await this.audit(tx, id, actor.id, 'comentario_agregado', null, null, dto.internal ? 'interno' : 'publico');
    });
    return comment;
  }

  async addAttachment(id: string, file: UploadedFile, actor: AuthUser) {
    const ticket = await this.findVisible(id, actor);
    if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) throw new ValidationError(`Tipo de archivo no permitido: ${file.mimeType}`);
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw new ValidationError('El archivo supera el máximo de 5 MB');
    if (ticket.status === 'cerrado' || ticket.status === 'cancelado') {
      throw new BusinessRuleError('No se pueden adjuntar archivos a un ticket cerrado o cancelado');
    }
    const stored = await this.storage.save(id, file.originalName, file.buffer);
    const attachment = {
      id: randomUUID(),
      ticketId: id,
      uploadedBy: actor.id,
      originalName: file.originalName,
      storedName: stored.storedName,
      mimeType: file.mimeType,
      sizeBytes: stored.sizeBytes,
      createdAt: this.clock.now(),
    };
    await this.uow.transaction(async (tx) => {
      await tx.attachments.create(attachment);
      await this.audit(tx, id, actor.id, 'adjunto_agregado', null, file.originalName, null);
    });
    return attachment;
  }

  async getAttachment(ticketId: string, attachmentId: string, actor: AuthUser) {
    await this.findVisible(ticketId, actor);
    const attachment = await this.uow.repos.attachments.findById(attachmentId);
    if (!attachment || attachment.ticketId !== ticketId) throw new NotFoundError('Adjunto', attachmentId);
    return { attachment, path: this.storage.resolve(ticketId, attachment.storedName) };
  }

  async submitSurvey(id: string, dto: SurveyDto, actor: AuthUser) {
    const ticket = await this.findVisible(id, actor);
    if (ticket.requesterId !== actor.id) throw new ForbiddenError('Solo quien reportó el ticket puede calificar la atención');
    if (ticket.status !== 'resuelto' && ticket.status !== 'cerrado') {
      throw new BusinessRuleError('La encuesta solo está disponible cuando el ticket fue resuelto');
    }
    if (await this.uow.repos.surveys.findByTicket(id)) throw new BusinessRuleError('Este ticket ya fue calificado');

    const survey = { id: randomUUID(), ticketId: id, rating: dto.rating, comment: dto.comment ?? null, createdAt: this.clock.now() };
    await this.uow.transaction(async (tx) => {
      await tx.surveys.create(survey);
      await this.audit(tx, id, actor.id, 'encuesta_respondida', null, String(dto.rating), null);
    });
    return survey;
  }

  /**
   * Ejecutado periódicamente por el job de SLA: marca los tickets vencidos y deja
   * constancia en la auditoría. Es idempotente (solo procesa los no marcados).
   */
  async markBreaches(): Promise<number> {
    const now = this.clock.now();
    const open = await this.uow.repos.tickets.findAll({ status: OPEN_STATUSES });
    const breached = open.filter((t) => isBreached(t, now));
    for (const t of breached) {
      await this.uow.transaction(async (tx) => {
        await tx.tickets.update(t.id, { slaBreached: true });
        await this.audit(tx, t.id, null, 'sla_incumplido', null, null, `Venció ${t.resolutionDueAt.toISOString()}`);
      });
      // Simula la notificación (correo/Slack) que se enviaría al supervisor.
      this.logger.warn({ ticket: t.number, assignee: t.assigneeName, due: t.resolutionDueAt }, 'ALERTA: SLA de resolución incumplido');
    }
    return breached.length;
  }

  // ---------------------------------------------------------------- helpers

  private async assignInTx(tx: Repositories, ticket: Ticket, assigneeId: string | null, actorId: string, mode: 'manual' | 'round-robin') {
    let target = assigneeId;
    if (!target) {
      target = pickRoundRobin(await tx.users.listByRole('tecnico'));
      if (!target) throw new BusinessRuleError('No hay técnicos activos para asignar');
    }
    const now = this.clock.now();
    const patch: Partial<Ticket> = { assigneeId: target, updatedAt: now };
    if (ticket.status === 'nuevo') patch.status = 'asignado';
    await tx.tickets.update(ticket.id, patch);
    await tx.users.update(target, { lastAssignedAt: now });
    await this.audit(tx, ticket.id, actorId, 'asignado', ticket.assigneeId, target, mode);
  }

  private async findVisible(id: string, actor: AuthUser): Promise<TicketListItem> {
    const ticket = await this.uow.repos.tickets.findById(id);
    // Se responde 404 (y no 403) para no revelar la existencia de tickets ajenos.
    if (!ticket || (actor.role === 'usuario' && ticket.requesterId !== actor.id)) throw new NotFoundError('Ticket', id);
    return ticket;
  }

  private async getView(id: string): Promise<TicketView> {
    const ticket = await this.uow.repos.tickets.findById(id);
    if (!ticket) throw new NotFoundError('Ticket', id);
    return this.toView(ticket, this.clock.now());
  }

  private toView(ticket: TicketListItem, now: Date): TicketView {
    return { ...ticket, slaState: evaluateSla(ticket, now), minutesToDue: minutesToDue(ticket, now) };
  }

  private audit(tx: Repositories, ticketId: string, actorId: string | null, action: AuditAction, fromValue: string | null, toValue: string | null, details: string | null) {
    return tx.audit.record({ id: randomUUID(), ticketId, actorId, action, fromValue, toValue, details, createdAt: this.clock.now() });
  }
}
