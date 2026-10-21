# Wonka POS

POS multi-tenant para tienda/zona de juegos: ventas, caja, inventario, PlayZone, cumpleaños, personal/asistencia y facturación electrónica (APISPeru).

## Estructura
- `backend/` API Bun + Elysia + Prisma (Postgres).
- `fronted/` App React + Vite (empaquetada con Electron/Tauri).
- `asistencia/` módulo/app de asistencia.
- `video-promo-renzo-wonka/` video promocional.
- `docs/` documentación; `docs/equipo/` plan y coordinación de mejoras.
- `scripts/` utilidades de desarrollo (`dev.ps1`, `test.ps1`).

## Requisitos
Bun, Node 20+, PostgreSQL 16. En Windows hay Postgres portable en `%USERPROFILE%\pgsql-wonka` (puerto 54329, user/db `wonka`/`wonka_dev`).

## Desarrollo
```powershell
.\scripts\dev.ps1   # Postgres + mock APISPeru :3999 + backend :3001 + frontend, todo en una sola ventana (Ctrl+C lo detiene; logs en .dev-logs\)
```
Manual (backend): `cd backend; bun install; bunx prisma db push; bun prisma/seed.ts` y arrancar con las variables de `backend/.env.test`.

**Nunca uses `backend/.env`: es producción.** Desarrollo y tests usan solo `.env.test` (BD local). Copia `backend/.env.example` y `fronted/.env.example` como plantilla; no subas secretos.

## Tests y tipos
```powershell
.\scripts\test.ps1  # tsc backend + tsc -b frontend + bun test (backend propio en puerto libre)
```
Individual: `cd backend; bunx tsc --noEmit`, `cd fronted; bunx tsc -b`, `cd backend; BASE_URL=http://localhost:<puerto> bun test tests/`.

CI: `.github/workflows/ci.yml` (typecheck + tests con Postgres 16 y mock).

## Release
`fronted/.github/workflows/release.yml` (Tauri) no corre ahí: GitHub solo lee `.github/` en la raíz. Para activarlo, copiarlo a `.github/workflows/` ajustando rutas a `fronted/` (`working-directory`/`projectPath`).

## Docs del equipo
- [Plan de mejoras](docs/equipo/PLAN-MEJORAS.md)
- [Progreso](docs/equipo/PROGRESO.md)
- [Coordinación](docs/equipo/COORDINACION.md)
- [Contrato inventario](docs/equipo/inventario-contrato.md), [integración](docs/equipo/integracion-contrato.md), [DB inventario](docs/equipo/db-inventario.md)
