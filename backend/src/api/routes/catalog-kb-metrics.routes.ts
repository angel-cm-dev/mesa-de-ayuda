import { Router } from 'express';
import { z } from 'zod';
import { articleSchema, categorySchema, listArticlesSchema, metricsQuerySchema, slaPolicySchema } from '../../application/dtos/index.js';
import type { Container } from '../../container.js';
import { PRIORITIES } from '../../domain/entities.js';
import { asyncHandler, idParam, parse } from '../http.js';
import { authenticate, authorize, currentUser } from '../middlewares/auth.js';

export function catalogRoutes(c: Container): Router {
  const r = Router();
  const { catalog } = c.services;
  // Este router se monta en /api: se autentica por ruta (y no con r.use) para no
  // interceptar rutas ajenas, que deben responder 404 y no 401.
  const authn = authenticate(c.tokens);

  r.get('/categories', authn, asyncHandler(async (req, res) => {
    // Los usuarios solo necesitan las activas (formulario de ticket); admin ve todas.
    const all = req.query.all === 'true' && currentUser(req).role === 'admin';
    res.json(await catalog.listCategories(!all));
  }));
  r.post('/categories', authn, authorize('admin'), asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.createCategory(parse(categorySchema, req.body)));
  }));
  r.put('/categories/:id', authn, authorize('admin'), asyncHandler(async (req, res) => {
    res.json(await catalog.updateCategory(parse(idParam, req.params.id), parse(categorySchema, req.body)));
  }));

  r.get('/sla-policies', authn, asyncHandler(async (_req, res) => {
    res.json(await catalog.listSlaPolicies());
  }));
  r.put('/sla-policies/:priority', authn, authorize('admin'), asyncHandler(async (req, res) => {
    const priority = parse(z.enum(PRIORITIES), req.params.priority);
    res.json(await catalog.updateSlaPolicy(priority, parse(slaPolicySchema, req.body)));
  }));

  return r;
}

export function knowledgeBaseRoutes(c: Container): Router {
  const r = Router();
  const { kb } = c.services;
  r.use(authenticate(c.tokens));

  r.get('/articles', asyncHandler(async (req, res) => {
    res.json(await kb.list(parse(listArticlesSchema, req.query), currentUser(req)));
  }));
  r.get('/articles/:id', asyncHandler(async (req, res) => {
    res.json(await kb.get(parse(idParam, req.params.id), currentUser(req)));
  }));
  r.post('/articles', authorize('admin', 'tecnico'), asyncHandler(async (req, res) => {
    res.status(201).json(await kb.create(parse(articleSchema, req.body), currentUser(req)));
  }));
  r.put('/articles/:id', authorize('admin', 'tecnico'), asyncHandler(async (req, res) => {
    res.json(await kb.update(parse(idParam, req.params.id), parse(articleSchema, req.body)));
  }));
  r.delete('/articles/:id', authorize('admin'), asyncHandler(async (req, res) => {
    await kb.remove(parse(idParam, req.params.id));
    res.status(204).end();
  }));

  return r;
}

export function metricsRoutes(c: Container): Router {
  const r = Router();
  r.use(authenticate(c.tokens), authorize('admin', 'tecnico'));
  r.get('/summary', asyncHandler(async (req, res) => {
    res.json(await c.services.metrics.summary(parse(metricsQuerySchema, req.query)));
  }));
  return r;
}
