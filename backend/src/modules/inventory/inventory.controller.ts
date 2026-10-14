import Elysia, { t } from "elysia";
import { getAuth } from "../../lib/auth.ts";
import {
    InventoryError,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listProducts,
    createProduct,
    updateProduct,
    adjustStock,
    inventoryStats,
    listMovements,
    importProducts,
} from "./inventory.service.ts";
import {
    CreateCategoryBody,
    UpdateCategoryBody,
    CreateProductBody,
    UpdateProductBody,
    AdjustStockBody,
    ImportProductsBody,
} from "../../types/schemas.ts";

// ============================================================
//  Inventory Controller — Prefix: /inventory
// ============================================================

/** Known errors keep their status (404/409); anything else is a 500 that is logged, not leaked. */
function fail(set: { status?: number | string }, err: unknown) {
    if (err instanceof InventoryError) {
        set.status = err.status;
        return { message: err.message };
    }
    console.error("[inventory]", err);
    set.status = 500;
    return { message: "Error inesperado en inventario." };
}

const TenantQuery = t.Object({ tenantId: t.String({ minLength: 1 }) });
const IdParams = t.Object({ id: t.String({ minLength: 1 }) });

export const inventoryController = new Elysia({
    prefix: "/inventory",
    tags: ["Inventory"],
})

    // ── GET /inventory/categories ─────────────────────────────
    .get(
        "/categories",
        async ({ query }) => ({ data: await listCategories(query.tenantId) }),
        { query: TenantQuery, detail: { summary: "List all categories for a tenant (with product count)" } }
    )

    // ── POST /inventory/categories ────────────────────────────
    .post(
        "/categories",
        async ({ body, set }) => {
            try {
                const data = await createCategory(body.tenantId, body.name, body.imageUrl);
                set.status = 201;
                return { data };
            } catch (err) {
                return fail(set, err);
            }
        },
        { body: CreateCategoryBody, detail: { summary: "Create a product category (409 if name exists)" } }
    )

    // ── PATCH /inventory/categories/:id ──────────────────────
    .patch(
        "/categories/:id",
        async ({ params, body, query, set }) => {
            try {
                const data = await updateCategory(query.tenantId, params.id, {
                    ...(body.name !== undefined ? { name: body.name } : {}),
                    ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
                });
                return { data };
            } catch (err) {
                return fail(set, err);
            }
        },
        { params: IdParams, query: TenantQuery, body: UpdateCategoryBody, detail: { summary: "Update a category (name, imageUrl)" } }
    )

    // ── DELETE /inventory/categories/:id ─────────────────────
    .delete(
        "/categories/:id",
        async ({ params, query, set }) => {
            try {
                await deleteCategory(query.tenantId, params.id);
                return { data: { id: params.id } };
            } catch (err) {
                return fail(set, err);
            }
        },
        { params: IdParams, query: TenantQuery, detail: { summary: "Delete an empty category (409 if it has products)" } }
    )

    // ── GET /inventory/stats ──────────────────────────────────
    .get("/stats", async ({ query }) => ({ data: await inventoryStats(query.tenantId) }), {
        query: TenantQuery,
        detail: { summary: "Counts: active, lowStock, outOfStock" },
    })

    // ── GET /inventory/movements (admin) ──────────────────────
    .get(
        "/movements",
        async ({ query, set }) => {
            try {
                return await listMovements({ ...query, page: query.page ?? 1, limit: query.limit ?? 50 });
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                productId: t.Optional(t.String()),
                type: t.Optional(t.Union(["INICIAL", "ENTRADA", "SALIDA", "CORRECCION", "VENTA", "ANULACION", "IMPORTACION"].map((v) => t.Literal(v)))),
                from: t.Optional(t.String()),
                to: t.Optional(t.String()),
                page: t.Optional(t.Numeric({ minimum: 1 })),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
            }),
            detail: { summary: "Paginated stock movements (kardex), newest first" },
        }
    )

    // ── GET /inventory/products ───────────────────────────────
    .get(
        "/products",
        async ({ query }) => listProducts({ ...query, page: query.page ?? 1, limit: query.limit ?? 20 }),
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                search: t.Optional(t.String()),
                categoryId: t.Optional(t.String()),
                stock: t.Optional(t.Union([t.Literal("all"), t.Literal("low"), t.Literal("out"), t.Literal("ok")])),
                status: t.Optional(t.Union([t.Literal("active"), t.Literal("inactive"), t.Literal("all")])),
                page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, default: 20 })),
            }),
            detail: { summary: "List products with pagination and filters" },
        }
    )

    // ── POST /inventory/products ──────────────────────────────
    .post(
        "/products",
        async ({ body, set, request }) => {
            try {
                const data = await createProduct({
                    workerId: getAuth(request)!.workerId,
                    tenantId: body.tenantId,
                    categoryId: body.categoryId,
                    name: body.name,
                    sku: body.sku,
                    ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
                    price: body.price,
                    cost: body.cost ?? 0,
                    ...(body.stock !== undefined ? { stock: body.stock } : {}),
                    ...(body.minStock !== undefined ? { minStock: body.minStock } : {}),
                    ...(body.trackStock !== undefined ? { trackStock: body.trackStock } : {}),
                    ...(body.igvRegime !== undefined ? { igvRegime: body.igvRegime } : {}),
                });
                set.status = 201;
                return { data };
            } catch (err) {
                return fail(set, err);
            }
        },
        { body: CreateProductBody, detail: { summary: "Create a new product (409 if SKU exists)" } }
    )

    // ── POST /inventory/products/import ───────────────────────
    .post(
        "/products/import",
        async ({ body, set, request }) => {
            try {
                return { data: await importProducts(body.tenantId, getAuth(request)!.workerId, body.rows, body.updateStock ?? false) };
            } catch (err) {
                return fail(set, err);
            }
        },
        { body: ImportProductsBody, detail: { summary: "Bulk upsert products by SKU (Excel import). Returns {created, updated, errors}" } }
    )

    // ── PATCH /inventory/products/:id ─────────────────────────
    .patch(
        "/products/:id",
        async ({ params, body, query, set }) => {
            try {
                const tenantId = query.tenantId ?? body.tenantId;
                if (!tenantId) throw new InventoryError("tenantId requerido.", 422);
                const data = await updateProduct({
                    tenantId,
                    productId: params.id,
                    ...(body.name !== undefined ? { name: body.name } : {}),
                    ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
                    ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
                    ...(body.price !== undefined ? { price: body.price } : {}),
                    ...(body.cost !== undefined ? { cost: body.cost } : {}),
                    ...(body.minStock !== undefined ? { minStock: body.minStock } : {}),
                    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
                    ...(body.trackStock !== undefined ? { trackStock: body.trackStock } : {}),
                    ...(body.igvRegime !== undefined ? { igvRegime: body.igvRegime } : {}),
                });
                return { data };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            params: IdParams,
            query: t.Object({ tenantId: t.Optional(t.String({ minLength: 1 })) }),
            body: UpdateProductBody,
            detail: { summary: "Update a product (name, price, cost, stock, active). SKU is immutable." },
        }
    )

    // ── POST /inventory/products/:id/stock ────────────────────
    .post(
        "/products/:id/stock",
        async ({ params, body, set, request }) => {
            try {
                return { data: await adjustStock(body.tenantId, params.id, getAuth(request)!.workerId, body.type, body.quantity, body.reason) };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            params: IdParams,
            body: AdjustStockBody,
            detail: { summary: "Stock adjustment (ENTRADA/SALIDA/CORRECCION) with movement; 422 if invalid or would go negative" },
        }
    );
