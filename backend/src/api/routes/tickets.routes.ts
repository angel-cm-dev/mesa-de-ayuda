import { Router } from 'express';
import multer from 'multer';
import {
  assignSchema,
  changePrioritySchema,
  changeStatusSchema,
  commentSchema,
  createTicketSchema,
  listTicketsSchema,
  surveySchema,
} from '../../application/dtos/index.js';
import { MAX_ATTACHMENT_BYTES } from '../../application/services/ticket.service.js';
import type { Container } from '../../container.js';
import { ValidationError } from '../../domain/errors.js';
import { asyncHandler, idParam, parse } from '../http.js';
import { authenticate, authorize, currentUser } from '../middlewares/auth.js';

export function ticketRoutes(c: Container): Router {
  const r = Router();
  const { tickets } = c.services;
  // Se recibe en memoria y el servicio decide si se guarda (valida tipo y tamaño primero).
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });

  r.use(authenticate(c.tokens));

  r.get('/', asyncHandler(async (req, res) => {
    res.json(await tickets.list(parse(listTicketsSchema, req.query), currentUser(req)));
  }));

  r.post('/', asyncHandler(async (req, res) => {
    const ticket = await tickets.create(parse(createTicketSchema, req.body), currentUser(req));
    res.status(201).location(`/api/tickets/${ticket.id}`).json(ticket);
  }));

  // Debe declararse antes de "/:id" para que Express no lo interprete como un id.
  r.get('/sla-alerts', authorize('admin', 'tecnico'), asyncHandler(async (_req, res) => {
    res.json(await tickets.slaAlerts());
  }));

  r.get('/:id', asyncHandler(async (req, res) => {
    res.json(await tickets.getDetail(parse(idParam, req.params.id), currentUser(req)));
  }));

  r.patch('/:id/status', asyncHandler(async (req, res) => {
    res.json(await tickets.changeStatus(parse(idParam, req.params.id), parse(changeStatusSchema, req.body), currentUser(req)));
  }));

  r.post('/:id/assign', authorize('admin', 'tecnico'), asyncHandler(async (req, res) => {
    res.json(await tickets.assign(parse(idParam, req.params.id), parse(assignSchema, req.body), currentUser(req)));
  }));

  r.patch('/:id/priority', authorize('admin', 'tecnico'), asyncHandler(async (req, res) => {
    const { priority } = parse(changePrioritySchema, req.body);
    res.json(await tickets.changePriority(parse(idParam, req.params.id), priority, currentUser(req)));
  }));

  r.post('/:id/comments', asyncHandler(async (req, res) => {
    res.status(201).json(await tickets.addComment(parse(idParam, req.params.id), parse(commentSchema, req.body), currentUser(req)));
  }));

  r.post('/:id/attachments', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('Adjunta un archivo en el campo "file"');
    const attachment = await tickets.addAttachment(
      parse(idParam, req.params.id),
      { originalName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer },
      currentUser(req),
    );
    res.status(201).json(attachment);
  }));

  r.get('/:id/attachments/:attachmentId', asyncHandler(async (req, res) => {
    const { attachment, path } = await tickets.getAttachment(parse(idParam, req.params.id), parse(idParam, req.params.attachmentId), currentUser(req));
    res.setHeader('Content-Type', attachment.mimeType);
    // "attachment" fuerza la descarga: el navegador no ejecuta HTML/JS subido por terceros.
    res.download(path, attachment.originalName);
  }));

  r.post('/:id/survey', asyncHandler(async (req, res) => {
    res.status(201).json(await tickets.submitSurvey(parse(idParam, req.params.id), parse(surveySchema, req.body), currentUser(req)));
  }));

  return r;
}
