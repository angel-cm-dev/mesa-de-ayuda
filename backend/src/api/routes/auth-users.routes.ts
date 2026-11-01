import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createUserSchema, listUsersSchema, loginSchema, registerSchema, updateUserSchema } from '../../application/dtos/index.js';
import type { Container } from '../../container.js';
import { asyncHandler, idParam, parse } from '../http.js';
import { authenticate, authorize, currentUser } from '../middlewares/auth.js';

export function authRoutes(c: Container): Router {
  const r = Router();
  const { auth } = c.services;

  // Limita intentos de login por IP para mitigar fuerza bruta / credential stuffing.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: c.config.NODE_ENV === 'test' ? 1000 : 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { status: 429, title: 'Demasiadas solicitudes', detail: 'Demasiados intentos de inicio de sesión. Espera unos minutos.' },
  });

  r.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    res.json(await auth.login(parse(loginSchema, req.body)));
  }));

  r.post('/register', loginLimiter, asyncHandler(async (req, res) => {
    res.status(201).json(await auth.register(parse(registerSchema, req.body)));
  }));

  r.get('/me', authenticate(c.tokens), asyncHandler(async (req, res) => {
    res.json(await auth.me(currentUser(req).id));
  }));

  return r;
}

export function userRoutes(c: Container): Router {
  const r = Router();
  const { users } = c.services;
  r.use(authenticate(c.tokens));

  r.get('/technicians', authorize('admin', 'tecnico'), asyncHandler(async (_req, res) => {
    res.json(await users.technicians());
  }));

  r.get('/', authorize('admin'), asyncHandler(async (req, res) => {
    res.json(await users.list(parse(listUsersSchema, req.query)));
  }));

  r.post('/', authorize('admin'), asyncHandler(async (req, res) => {
    res.status(201).json(await users.create(parse(createUserSchema, req.body)));
  }));

  r.patch('/:id', authorize('admin'), asyncHandler(async (req, res) => {
    const id = parse(idParam, req.params.id);
    res.json(await users.update(id, parse(updateUserSchema, req.body), currentUser(req).id));
  }));

  return r;
}
