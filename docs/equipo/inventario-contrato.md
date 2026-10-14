# Inventario v2 — contrato compartido (líder)

Entorno: base local `postgresql://wonka:wonka@localhost:54329/wonka_dev` (`bun --env-file=.env.test`). NUNCA `backend/.env` (producción). Token admin: `POST /hr/verify-pin {"tenantId":"wonka_main_store_001","pin":"060904"}` → `token`. Cajero: `11111`.
Decisión del usuario: **sin costo ni margen** en UI/Excel (backend guarda cost=0).

## Schema (ya aplicado en local por el líder; no editar schema.prisma sin pedirlo)
- `Product.minStock Int @default(5)` — alerta si `trackStock && stock <= minStock`.
- `StockMovement { id, type, delta, stockBefore, stockAfter, reason?, createdAt, tenantId, productId, workerId?, saleId? }`
  - `type`: `INICIAL | ENTRADA | SALIDA | CORRECCION | VENTA | ANULACION | IMPORTACION`.
  - Toda variación de `Product.stock` escribe un movimiento **en la misma transacción**. Productos con `trackStock=false` y líneas virtuales (`productId` null) no generan movimientos ni cambian stock.

## Endpoints (mantener el sobre de respuesta existente `{ data, meta? }`)
- `GET /inventory/stats?tenantId` → `{ active, lowStock, outOfStock }`
  - active: `isActive`; lowStock: `isActive && trackStock && stock > 0 && stock <= minStock`; outOfStock: `isActive && trackStock && stock <= 0`.
- `GET /inventory/products?tenantId&search&categoryId&stock=(all|low|out|ok)&status=(active|inactive|all)&page&limit(≤500)` → `{ data: Product[], meta: { total, page, limit } }`. `search` busca en nombre y SKU (insensible a mayúsculas). Producto incluye `minStock`.
- `POST /inventory/products` y `PATCH /inventory/products/:id` aceptan `minStock` (entero ≥ 0, opcional; default 5). Crear con `stock > 0` y `trackStock` → movimiento `INICIAL`. PATCH **no** acepta `stock`.
- `POST /inventory/products/:id/stock` (admin) body `{ tenantId, type: "ENTRADA"|"SALIDA"|"CORRECCION", quantity: int, reason: string(3..200) }`
  - ENTRADA/SALIDA: `quantity` entero > 0; SALIDA > stock → 422. CORRECCION: `quantity` = stock final entero ≥ 0 (delta = quantity − stock; delta 0 → 422).
  - `trackStock=false` → 422. Producto de otro tenant → 404. workerId sale del token.
  - Respuesta `{ data: { product, movement } }`.
- `GET /inventory/movements?tenantId&productId&type&from&to&page&limit(≤200)` (admin) → `{ data: [{ id, type, delta, stockBefore, stockAfter, reason, createdAt, saleId, product:{id,name,sku}, worker:{id,name}|null }], meta:{ total, page, limit } }`, orden `createdAt desc`.
- `POST /inventory/products/import`: igual que hoy; además crea movimiento `INICIAL` al crear con stock > 0 e `IMPORTACION` cuando `updateStock=true` cambia el stock.
- Ventas (`pos.service`): por cada línea con producto real y `trackStock` → movimiento `VENTA` (delta negativo, `saleId`). Anulación aprobada → `ANULACION` (delta positivo).
- Dashboard: alertas de stock bajo usan `minStock` del producto.

## Propiedad de archivos
| Agente | Archivos |
|---|---|
| backend-inv | `backend/src/modules/inventory/*`, `modules/pos/pos.service.ts` (solo movimientos), `modules/dashboard/*` (solo stock bajo), sección Inventory de `types/schemas.ts`, `lib/auth.ts` (solo si falta ruta admin), `prisma/seed.ts` |
| frontend-inv | `fronted/src/pages/InventoryScreen.tsx` y nuevos `fronted/src/pages/inventory/*`, tipos en `fronted/src/types/index.ts` (Product/StockMovement) |
| qa-inv | `backend/tests/inventory-v2.test.ts`, `fronted/e2e/*` (Playwright), sección Inventario de `controles.md` |
