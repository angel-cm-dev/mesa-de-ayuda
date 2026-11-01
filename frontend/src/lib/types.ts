// Tipos que reflejan los contratos de la API (ver backend/src/api/openapi.ts).

export type Role = 'admin' | 'tecnico' | 'usuario';
export type Priority = 'baja' | 'media' | 'alta' | 'critica';
export type TicketStatus = 'nuevo' | 'asignado' | 'en_progreso' | 'en_espera' | 'resuelto' | 'cerrado' | 'cancelado';
export type SlaState = 'a_tiempo' | 'en_riesgo' | 'incumplido' | 'cumplido' | 'pausado';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface SlaPolicy {
  priority: Priority;
  responseHours: number;
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
  categoryName: string | null;
  requesterId: string;
  requesterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  responseDueAt: string;
  resolutionDueAt: string;
  firstResponseAt: string | null;
  slaPausedAt: string | null;
  slaBreached: boolean;
  slaState: SlaState;
  minutesToDue: number;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  body: string;
  internal: boolean;
  authorId: string;
  authorName: string;
  authorRole: Role;
  createdAt: string;
}

export interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  details: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  comments: Comment[];
  attachments: Attachment[];
  events: TicketEvent[];
  survey: { rating: number; comment: string | null } | null;
  availableTransitions: TicketStatus[];
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  categoryId: string | null;
  categoryName: string | null;
  authorName: string;
  published: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface Metrics {
  totalTickets: number;
  openTickets: number;
  mttrHours: number | null;
  slaCompliancePct: number | null;
  firstResponseCompliancePct: number | null;
  breachedOpen: number;
  atRiskOpen: number;
  csatAvg: number | null;
  csatResponses: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<Priority, number>;
  byAssignee: Array<{ assigneeId: string; open: number; resolved: number }>;
  assigneeNames: Record<string, string>;
}
