# Guía de la API con ejemplos `curl`

- Base URL (Docker o local): `http://localhost:3000`
- Documentación interactiva: `http://localhost:3000/api/docs` · Especificación: `/api/openapi.json`
- Todas las rutas (salvo login, registro y health) requieren `Authorization: Bearer <token>`.

> En Windows PowerShell usa `curl.exe` y comillas dobles escapadas, o ejecuta los ejemplos desde Git Bash / WSL.

## 1. Autenticación

```bash
# Iniciar sesión (credencial demo)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.pe","password":"Demo123!"}'

# Guardar el token en una variable (requiere jq)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.pe","password":"Demo123!"}' | jq -r .token)

# Usuario actual
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"

# Autoregistro (siempre crea rol "usuario")
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana Pérez","email":"ana@demo.pe","password":"Segura123"}'
```

## 2. Tickets

```bash
# Crear (como usuario final)
UTOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"usuario@demo.pe","password":"Demo123!"}' | jq -r .token)

curl -s -X POST http://localhost:3000/api/tickets \
  -H "Authorization: Bearer $UTOKEN" -H "Content-Type: application/json" \
  -d '{"title":"No puedo imprimir","description":"La impresora del piso 2 muestra error de papel","priority":"alta"}'

# Listar con filtros, búsqueda, orden y paginación
curl -s "http://localhost:3000/api/tickets?status=nuevo,asignado&priority=alta&q=impresora&sort=resolutionDueAt&order=asc&page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# Buscar por número legible
curl -s "http://localhost:3000/api/tickets?q=HD-0006" -H "Authorization: Bearer $TOKEN"

# Detalle (comentarios, adjuntos, historial, transiciones disponibles)
curl -s http://localhost:3000/api/tickets/<ID> -H "Authorization: Bearer $TOKEN"
```

Respuesta paginada:

```json
{
  "data": [{ "id": "…", "number": 13, "status": "nuevo", "slaState": "a_tiempo", "minutesToDue": 479, "…": "…" }],
  "meta": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 }
}
```

## 3. Asignación

```bash
# Round-robin (técnico activo con asignación más antigua)
curl -s -X POST http://localhost:3000/api/tickets/<ID>/assign \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"mode":"auto"}'

# Manual
curl -s -X POST http://localhost:3000/api/tickets/<ID>/assign \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode":"manual","assigneeId":"<ID_TECNICO>"}'

# Técnicos disponibles
curl -s http://localhost:3000/api/users/technicians -H "Authorization: Bearer $TOKEN"
```

## 4. Cambios de estado

```bash
curl -s -X PATCH http://localhost:3000/api/tickets/<ID>/status \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"en_progreso"}'

# Con nota (se publica como comentario)
curl -s -X PATCH http://localhost:3000/api/tickets/<ID>/status \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"resuelto","note":"Se reemplazó el tóner."}'
```

Transición inválida → `422`:

```json
{
  "type": "https://httpstatuses.io/422",
  "title": "Regla de negocio incumplida",
  "status": 422,
  "detail": "Transición no permitida: 'nuevo' → 'resuelto'",
  "instance": "/api/tickets/…/status",
  "code": "business_rule",
  "traceId": "4b0c…",
  "allowed": ["asignado", "cancelado"]
}
```

## 5. Comentarios, adjuntos y encuesta

```bash
# Nota interna (solo técnicos/admin la ven)
curl -s -X POST http://localhost:3000/api/tickets/<ID>/comments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"body":"Revisar garantía con el proveedor","internal":true}'

# Subir adjunto (máx. 5 MB; png, jpg, gif, pdf, txt, csv, docx, xlsx)
curl -s -X POST http://localhost:3000/api/tickets/<ID>/attachments \
  -H "Authorization: Bearer $UTOKEN" -F "file=@captura.png"

# Descargar adjunto
curl -s -OJ http://localhost:3000/api/tickets/<ID>/attachments/<ID_ADJUNTO> -H "Authorization: Bearer $UTOKEN"

# Encuesta (solicitante, ticket resuelto o cerrado)
curl -s -X POST http://localhost:3000/api/tickets/<ID>/survey \
  -H "Authorization: Bearer $UTOKEN" -H "Content-Type: application/json" \
  -d '{"rating":5,"comment":"Muy rápido"}'
```

## 6. SLA y métricas

```bash
# Tickets en riesgo o vencidos
curl -s http://localhost:3000/api/tickets/sla-alerts -H "Authorization: Bearer $TOKEN"

# Políticas de SLA y edición (admin)
curl -s http://localhost:3000/api/sla-policies -H "Authorization: Bearer $TOKEN"
curl -s -X PUT http://localhost:3000/api/sla-policies/alta \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"responseHours":2,"resolutionHours":6}'

# Métricas (rango opcional)
curl -s "http://localhost:3000/api/metrics/summary?from=2026-01-01&to=2026-12-31" -H "Authorization: Bearer $TOKEN"
```

## 7. Base de conocimiento

```bash
curl -s "http://localhost:3000/api/kb/articles?q=vpn&sort=views" -H "Authorization: Bearer $UTOKEN"

curl -s -X POST http://localhost:3000/api/kb/articles \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Cómo mapear una unidad de red","content":"Abre el Explorador, clic derecho en Este equipo…","published":true}'
```

## 8. Usuarios (admin)

```bash
curl -s "http://localhost:3000/api/users?role=tecnico&q=quispe&page=1" -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Rosa Huamán","email":"rosa@demo.pe","password":"Tecnico123","role":"tecnico"}'

curl -s -X PATCH http://localhost:3000/api/users/<ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"active":false}'
```

## Códigos de estado

| Código | Cuándo |
|---|---|
| `200/201/204` | Éxito |
| `400` | Validación fallida (`errors[]` por campo) o JSON malformado |
| `401` | Sin token, token inválido/expirado o credenciales incorrectas |
| `403` | El rol no puede realizar la acción |
| `404` | Recurso inexistente o no visible para el usuario |
| `409` | Duplicado (correo, categoría) |
| `413` | Adjunto > 5 MB |
| `422` | Regla de negocio (transición inválida, encuesta duplicada, sin técnicos…) |
| `429` | Demasiados intentos de login |
| `503` | `/health` con la base de datos caída |
