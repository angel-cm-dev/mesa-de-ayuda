/**
 * Entidades y tipos del dominio. Son objetos planos (sin ORM) para que la lógica
 * de negocio se pueda probar sin base de datos.
 */
export const ROLES = ['admin', 'tecnico', 'usuario'] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITIES = ['baja', 'media', 'alta', 'critica'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = [
  'nuevo',
  'asignado',
  'en_progreso',
  'en_espera',
  'resuelto',
  'cerrado',
  'cancelado',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Estados en los que el ticket ya no consume SLA ni aparece en colas de trabajo. */
export const FINAL_STATUSES: readonly TicketStatus[] = ['resuelto', 'cerrado', 'cancelado'];

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  lastAssignedAt: Date | null;
  createdAt: Date;
}

export type PublicUser = Omit<User, 'passwordHash'>;

export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface SlaPolicy {
  priority: Priority;
  /** Horas para la primera respuesta de un técnico. */
  responseHours: number;
  /** Horas para resolver el ticket (descontando el tiempo "en espera"). */
  resolutionHours: number;
}

export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  categoryId: string | null;
  requesterId: string;
  assigneeId: string | null;
  responseDueAt: Date;
  resolutionDueAt: Date;
  firstResponseAt: Date | null;
  slaPausedAt: Date | null;
  slaBreached: boolean;
  resolvedAt: Date | null;
  closedAt: Date | null;
  reopenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  /** Los comentarios internos solo los ven técnicos y administradores. */
  internal: boolean;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  ticketId: string;
  uploadedBy: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export type AuditAction =
  | 'creado'
  | 'estado_cambiado'
  | 'asignado'
  | 'prioridad_cambiada'
  | 'comentario_agregado'
  | 'adjunto_agregado'
  | 'sla_incumplido'
  | 'encuesta_respondida';

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId: string | null;
  action: AuditAction;
  fromValue: string | null;
  toValue: string | null;
  details: string | null;
  createdAt: Date;
}

export interface Survey {
  id: string;
  ticketId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  categoryId: string | null;
  authorId: string;
  published: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Usuario autenticado tal como llega en el JWT. */
export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}
