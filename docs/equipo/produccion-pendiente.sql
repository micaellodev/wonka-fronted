-- Cambios de schema pendientes de aplicar en PRODUCCIÓN (Railway). NO aplicado: lo ejecuta el responsable de deploy.
-- Antes: snapshot/backup (scripts/backup.ps1). Todo es aditivo e idempotente (IF NOT EXISTS) y va en una transacción.
-- Orden: aplicar este SQL ANTES de desplegar el backend nuevo (el cliente Prisma nuevo consulta receiptFooter y minStock).
-- Después: `bunx --bun prisma db push` debe decir "already in sync". Si propone algo más (p. ej. índices únicos que no
-- están aquí), revisa con: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- y NO aceptes data loss. Detalle y contexto de cada bloque: docs/equipo/db-inventario.md.
-- Precheck del índice único parcial (debe devolver 0 filas):
--   SELECT "tenantId","wristbandCode",count(*) FROM play_sessions WHERE status='ACTIVE' GROUP BY 1,2 HAVING count(*)>1;

BEGIN;

-- Facturación / zona de juegos
ALTER TABLE "billing_notes" ADD COLUMN IF NOT EXISTS "sunatStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "sunatResponse" JSONB,
  ADD COLUMN IF NOT EXISTS "sunatXmlUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "sunatCdrUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playzoneRates" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "play_sessions_active_wristband_key"
  ON "play_sessions"("tenantId", "wristbandCode") WHERE (status = 'ACTIVE');
DROP INDEX IF EXISTS "play_sessions_tenantId_wristbandCode_status_key";

-- Inventario v2
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "minStock" INTEGER NOT NULL DEFAULT 5;
CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" TEXT NOT NULL, "type" TEXT NOT NULL, "delta" INTEGER NOT NULL,
    "stockBefore" INTEGER NOT NULL, "stockAfter" INTEGER NOT NULL, "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL, "workerId" TEXT, "saleId" TEXT,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "stock_movements_tenantId_createdAt_idx" ON "stock_movements"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices de rendimiento (2026-10-17)
CREATE INDEX IF NOT EXISTS "sales_tenantId_status_sunatStatus_createdAt_idx" ON "sales"("tenantId", "status", "sunatStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX IF NOT EXISTS "sale_items_virtualSku_idx" ON "sale_items"("virtualSku");
CREATE INDEX IF NOT EXISTS "attendances_tenantId_checkIn_idx" ON "attendances"("tenantId", "checkIn");
CREATE INDEX IF NOT EXISTS "play_sessions_tenantId_startTime_idx" ON "play_sessions"("tenantId", "startTime");

-- Varios turnos de caja por día (2026-10-18): un cajero puede cerrar más de una vez el mismo día
DROP INDEX IF EXISTS "cash_closes_tenantId_closedDate_workerId_key";

-- Pie de recibo configurable (2026-10-18)
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "receiptFooter" TEXT;

COMMIT;
