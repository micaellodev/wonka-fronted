# Pendiente: resiliencia de Railway y backend

Fecha: 2026-10-22. Retomar cuando el incidente de Railway esté resuelto (https://status.railway.com/incident/QH8L8B3E).

## Decisiones tomadas
- Backend y base de datos **se quedan en Railway**. Supabase solo para Storage. **No hay migración de DB.**
- Ahora se trabaja el **frontend**. El backend se retoma después.
- Para desarrollo local el frontend apunta al backend de producción con `VITE_API_URL=https://wonka-backend-production.up.railway.app` (variable solo del proceso, `fronted/.env` sigue en localhost:3000). Esto escribe en datos reales.

## Pendiente del backend (en orden de prioridad)
1. **Backup externo de la DB**: `pg_dump` programado (diario o cada pocas horas) a R2 o Supabase Storage. Verificar también que los backups propios de Railway estén activos. No hay `pg_dump`/`psql` instalados en esta máquina.
2. **Seguridad tras el incidente de Railway**: rotar la contraseña de Postgres (actualizar `DATABASE_URL`) y los secretos de las variables de entorno (token APISPeru, clave Supabase, secreto JWT). Hacerlo fuera del horario de tienda; implica un corte breve.
3. **No redesplegar** hasta que Railway confirme builds y deploys estables.
4. **Cola offline de ventas en el POS** (frontend/Electron): ventas en local (IndexedDB o SQLite) con ID de idempotencia, caché de catálogo, precios, usuarios y PINs, y sincronización al volver la conexión. Boletas electrónicas (APISPeru) se envían después; offline se emite comprobante interno.
5. Opcional, alta disponibilidad: segundo despliegue del backend (Fly.io o Render) y lista de URLs en el frontend (hoy `VITE_API_URL` es una sola).

## Notas
- `docs/equipo/COORDINACION.md` prohíbe usar `backend/.env` (apunta a Railway = producción). Usar `bun --env-file=.env.test ...`.
- Si algún día se migra la DB a Supabase: usar el pooler (6543, `?pgbouncer=true`) para el backend y conexión directa (5432) para migraciones; `prisma.config.ts` solo lee `DATABASE_URL`, habría que añadir `DIRECT_URL`.
- Nada de esto está implementado todavía.
