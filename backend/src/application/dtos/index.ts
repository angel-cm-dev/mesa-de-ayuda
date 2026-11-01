import { z } from 'zod';
import { PRIORITIES, ROLES, TICKET_STATUSES } from '../../domain/entities.js';

/**
 * DTOs de entrada validados con Zod. Cada esquema es a la vez validación en
 * tiempo de ejecución y tipo TypeScript (z.infer), evitando que ambos diverjan.
 */

const pagination = <S extends readonly [string, ...string[]]>(sortable: S, defaultSort: S[number]) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sort: z.enum(sortable).default(defaultSort),
    order: z.enum(['asc', 'desc']).default('desc'),
  });

const boolFromQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(z.enum(values)).optional());

const password = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'Máximo 72 caracteres (límite de bcrypt)')
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[0-9]/, 'Debe incluir un número');

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(120),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password,
});
export type RegisterDto = z.infer<typeof registerSchema>;

// ---------- Usuarios ----------
export const createUserSchema = registerSchema.extend({ role: z.enum(ROLES) });
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    role: z.enum(ROLES),
    active: z.boolean(),
    password,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Envía al menos un campo');
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const listUsersSchema = pagination(['name', 'email', 'role', 'createdAt'] as const, 'name').extend({
  q: z.string().trim().optional(),
  role: z.enum(ROLES).optional(),
  active: boolFromQuery,
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListUsersQuery = z.infer<typeof listUsersSchema>;

// ---------- Catálogos ----------
export const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullish(),
  active: z.boolean().optional(),
});
export type CategoryDto = z.infer<typeof categorySchema>;

export const slaPolicySchema = z
  .object({
    responseHours: z.number().positive().max(720),
    resolutionHours: z.number().positive().max(2160),
  })
  .refine((p) => p.resolutionHours >= p.responseHours, {
    message: 'El tiempo de resolución no puede ser menor que el de respuesta',
    path: ['resolutionHours'],
  });
export type SlaPolicyDto = z.infer<typeof slaPolicySchema>;

// ---------- Tickets ----------
export const createTicketSchema = z.object({
  title: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres').max(150),
  description: z.string().trim().min(10, 'Describe el problema con al menos 10 caracteres').max(5000),
  priority: z.enum(PRIORITIES).default('media'),
  categoryId: z.string().uuid().nullish(),
});
export type CreateTicketDto = z.infer<typeof createTicketSchema>;

export const listTicketsSchema = pagination(
  ['number', 'createdAt', 'updatedAt', 'priority', 'status', 'resolutionDueAt', 'title'] as const,
  'createdAt',
).extend({
  q: z.string().trim().optional(),
  status: csvEnum(TICKET_STATUSES),
  priority: z.enum(PRIORITIES).optional(),
  categoryId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  mine: boolFromQuery,
  unassigned: boolFromQuery,
});
export type ListTicketsQuery = z.infer<typeof listTicketsSchema>;

export const changeStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(2000).optional(),
});
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;

export const assignSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('manual'), assigneeId: z.string().uuid() }),
  z.object({ mode: z.literal('auto') }),
]);
export type AssignDto = z.infer<typeof assignSchema>;

export const changePrioritySchema = z.object({ priority: z.enum(PRIORITIES) });

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'El comentario no puede estar vacío').max(5000),
  internal: z.boolean().default(false),
});
export type CommentDto = z.infer<typeof commentSchema>;

export const surveySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullish(),
});
export type SurveyDto = z.infer<typeof surveySchema>;

// ---------- Base de conocimiento ----------
export const articleSchema = z.object({
  title: z.string().trim().min(5).max(150),
  content: z.string().trim().min(20, 'El contenido debe tener al menos 20 caracteres'),
  categoryId: z.string().uuid().nullish(),
  published: z.boolean().default(false),
});
export type ArticleDto = z.infer<typeof articleSchema>;

export const listArticlesSchema = pagination(['title', 'createdAt', 'views'] as const, 'createdAt').extend({
  q: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
});
export type ListArticlesQuery = z.infer<typeof listArticlesSchema>;

// ---------- Métricas ----------
export const metricsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
