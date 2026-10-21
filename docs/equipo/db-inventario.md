# db-inventario — schema, inventario, upload

## Cambios de schema aplicados (DB local de test)

| # | Cambio | Para | Estado local |
|---|---|---|---|
| 1 | `PlaySession`: `@@unique([tenantId, wristbandCode, status])` → índice único **parcial** `@@unique([tenantId, wristbandCode], where: raw("status = 'ACTIVE'"))` (preview `partialIndexes`) | pos-zona (bug: con el unique viejo, una 2ª sesión COMPLETED con el mismo código violaba la restricción al cerrar) | aplicado |
| 2 | `BillingNote`: `sunatStatus String?` (sin default: legacy queda NULL y no se reintenta), `sunatResponse Json?`, `sunatXmlUrl String?`, `sunatCdrUrl String?` | facturacion | aplicado |
| 3 | `Tenant.playzoneRates Json?` (nullable, sin default) | pos-zona | aplicado (db push directo) |

Notas:
- `prisma db push` se niega a crear el índice parcial sin `--accept-data-loss` (falso positivo: avisa "duplicados en [tenantId,wristbandCode]" ignorando el `WHERE`). No usamos ese flag: se aplicó el SQL de abajo con `prisma db execute` y después `prisma db push` confirma "already in sync" y `migrate diff` da migración vacía.
- Ningún código usa la clave compuesta `tenantId_wristbandCode_status` del cliente Prisma (verificado con grep), así que el cambio no rompe llamadas.

## Aplicar en producción (NO ejecutado; hacerlo el responsable de deploy)

1. Backup / snapshot de la DB de Railway.
2. Precheck (debe devolver 0 filas; el unique viejo ya lo garantiza):
   ```sql
   SELECT "tenantId","wristbandCode",count(*) FROM play_sessions
   WHERE status='ACTIVE' GROUP BY 1,2 HAVING count(*)>1;
   ```
3. Ejecutar (idempotente, transaccional, sin pérdida de datos):
   ```sql
   BEGIN;
   ALTER TABLE "billing_notes" ADD COLUMN IF NOT EXISTS "sunatStatus" TEXT,
     ADD COLUMN IF NOT EXISTS "sunatResponse" JSONB,
     ADD COLUMN IF NOT EXISTS "sunatXmlUrl" TEXT,
     ADD COLUMN IF NOT EXISTS "sunatCdrUrl" TEXT;
   ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playzoneRates" JSONB;
   ALTER TABLE "billing_notes" ALTER COLUMN "sunatStatus" DROP DEFAULT; -- por si se aplicó la versión anterior con default
   CREATE UNIQUE INDEX IF NOT EXISTS "play_sessions_active_wristband_key"
     ON "play_sessions"("tenantId", "wristbandCode") WHERE (status = 'ACTIVE');
   DROP INDEX IF EXISTS "play_sessions_tenantId_wristbandCode_status_key";
   COMMIT;
   ```
   (vía `bunx --bun prisma db execute --file cambios.sql` con el DATABASE_URL de prod, o psql).
4. Verificar: `bunx --bun prisma db push` debe decir "already in sync" (si no, NO aceptar data loss; revisar el diff con `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`).
5. Desplegar el backend con el cliente regenerado (`prisma generate` corre en postinstall/build).

## Seed
- Idempotente (todo upsert). Corregido: el `update` del tenant sobrescribía RUC/razón social y **APISPeru token/URL** en cada ejecución (en prod pisaría la configuración real) → ahora `update: {}`. Hash `${TID}:pin` y admin de revisión intactos. Verificado: 2 ejecuciones seguidas OK.

## Inventario (backend `modules/inventory`, `types/schemas.ts` sección Inventory)
- Todas las queries con `tenantId` (update/delete con `where {id, tenantId}`); categoría de producto validada contra el tenant en create **y update** (antes update aceptaba categoryId de otro tenant).
- Errores: `InventoryError(status)` → 404 no encontrado, 409 SKU/nombre duplicado (P2002), 409 categoría con productos, 409 stock insuficiente; 500 genérico logueado (no filtra mensajes de Prisma).
- Validación: nombre no vacío/espacios, SKU sin espacios (se guarda trim+UPPER), precio/costo 0..99,999,999.99, stock entero 0..int4. `imageUrl: ""` limpia imagen; `igvRegime: ""` vuelve al default del tenant.
- Nuevos: `DELETE /inventory/categories/:id` (solo vacía), `POST /inventory/products/:id/stock {delta}` (incremento atómico, nunca < 0). Ambos en rutas admin (seguridad, verificado 403 con cajero).
- `GET /inventory/categories` ahora devuelve `imageUrl` (la UI lo mostraba pero no venía) y `_count.products`. `GET /inventory/products` limit máx 500.
- Upload: Supabase caído/no configurado → **503** con mensaje en español (antes 500 con texto técnico); `createClient` ya no rompe el arranque si falta SUPABASE_URL.

## Pruebas (curl :3015 con token Bearer, verificado en DB)
categoría 201 / duplicada 409 / vacía 422 / otro tenant 403 / cajero 403; producto 201 (SKU " qa-choc-1 " → "QA-CHOC-1") / SKU dup 409 / precio −1 422 / stock 1.5 422 / categoría inexistente 404; PATCH precio+inactivo 200, limpiar igv/imagen 200, categoría ajena 404, producto inexistente 404; stock +5→15, −20→409, −15→0, 0→422; DELETE categoría con productos 409, vacía 200, repetida 404; limit 501 → 422; upload → 503 "El almacenamiento rechazó la imagen: ECONNREFUSED…". Datos de prueba que quedan: categoría "QA Dulces", producto QA-CHOC-1 (stock 3).

## Pendientes
- Imágenes: requiere Supabase real (no hay en test) → bloqueado en controles.md.
- Listado de inventario: una página de 500 (shortcut anotado en InventoryScreen).
- POSScreen pide `limit` ≤ 500 (verificar que pos-zona no pida más; >500 → 422). POS ya oculta inactivos.

## Inventario v2 (2026-10-13) — SQL para producción (NO aplicado)
Aditivo: columna con default y tabla nueva. Aplicar con `prisma db execute --file` dentro de BEGIN/COMMIT antes de desplegar el backend nuevo.
```sql
BEGIN;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "minStock" INTEGER NOT NULL DEFAULT 5;
CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" TEXT NOT NULL, "type" TEXT NOT NULL, "delta" INTEGER NOT NULL,
    "stockBefore" INTEGER NOT NULL, "stockAfter" INTEGER NOT NULL, "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL, "workerId" TEXT, "saleId" TEXT,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "stock_movements_tenantId_createdAt_idx" ON "stock_movements"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
```

## Índices perf (2026-10-17) — SQL para producción (NO aplicado)
Solo índices, aditivo. Nombres = convención Prisma.
```sql
BEGIN;
CREATE INDEX IF NOT EXISTS "sales_tenantId_status_sunatStatus_createdAt_idx" ON "sales"("tenantId", "status", "sunatStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX IF NOT EXISTS "sale_items_virtualSku_idx" ON "sale_items"("virtualSku");
CREATE INDEX IF NOT EXISTS "attendances_tenantId_checkIn_idx" ON "attendances"("tenantId", "checkIn");
CREATE INDEX IF NOT EXISTS "play_sessions_tenantId_startTime_idx" ON "play_sessions"("tenantId", "startTime");
COMMIT;
```
