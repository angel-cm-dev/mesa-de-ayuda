# Mesa de Ayuda (Help Desk)

Sistema full-stack de **gestión de tickets de soporte TI** con acuerdos de nivel de servicio (SLA) por prioridad, máquina de estados validada, asignación manual o round-robin, comentarios públicos e internos, adjuntos, auditoría completa, base de conocimiento, encuestas de satisfacción y métricas operativas (MTTR, cumplimiento de SLA, CSAT).

> Proyecto de portafolio con fines didácticos. Todos los datos de ejemplo son **ficticios**.

![Node](https://img.shields.io/badge/Node.js-22%2B-339933) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6) ![React](https://img.shields.io/badge/React-18-61DAFB) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1) ![Licencia](https://img.shields.io/badge/licencia-MIT-green)

---

## Tabla de contenidos

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Stack y justificación](#stack-y-justificación)
- [Inicio rápido con Docker](#inicio-rápido-con-docker)
- [Inicio sin Docker](#inicio-sin-docker)
- [Credenciales demo](#credenciales-demo)
- [Endpoints principales](#endpoints-principales)
- [Pruebas](#pruebas)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Variables de entorno](#variables-de-entorno)
- [Qué aprenderás con este proyecto](#qué-aprenderás-con-este-proyecto)
- [Roadmap](#roadmap)
- [Licencia y autor](#licencia-y-autor)

## Características

| Módulo | Qué hace |
|---|---|
| **Tickets** | Alta con categoría y prioridad, número correlativo legible (`HD-0007`), búsqueda, filtros (estado, prioridad, categoría, "asignados a mí", "sin asignar"), orden y paginación. |
| **Máquina de estados** | `nuevo → asignado → en_progreso ⇄ en_espera → resuelto → cerrado` (+ `cancelado` y reapertura). Transiciones inválidas → `422`; transiciones no permitidas al rol → `403`. |
| **SLA por prioridad** | Plazos de 1.ª respuesta y de resolución configurables. Estado calculado (`a_tiempo`, `en_riesgo` ≥ 75 %, `incumplido`, `cumplido`, `pausado`). El tiempo "en espera" **no** cuenta: al reanudar se corre el vencimiento. |
| **Alertas de incumplimiento** | Job periódico que marca tickets vencidos, registra el evento en la auditoría y emite un log de alerta (simula la notificación). Endpoint de alertas para el dashboard. |
| **Asignación** | Manual (admin), "tomar ticket" (técnico) y **round-robin persistente** (al técnico activo que lleva más tiempo sin recibir tickets). Opción de autoasignar al crear. |
| **Comentarios** | Públicos o **notas internas** (invisibles para el usuario final). La primera respuesta pública cuenta para el SLA de respuesta. |
| **Adjuntos** | Almacenamiento local, máx. 5 MB, lista blanca de tipos MIME, nombre físico aleatorio (anti path-traversal), descarga con control de acceso. |
| **Auditoría** | Historial *append-only* de cada ticket: creación, cambios de estado/prioridad, asignaciones, comentarios, adjuntos, SLA incumplido y encuestas. |
| **Base de conocimiento** | Artículos con borrador/publicado, búsqueda, contador de vistas y sugerencias automáticas al redactar un ticket (desvío de tickets). |
| **Encuesta de satisfacción** | Calificación 1–5 por el solicitante una vez resuelto el ticket (una sola vez). |
| **Métricas** | MTTR, % cumplimiento de SLA (resolución y respuesta), CSAT, abiertos/vencidos/en riesgo, distribución por estado/prioridad y carga por técnico. |
| **Seguridad** | JWT (HS256) con roles `admin`, `tecnico`, `usuario`; bcrypt; rate limiting en login; helmet; validación Zod; errores RFC 7807. |
| **Frontend** | React + Tailwind, responsive, **modo oscuro**, estados de carga/vacío/error, formularios validados, vista imprimible del ticket. |

## Arquitectura

```mermaid
flowchart LR
    subgraph Cliente
        B[Navegador<br/>React SPA]
    end
    subgraph Docker
        N[nginx<br/>estáticos + proxy /api]
        subgraph API[API Node.js · Express]
            R[Capa API<br/>rutas, auth, validación,<br/>errores RFC 7807]
            S[Capa Aplicación<br/>servicios / casos de uso, DTOs]
            D[Capa Dominio<br/>máquina de estados, SLA,<br/>round-robin, métricas]
            I[Infraestructura<br/>Knex, bcrypt, JWT,<br/>disco, job SLA]
        end
        P[(PostgreSQL)]
        F[(Volumen<br/>adjuntos)]
    end
    B -->|HTTPS| N --> R --> S --> D
    S -->|puertos| I
    I --> P
    I --> F
```

Las dependencias apuntan **hacia el dominio**: la capa de aplicación define interfaces (puertos) y la infraestructura las implementa. Detalle en [`docs/arquitectura.md`](docs/arquitectura.md).

## Stack y justificación

| Tecnología | Por qué |
|---|---|
| **Node.js + TypeScript (strict)** | Un solo lenguaje en front y back; tipos estáticos que documentan contratos y evitan errores en refactors. |
| **Express 4** | Minimalista y conocido; permite ver explícitamente cada middleware (auth, validación, errores) sin "magia". |
| **Knex** (query builder) | SQL portable entre **PostgreSQL** (producción) y **SQLite** (pruebas sin Docker) y migraciones versionadas. Ver [ADR 0002](docs/decisiones/0002-knex-postgresql-sqlite.md). |
| **Zod** | Valida la entrada y genera los tipos TypeScript de los DTOs desde una sola definición. |
| **pino** | Logs JSON estructurados con `requestId` para correlación; listos para Loki/ELK/CloudWatch. |
| **JWT + bcrypt** | Autenticación sin estado, fácil de escalar horizontalmente; contraseñas con hash lento y sal. |
| **Vitest + Supertest** | Pruebas rápidas (unitarias de dominio + integración HTTP real contra SQLite en memoria). |
| **React 18 + Vite + Tailwind** | Arranque instantáneo, build optimizado y sistema de diseño consistente con modo oscuro. |
| **Docker Compose + nginx** | Levantar todo con un comando; nginx sirve la SPA y hace de proxy (sin CORS). |

## Inicio rápido con Docker

Requisitos: Docker Desktop (o Docker Engine + Compose v2).

```bash
cp .env.example .env          # opcional: personaliza secretos
docker compose up --build
```

| Servicio | URL |
|---|---|
| Aplicación web | http://localhost:8080 |
| API | http://localhost:3000/api |
| Swagger / OpenAPI | http://localhost:3000/api/docs |
| Health check | http://localhost:3000/health |

Al arrancar, la API aplica las migraciones y (si la base está vacía) carga los **datos demo**.

## Inicio sin Docker

Requisitos: Node.js 20+ (probado con Node 24) y, opcionalmente, PostgreSQL 14+.

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Opción rápida sin PostgreSQL: en .env usa DB_CLIENT=sqlite y SQLITE_FILENAME=./dev.sqlite
npm run dev            # http://localhost:3000  (migra y carga datos demo)
```

Otros scripts: `npm run build && npm start` (producción), `npm run db:migrate`, `npm run db:seed`, `npm run lint`, `npm run typecheck`.

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (proxy de /api → localhost:3000)
```

Si la API corre en otro puerto: `API_PROXY_TARGET=http://localhost:4000 npm run dev`.

## Credenciales demo

Contraseña para todas: **`Demo123!`**

| Rol | Correo | Puede |
|---|---|---|
| Administrador | `admin@demo.pe` | Todo: usuarios, catálogos, SLA, reasignar, métricas |
| Técnico | `tecnico1@demo.pe` (Carla Quispe) | Atender tickets asignados, tomar libres, notas internas, KB, métricas |
| Técnico | `tecnico2@demo.pe` (Jorge Ramos) | Igual que el anterior |
| Usuario | `usuario@demo.pe` (Lucía Torres) | Crear y seguir **sus** tickets, comentar, adjuntar, cerrar/reabrir, calificar |
| Usuario | `usuario2@demo.pe` (Martín Salazar) | Igual que el anterior |

> Son credenciales de demostración de datos ficticios. Cámbialas (y `JWT_SECRET`) en cualquier despliegue real.

## Endpoints principales

Base: `/api` · Autenticación: `Authorization: Bearer <token>` · Errores: `application/problem+json`.
Ejemplos completos con `curl` en [`docs/guia-api.md`](docs/guia-api.md).

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | público | Inicia sesión y devuelve el JWT |
| `POST` | `/auth/register` | público | Autoregistro (rol `usuario`) |
| `GET` | `/auth/me` | todos | Usuario autenticado |
| `GET` `POST` | `/users` | admin | Listar (filtros/paginación) y crear usuarios |
| `PATCH` | `/users/:id` | admin | Cambiar nombre, rol, estado o contraseña |
| `GET` | `/users/technicians` | admin, técnico | Técnicos activos |
| `GET` `POST` `PUT` | `/categories` | todos / admin | Catálogo de categorías |
| `GET` `PUT` | `/sla-policies[/:priority]` | todos / admin | Políticas de SLA |
| `GET` `POST` | `/tickets` | todos | Listar (el usuario solo ve los suyos) y crear |
| `GET` | `/tickets/sla-alerts` | admin, técnico | Tickets en riesgo o vencidos |
| `GET` | `/tickets/:id` | todos* | Detalle + comentarios, adjuntos, historial, transiciones disponibles |
| `PATCH` | `/tickets/:id/status` | según máquina de estados | Cambiar estado (con nota opcional) |
| `POST` | `/tickets/:id/assign` | admin, técnico | `{ "mode": "manual", "assigneeId" }` o `{ "mode": "auto" }` |
| `PATCH` | `/tickets/:id/priority` | admin, técnico | Cambia prioridad y recalcula SLA |
| `POST` | `/tickets/:id/comments` | todos* | Comentario público o nota interna (`internal: true`) |
| `POST` `GET` | `/tickets/:id/attachments[/:attachmentId]` | todos* | Subir (multipart `file`) y descargar adjuntos |
| `POST` | `/tickets/:id/survey` | solicitante | Encuesta 1–5 |
| `GET` `POST` `PUT` `DELETE` | `/kb/articles[/:id]` | todos / admin, técnico | Base de conocimiento |
| `GET` | `/metrics/summary` | admin, técnico | MTTR, SLA, CSAT, distribución |
| `GET` | `/health` | público | Estado de la API y la base de datos |

\* El rol `usuario` solo accede a sus propios tickets (los ajenos responden `404`).

## Pruebas

Las pruebas **no requieren Docker ni PostgreSQL**: el backend usa SQLite en memoria con las mismas migraciones y datos demo.

```bash
cd backend && npm test      # 55 pruebas: unitarias de dominio + integración HTTP (Supertest)
cd frontend && npm test     # 19 pruebas: utilidades, cliente API y componentes (Testing Library)
```

| Suite | Qué cubre |
|---|---|
| `backend/tests/unit` | Máquina de estados y permisos por rol, cálculo de SLA (riesgo, pausa, incumplimiento), round-robin, métricas, slugs |
| `backend/tests/integration` | Auth, autorización por rol, validación y ProblemDetails, ciclo de vida completo del ticket con reloj simulado, alertas y job de SLA, notas internas, adjuntos, encuestas, KB, catálogos, métricas |
| `frontend/src/**/*.test.ts(x)` | Formateadores, validaciones de formularios, cliente HTTP (token, errores, 401), componentes de UI |

La CI de GitHub Actions (`.github/workflows/ci.yml`) ejecuta lint, typecheck, pruebas y build de ambos proyectos y valida el `docker-compose.yml`.

## Estructura de carpetas

```
mesa-de-ayuda/
├── backend/
│   ├── src/
│   │   ├── domain/            # Reglas de negocio puras: entidades, máquina de estados, SLA, round-robin, métricas
│   │   ├── application/
│   │   │   ├── dtos/          # Esquemas Zod de entrada (validación + tipos)
│   │   │   ├── ports/         # Interfaces de repositorios y servicios técnicos
│   │   │   └── services/      # Casos de uso: tickets, auth, usuarios, KB, métricas, catálogos
│   │   ├── infrastructure/
│   │   │   ├── db/            # Knex, migraciones, seed demo, CLI
│   │   │   ├── repositories/  # Implementaciones Knex + unidad de trabajo (transacciones)
│   │   │   ├── security/      # bcrypt y JWT
│   │   │   ├── storage/       # Adjuntos en disco local
│   │   │   └── jobs/          # Monitor periódico de SLA
│   │   ├── api/               # Rutas Express, middlewares (auth, errores), OpenAPI
│   │   ├── container.ts       # Composition root (inyección de dependencias)
│   │   ├── app.ts             # Construcción de la app Express (testeable)
│   │   └── server.ts          # Arranque, migraciones, apagado ordenado
│   ├── tests/{unit,integration}
│   └── Dockerfile             # Multi-stage, usuario no root
├── frontend/
│   ├── src/
│   │   ├── components/        # Layout con sidebar y componentes de UI reutilizables
│   │   ├── context/           # Sesión (AuthContext)
│   │   ├── hooks/             # useAsync, useDebounce, useTheme
│   │   ├── lib/               # Cliente API, tipos, formateadores, validaciones
│   │   └── pages/             # Dashboard, tickets, detalle, KB, usuarios, configuración
│   ├── nginx.conf
│   └── Dockerfile             # Build de Vite + nginx sin privilegios
├── docs/                      # Arquitectura, modelo de datos, ADRs y guía de la API
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto de la API |
| `DB_CLIENT` | `pg` | `pg` (PostgreSQL) o `sqlite` |
| `DATABASE_URL` | `postgres://helpdesk:helpdesk@localhost:5432/helpdesk` | Conexión PostgreSQL |
| `SQLITE_FILENAME` | `:memory:` | Archivo SQLite cuando `DB_CLIENT=sqlite` |
| `JWT_SECRET` | — (obligatoria, ≥ 32 caracteres) | Clave de firma de tokens |
| `JWT_EXPIRES_IN` | `8h` | Vigencia del token |
| `BCRYPT_ROUNDS` | `12` | Costo del hash de contraseñas |
| `CORS_ORIGIN` | `http://localhost:5173` | Orígenes permitidos (separados por coma) |
| `UPLOAD_DIR` | `./uploads` | Carpeta de adjuntos |
| `SEED_DEMO` | `true` | Cargar datos demo si la base está vacía |
| `AUTO_ASSIGN_ON_CREATE` | `false` | Asignar por round-robin al crear |
| `SLA_MONITOR_INTERVAL_MS` | `60000` | Frecuencia del job de SLA (`0` lo desactiva) |
| `LOG_LEVEL` | `info` | `fatal`…`trace` o `silent` |
| `POSTGRES_DB/USER/PASSWORD` | `helpdesk` | Solo para docker-compose |

La configuración se valida al arrancar: si falta algo crítico la API no inicia y muestra qué corregir.

## Qué aprenderás con este proyecto

- **Clean Architecture en Node.js**: separar dominio, casos de uso e infraestructura con puertos/adaptadores e inyección de dependencias manual.
- **Modelar reglas de negocio** como código puro y testeable: máquina de estados declarativa, cálculo de SLA con pausas, round-robin justo y persistente.
- **Transacciones con Unidad de Trabajo**: cambio de estado + auditoría se guardan juntos o no se guardan.
- **Diseño de API REST profesional**: paginación/filtros/orden con listas blancas, validación con Zod, errores RFC 7807, OpenAPI.
- **Seguridad práctica**: JWT con algoritmo fijado, bcrypt, rate limiting, autorización por rol y por propiedad del recurso (404 en vez de 403 para no filtrar existencia), subida de archivos segura.
- **Pruebas de integración reales** sin Docker y con un **reloj inyectable** para simular el paso del tiempo.
- **Observabilidad**: logs estructurados, `X-Request-Id`, health check, job programado con logs de alerta.
- **Frontend mantenible**: cliente HTTP tipado, hooks reutilizables, estados de UI completos, modo oscuro y diseño responsive.
- **Entrega continua**: Dockerfiles multi-stage sin root, compose con healthchecks y CI en GitHub Actions.

## Roadmap

- [ ] SLA en **horario laboral** y feriados de Perú (calendarios por equipo).
- [ ] Notificaciones reales por correo / Microsoft Teams / Slack (cola con BullMQ + Redis).
- [ ] Escalamiento automático al supervisor al entrar "en riesgo".
- [ ] Cierre automático de tickets resueltos tras N días sin respuesta.
- [ ] Almacenamiento de adjuntos en S3/MinIO y antivirus (ClamAV).
- [ ] Refresh tokens y revocación de sesiones.
- [ ] Reportes exportables (CSV/PDF) y gráficos históricos.
- [ ] Pruebas E2E con Playwright.

## Licencia y autor

Distribuido bajo licencia [MIT](LICENSE).

**Angel Castañeda Meza** — Ingeniero de Sistemas · Lima, Perú
GitHub: [@angel-cm-dev](https://github.com/angel-cm-dev)
