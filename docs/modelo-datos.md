# Modelo de datos

Esquema creado por la migración `backend/src/infrastructure/db/migrations/001_esquema_inicial.ts` (portable entre PostgreSQL y SQLite).

```mermaid
erDiagram
    users ||--o{ tickets : "reporta (requester_id)"
    users ||--o{ tickets : "atiende (assignee_id)"
    categories ||--o{ tickets : clasifica
    sla_policies ||..o{ tickets : "define plazos (por prioridad)"
    tickets ||--o{ ticket_comments : tiene
    tickets ||--o{ ticket_attachments : tiene
    tickets ||--o{ ticket_events : audita
    tickets ||--o| surveys : "se califica"
    users ||--o{ ticket_comments : escribe
    users ||--o{ ticket_events : "actor"
    categories ||--o{ kb_articles : agrupa
    users ||--o{ kb_articles : redacta

    users {
        uuid id PK
        string name
        string email UK
        string password_hash
        string role "admin | tecnico | usuario"
        boolean active
        timestamptz last_assigned_at "round-robin"
        timestamptz created_at
    }
    categories {
        uuid id PK
        string name UK
        string description
        boolean active
    }
    sla_policies {
        string priority PK "baja | media | alta | critica"
        float response_hours
        float resolution_hours
    }
    tickets {
        uuid id PK
        int number UK "HD-0001"
        string title
        text description
        string status
        string priority
        uuid category_id FK
        uuid requester_id FK
        uuid assignee_id FK
        timestamptz response_due_at
        timestamptz resolution_due_at
        timestamptz first_response_at
        timestamptz sla_paused_at
        boolean sla_breached
        timestamptz resolved_at
        timestamptz closed_at
        int reopen_count
        timestamptz created_at
        timestamptz updated_at
    }
    ticket_comments {
        uuid id PK
        uuid ticket_id FK
        uuid author_id FK
        text body
        boolean internal
        timestamptz created_at
    }
    ticket_attachments {
        uuid id PK
        uuid ticket_id FK
        uuid uploaded_by FK
        string original_name
        string stored_name
        string mime_type
        int size_bytes
        timestamptz created_at
    }
    ticket_events {
        uuid id PK
        uuid ticket_id FK
        uuid actor_id FK "null = sistema"
        string action
        string from_value
        string to_value
        text details
        timestamptz created_at
    }
    surveys {
        uuid id PK
        uuid ticket_id FK,UK
        int rating "CHECK 1..5"
        text comment
        timestamptz created_at
    }
    kb_articles {
        uuid id PK
        string title
        string slug UK
        text content
        uuid category_id FK
        uuid author_id FK
        boolean published
        int views
        timestamptz created_at
        timestamptz updated_at
    }
```

## Tablas

| Tabla | Propósito | Notas de diseño |
|---|---|---|
| `users` | Cuentas y rol. | `email` único y normalizado a minúsculas. `last_assigned_at` sostiene el round-robin. Nunca se borra un usuario: se desactiva (`active=false`) para no romper la auditoría. |
| `categories` | Clasificación de tickets y artículos. | Desactivar oculta la categoría en formularios sin afectar históricos (`ON DELETE SET NULL`). |
| `sla_policies` | Plazos por prioridad. | Clave natural `priority`. Cambiarla afecta solo a tickets nuevos: el vencimiento se **copia** al ticket al crearlo. |
| `tickets` | Entidad central. | `number` legible y único. Las fechas de vencimiento se guardan (snapshot del SLA). `first_response_at`, `resolved_at` y `closed_at` permiten calcular métricas sin recorrer la auditoría. `sla_paused_at` ≠ null indica reloj detenido ("en_espera"). |
| `ticket_comments` | Conversación. | `internal=true` solo visible para técnicos/admin. |
| `ticket_attachments` | Metadatos de archivos. | El binario vive en disco (`UPLOAD_DIR/<ticketId>/<uuid>.<ext>`); `stored_name` nunca usa el nombre del cliente. |
| `ticket_events` | Auditoría *append-only*. | Acciones: `creado`, `estado_cambiado`, `asignado`, `prioridad_cambiada`, `comentario_agregado`, `adjunto_agregado`, `sla_incumplido`, `encuesta_respondida`. `actor_id` nulo = acción del sistema (job). |
| `surveys` | Satisfacción (CSAT). | `UNIQUE(ticket_id)`: una encuesta por ticket. `CHECK rating BETWEEN 1 AND 5`. |
| `kb_articles` | Base de conocimiento. | `slug` único para URLs amigables; `published` separa borradores. |

## Índices

`tickets(status)`, `tickets(priority)`, `tickets(assignee_id)`, `tickets(requester_id)`, `tickets(created_at)`, `ticket_comments(ticket_id)`, `ticket_attachments(ticket_id)`, `ticket_events(ticket_id)`, `users(role)`, `kb_articles(published)` — cubren los filtros de las colas de trabajo y la carga del detalle.

## Convenciones

- Identificadores **UUID** generados en la aplicación.
- Fechas en UTC (`timestamptz` en PostgreSQL; ISO-8601 en SQLite). La UI las muestra en `America/Lima`.
- Nombres de columnas en `snake_case`; el mapeo a `camelCase` se hace en los repositorios.
