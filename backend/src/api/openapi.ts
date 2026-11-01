/**
 * Especificación OpenAPI 3.0 de la API (servida en /api/docs y /api/openapi.json).
 * Se mantiene a mano y compacta con helpers; los DTOs de Zod son la validación real.
 */
type Schema = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
const problem = (description: string) => ({ description, ...{ content: { 'application/problem+json': { schema: ref('Problem') } } } });
const ok = (schema: Schema, description = 'OK') => ({ description, ...json(schema) });
const idPath = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const q = (name: string, schema: Schema, description?: string) => ({ name, in: 'query', required: false, schema, description });
const pageParams = [q('page', { type: 'integer', minimum: 1, default: 1 }), q('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 10 }), q('order', { type: 'string', enum: ['asc', 'desc'] })];
const errors = { 400: problem('Validación fallida'), 401: problem('No autenticado'), 403: problem('Rol sin permiso') };
const paged = (item: string) => ({
  type: 'object',
  properties: { data: { type: 'array', items: ref(item) }, meta: ref('PageMeta') },
});

const priority = { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] };
const status = { type: 'string', enum: ['nuevo', 'asignado', 'en_progreso', 'en_espera', 'resuelto', 'cerrado', 'cancelado'] };
const role = { type: 'string', enum: ['admin', 'tecnico', 'usuario'] };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Mesa de Ayuda API',
    version: '1.0.0',
    description:
      'API REST de Help Desk: tickets con máquina de estados, SLA por prioridad, asignación round-robin, comentarios internos, adjuntos, auditoría, base de conocimiento, encuestas y métricas.\n\nCredencial demo: `admin@demo.pe` / `Demo123!`. Usa **POST /api/auth/login** y pega el token en "Authorize".',
    contact: { name: 'Angel Castañeda Meza', url: 'https://github.com/angel-cm-dev' },
    license: { name: 'MIT' },
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Auth' }, { name: 'Usuarios' }, { name: 'Catálogos' }, { name: 'Tickets' }, { name: 'Base de conocimiento' }, { name: 'Métricas' }, { name: 'Sistema' },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': { get: { tags: ['Sistema'], security: [], summary: 'Estado de la API y la base de datos', responses: { 200: ok({ type: 'object' }), 503: ok({ type: 'object' }, 'Base de datos no disponible') } } },
    '/api/auth/login': { post: { tags: ['Auth'], security: [], summary: 'Iniciar sesión', requestBody: json(ref('LoginRequest')), responses: { 200: ok(ref('AuthResponse')), 400: errors[400], 401: errors[401], 429: problem('Demasiados intentos') } } },
    '/api/auth/register': { post: { tags: ['Auth'], security: [], summary: 'Autoregistro (rol usuario)', requestBody: json(ref('RegisterRequest')), responses: { 201: ok(ref('AuthResponse')), 400: errors[400], 409: problem('Correo ya registrado') } } },
    '/api/auth/me': { get: { tags: ['Auth'], summary: 'Usuario autenticado', responses: { 200: ok(ref('User')), 401: errors[401] } } },
    '/api/users': {
      get: { tags: ['Usuarios'], summary: 'Listar usuarios (admin)', parameters: [...pageParams, q('q', { type: 'string' }), q('role', role), q('active', { type: 'boolean' }), q('sort', { type: 'string', enum: ['name', 'email', 'role', 'createdAt'] })], responses: { 200: ok(paged('User')), ...errors } },
      post: { tags: ['Usuarios'], summary: 'Crear usuario (admin)', requestBody: json(ref('CreateUserRequest')), responses: { 201: ok(ref('User')), ...errors, 409: problem('Correo duplicado') } },
    },
    '/api/users/technicians': { get: { tags: ['Usuarios'], summary: 'Técnicos activos (admin, tecnico)', responses: { 200: ok({ type: 'array', items: ref('UserRef') }) } } },
    '/api/users/{id}': { patch: { tags: ['Usuarios'], summary: 'Actualizar usuario (admin)', parameters: [idPath()], requestBody: json({ type: 'object', properties: { name: { type: 'string' }, role, active: { type: 'boolean' }, password: { type: 'string' } } }), responses: { 200: ok(ref('User')), ...errors, 404: problem('No existe') } } },
    '/api/categories': {
      get: { tags: ['Catálogos'], summary: 'Listar categorías', parameters: [q('all', { type: 'boolean' }, 'Incluir inactivas (solo admin)')], responses: { 200: ok({ type: 'array', items: ref('Category') }) } },
      post: { tags: ['Catálogos'], summary: 'Crear categoría (admin)', requestBody: json(ref('CategoryRequest')), responses: { 201: ok(ref('Category')), ...errors } },
    },
    '/api/categories/{id}': { put: { tags: ['Catálogos'], summary: 'Editar categoría (admin)', parameters: [idPath()], requestBody: json(ref('CategoryRequest')), responses: { 200: ok(ref('Category')), ...errors } } },
    '/api/sla-policies': { get: { tags: ['Catálogos'], summary: 'Políticas de SLA por prioridad', responses: { 200: ok({ type: 'array', items: ref('SlaPolicy') }) } } },
    '/api/sla-policies/{priority}': { put: { tags: ['Catálogos'], summary: 'Editar política de SLA (admin)', parameters: [{ name: 'priority', in: 'path', required: true, schema: priority }], requestBody: json({ type: 'object', required: ['responseHours', 'resolutionHours'], properties: { responseHours: { type: 'number' }, resolutionHours: { type: 'number' } } }), responses: { 200: ok(ref('SlaPolicy')), ...errors } } },
    '/api/tickets': {
      get: {
        tags: ['Tickets'],
        summary: 'Listar tickets (el rol usuario solo ve los suyos)',
        parameters: [...pageParams, q('q', { type: 'string' }, 'Busca en título, descripción o número (HD-0005)'), q('status', { type: 'string' }, 'Uno o varios separados por coma'), q('priority', priority), q('categoryId', { type: 'string', format: 'uuid' }), q('assigneeId', { type: 'string', format: 'uuid' }), q('mine', { type: 'boolean' }), q('unassigned', { type: 'boolean' }), q('sort', { type: 'string', enum: ['number', 'createdAt', 'updatedAt', 'priority', 'status', 'resolutionDueAt', 'title'] })],
        responses: { 200: ok(paged('Ticket')), ...errors },
      },
      post: { tags: ['Tickets'], summary: 'Crear ticket (calcula vencimientos de SLA)', requestBody: json(ref('CreateTicketRequest')), responses: { 201: ok(ref('Ticket')), ...errors } },
    },
    '/api/tickets/sla-alerts': { get: { tags: ['Tickets'], summary: 'Tickets abiertos en riesgo o con SLA vencido (admin, tecnico)', responses: { 200: ok({ type: 'array', items: ref('Ticket') }) } } },
    '/api/tickets/{id}': { get: { tags: ['Tickets'], summary: 'Detalle con comentarios, adjuntos, historial y transiciones disponibles', parameters: [idPath()], responses: { 200: ok(ref('TicketDetail')), 404: problem('No existe o no es visible') } } },
    '/api/tickets/{id}/status': { patch: { tags: ['Tickets'], summary: 'Cambiar estado (validado por la máquina de estados)', parameters: [idPath()], requestBody: json({ type: 'object', required: ['status'], properties: { status, note: { type: 'string' } } }), responses: { 200: ok(ref('Ticket')), ...errors, 422: problem('Transición no permitida') } } },
    '/api/tickets/{id}/assign': { post: { tags: ['Tickets'], summary: 'Asignar manualmente o por round-robin', parameters: [idPath()], requestBody: json({ oneOf: [{ type: 'object', properties: { mode: { type: 'string', enum: ['manual'] }, assigneeId: { type: 'string', format: 'uuid' } } }, { type: 'object', properties: { mode: { type: 'string', enum: ['auto'] } } }] }), responses: { 200: ok(ref('Ticket')), ...errors, 422: problem('Sin técnicos o ticket finalizado') } } },
    '/api/tickets/{id}/priority': { patch: { tags: ['Tickets'], summary: 'Cambiar prioridad (recalcula SLA)', parameters: [idPath()], requestBody: json({ type: 'object', properties: { priority } }), responses: { 200: ok(ref('Ticket')), ...errors } } },
    '/api/tickets/{id}/comments': { post: { tags: ['Tickets'], summary: 'Agregar comentario público o nota interna', parameters: [idPath()], requestBody: json({ type: 'object', required: ['body'], properties: { body: { type: 'string' }, internal: { type: 'boolean', default: false } } }), responses: { 201: ok(ref('Comment')), ...errors } } },
    '/api/tickets/{id}/attachments': { post: { tags: ['Tickets'], summary: 'Subir adjunto (máx. 5 MB)', parameters: [idPath()], requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { 201: ok(ref('Attachment')), ...errors, 413: problem('Archivo muy grande') } } },
    '/api/tickets/{id}/attachments/{attachmentId}': { get: { tags: ['Tickets'], summary: 'Descargar adjunto', parameters: [idPath(), idPath('attachmentId')], responses: { 200: { description: 'Archivo' }, 404: problem('No existe') } } },
    '/api/tickets/{id}/survey': { post: { tags: ['Tickets'], summary: 'Encuesta de satisfacción (solo solicitante, ticket resuelto)', parameters: [idPath()], requestBody: json({ type: 'object', required: ['rating'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string' } } }), responses: { 201: ok({ type: 'object' }), ...errors, 422: problem('Ya calificado o no resuelto') } } },
    '/api/kb/articles': {
      get: { tags: ['Base de conocimiento'], summary: 'Buscar artículos', parameters: [...pageParams, q('q', { type: 'string' }), q('categoryId', { type: 'string', format: 'uuid' }), q('sort', { type: 'string', enum: ['title', 'createdAt', 'views'] })], responses: { 200: ok(paged('Article')) } },
      post: { tags: ['Base de conocimiento'], summary: 'Crear artículo (admin, tecnico)', requestBody: json(ref('ArticleRequest')), responses: { 201: ok(ref('Article')), ...errors } },
    },
    '/api/kb/articles/{id}': {
      get: { tags: ['Base de conocimiento'], summary: 'Leer artículo (incrementa vistas)', parameters: [idPath()], responses: { 200: ok(ref('Article')), 404: problem('No existe') } },
      put: { tags: ['Base de conocimiento'], summary: 'Editar artículo (admin, tecnico)', parameters: [idPath()], requestBody: json(ref('ArticleRequest')), responses: { 200: ok(ref('Article')), ...errors } },
      delete: { tags: ['Base de conocimiento'], summary: 'Eliminar artículo (admin)', parameters: [idPath()], responses: { 204: { description: 'Eliminado' }, ...errors } },
    },
    '/api/metrics/summary': { get: { tags: ['Métricas'], summary: 'MTTR, cumplimiento SLA, CSAT y distribución (admin, tecnico)', parameters: [q('from', { type: 'string', format: 'date' }), q('to', { type: 'string', format: 'date' })], responses: { 200: ok(ref('Metrics')), ...errors } } },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Problem: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, instance: { type: 'string' }, code: { type: 'string' }, traceId: { type: 'string' }, errors: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } } } },
      PageMeta: { type: 'object', properties: { page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } },
      LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'admin@demo.pe' }, password: { type: 'string', example: 'Demo123!' } } },
      RegisterRequest: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', description: 'Mín. 8, una mayúscula y un número' } } },
      CreateUserRequest: { allOf: [ref('RegisterRequest'), { type: 'object', required: ['role'], properties: { role } }] },
      AuthResponse: { type: 'object', properties: { token: { type: 'string' }, user: ref('User') } },
      User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, role, active: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' } } },
      UserRef: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } } },
      Category: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, active: { type: 'boolean' } } },
      CategoryRequest: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, active: { type: 'boolean' } } },
      SlaPolicy: { type: 'object', properties: { priority, responseHours: { type: 'number' }, resolutionHours: { type: 'number' } } },
      CreateTicketRequest: { type: 'object', required: ['title', 'description'], properties: { title: { type: 'string', minLength: 5 }, description: { type: 'string', minLength: 10 }, priority, categoryId: { type: 'string', format: 'uuid', nullable: true } } },
      Ticket: {
        type: 'object',
        properties: {
          id: { type: 'string' }, number: { type: 'integer' }, title: { type: 'string' }, description: { type: 'string' }, status, priority,
          categoryId: { type: 'string', nullable: true }, categoryName: { type: 'string', nullable: true }, requesterId: { type: 'string' }, requesterName: { type: 'string' },
          assigneeId: { type: 'string', nullable: true }, assigneeName: { type: 'string', nullable: true },
          responseDueAt: { type: 'string', format: 'date-time' }, resolutionDueAt: { type: 'string', format: 'date-time' }, firstResponseAt: { type: 'string', nullable: true },
          slaPausedAt: { type: 'string', nullable: true }, slaBreached: { type: 'boolean' }, slaState: { type: 'string', enum: ['a_tiempo', 'en_riesgo', 'incumplido', 'cumplido', 'pausado'] }, minutesToDue: { type: 'integer' },
          resolvedAt: { type: 'string', nullable: true }, closedAt: { type: 'string', nullable: true }, reopenCount: { type: 'integer' }, createdAt: { type: 'string' }, updatedAt: { type: 'string' },
        },
      },
      Comment: { type: 'object', properties: { id: { type: 'string' }, body: { type: 'string' }, internal: { type: 'boolean' }, authorName: { type: 'string' }, createdAt: { type: 'string' } } },
      Attachment: { type: 'object', properties: { id: { type: 'string' }, originalName: { type: 'string' }, mimeType: { type: 'string' }, sizeBytes: { type: 'integer' }, createdAt: { type: 'string' } } },
      TicketEvent: { type: 'object', properties: { action: { type: 'string' }, fromValue: { type: 'string', nullable: true }, toValue: { type: 'string', nullable: true }, details: { type: 'string', nullable: true }, actorName: { type: 'string', nullable: true }, createdAt: { type: 'string' } } },
      TicketDetail: { allOf: [ref('Ticket'), { type: 'object', properties: { comments: { type: 'array', items: ref('Comment') }, attachments: { type: 'array', items: ref('Attachment') }, events: { type: 'array', items: ref('TicketEvent') }, survey: { type: 'object', nullable: true }, availableTransitions: { type: 'array', items: status } } }] },
      Article: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, slug: { type: 'string' }, content: { type: 'string' }, published: { type: 'boolean' }, views: { type: 'integer' }, authorName: { type: 'string' }, categoryName: { type: 'string', nullable: true } } },
      ArticleRequest: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string' }, content: { type: 'string' }, categoryId: { type: 'string', nullable: true }, published: { type: 'boolean' } } },
      Metrics: { type: 'object', properties: { totalTickets: { type: 'integer' }, openTickets: { type: 'integer' }, mttrHours: { type: 'number', nullable: true }, slaCompliancePct: { type: 'number', nullable: true }, firstResponseCompliancePct: { type: 'number', nullable: true }, breachedOpen: { type: 'integer' }, atRiskOpen: { type: 'integer' }, csatAvg: { type: 'number', nullable: true }, byStatus: { type: 'object' }, byPriority: { type: 'object' }, byAssignee: { type: 'array', items: { type: 'object' } } } },
    },
  },
} as const;
