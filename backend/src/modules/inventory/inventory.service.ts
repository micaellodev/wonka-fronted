import { prisma } from "../../lib/prisma.ts";

// ============================================================
//  Inventory Service — Business Logic
//  Every query is scoped by tenantId (reads, updates and deletes).
// ============================================================

/** Error carrying the HTTP status the controller should answer with. */
export class InventoryError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

/** Maps Prisma unique violations (P2002) to a 409 with a readable message. */
function rethrowUnique(err: unknown, message: string): never {
    if ((err as { code?: string })?.code === "P2002") throw new InventoryError(message, 409);
    throw err;
}

async function assertCategory(tenantId: string, categoryId: string) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId }, select: { id: true } });
    if (!category) throw new InventoryError("Categoría no encontrada para este negocio.", 404);
}

const toNumbers = <T extends { price: { toString(): string }; cost: { toString(): string } }>(p: T) => ({
    ...p,
    price: parseFloat(p.price.toString()),
    cost: parseFloat(p.cost.toString()),
});

const productSelect = {
    id: true,
    name: true,
    sku: true,
    imageUrl: true,
    price: true,
    cost: true,
    stock: true,
    minStock: true,
    trackStock: true,
    isActive: true,
    igvRegime: true,
    tenantId: true,
    category: { select: { id: true, name: true } },
} as const;

// ── Categories ───────────────────────────────────────────────

const categorySelect = { id: true, name: true, imageUrl: true, tenantId: true, createdAt: true } as const;

export async function listCategories(tenantId: string) {
    return prisma.category.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { ...categorySelect, _count: { select: { products: true } } },
    });
}

export async function createCategory(tenantId: string, name: string, imageUrl?: string) {
    try {
        return await prisma.category.create({
            data: { tenantId, name: name.trim(), ...(imageUrl ? { imageUrl } : {}) },
            select: categorySelect,
        });
    } catch (err) {
        rethrowUnique(err, "Ya existe una categoría con ese nombre.");
    }
}

export async function updateCategory(tenantId: string, categoryId: string, data: { name?: string; imageUrl?: string | null }) {
    try {
        return await prisma.category.update({
            where: { id: categoryId, tenantId },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
            },
            select: categorySelect,
        });
    } catch (err) {
        if ((err as { code?: string })?.code === "P2025") throw new InventoryError("Categoría no encontrada para este negocio.", 404);
        rethrowUnique(err, "Ya existe una categoría con ese nombre.");
    }
}

export async function deleteCategory(tenantId: string, categoryId: string) {
    const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId },
        select: { _count: { select: { products: true } } },
    });
    if (!category) throw new InventoryError("Categoría no encontrada para este negocio.", 404);
    if (category._count.products > 0) {
        throw new InventoryError("No se puede eliminar: la categoría tiene productos. Muévelos o desactívalos primero.", 409);
    }
    await prisma.category.deleteMany({ where: { id: categoryId, tenantId } });
}

// ── Products ─────────────────────────────────────────────────

export type ListProductsInput = {
    tenantId: string;
    page: number;
    limit: number;
    search?: string | undefined;
    categoryId?: string | undefined;
    stock?: "all" | "low" | "out" | "ok" | undefined;
    status?: "active" | "inactive" | "all" | undefined;
};

// Stock-level filters compare against the per-product minStock column, so they need raw SQL ids.
async function stockFilterIds(tenantId: string, stock: "low" | "out" | "ok") {
    const rows = stock === "low"
        ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE "tenantId" = ${tenantId} AND "trackStock" AND stock > 0 AND stock <= "minStock"`
        : stock === "out"
            ? await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE "tenantId" = ${tenantId} AND "trackStock" AND stock <= 0`
            : await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE "tenantId" = ${tenantId} AND (NOT "trackStock" OR stock > "minStock")`;
    return rows.map((r) => r.id);
}

export async function listProducts({ tenantId, page, limit, search, categoryId, stock, status }: ListProductsInput) {
    const skip = (page - 1) * limit;
    const q = search?.trim();
    const where = {
        tenantId,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
        ...(stock && stock !== "all" ? { id: { in: await stockFilterIds(tenantId, stock) } } : {}),
    };
    const [products, total] = await Promise.all([
        prisma.product.findMany({ where, skip, take: limit, orderBy: { name: "asc" }, select: productSelect }),
        prisma.product.count({ where }),
    ]);

    return {
        data: products.map(toNumbers),
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
}

export async function inventoryStats(tenantId: string) {
    const [r] = await prisma.$queryRaw<{ active: number; lowStock: number; outOfStock: number }[]>`
        SELECT COUNT(*) FILTER (WHERE "isActive")::int AS active,
               COUNT(*) FILTER (WHERE "isActive" AND "trackStock" AND stock > 0 AND stock <= "minStock")::int AS "lowStock",
               COUNT(*) FILTER (WHERE "isActive" AND "trackStock" AND stock <= 0)::int AS "outOfStock"
        FROM products WHERE "tenantId" = ${tenantId}`;
    return r!;
}

export type MovementsInput = {
    tenantId: string; page: number; limit: number;
    productId?: string | undefined; type?: string | undefined; from?: string | undefined; to?: string | undefined;
};

export async function listMovements({ tenantId, page, limit, productId, type, from, to }: MovementsInput) {
    const date = (v: string | undefined, name: string) => {
        if (!v) return undefined;
        const d = new Date(v);
        if (isNaN(d.getTime())) throw new InventoryError(`Fecha inválida en "${name}".`, 422);
        return d;
    };
    const gte = date(from, "from"), lte = date(to, "to");
    const where = {
        tenantId,
        ...(productId ? { productId } : {}),
        ...(type ? { type } : {}),
        ...(gte || lte ? { createdAt: { ...(gte && { gte }), ...(lte && { lte }) } } : {}),
    };
    const [rows, total] = await Promise.all([
        prisma.stockMovement.findMany({
            where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
                id: true, type: true, delta: true, stockBefore: true, stockAfter: true, reason: true, createdAt: true, saleId: true,
                product: { select: { id: true, name: true, sku: true } },
                worker: { select: { id: true, name: true } },
            },
        }),
        prisma.stockMovement.count({ where }),
    ]);
    return { data: rows, meta: { total, page, limit } };
}

export type CreateProductInput = {
    tenantId: string;
    categoryId: string;
    name: string;
    sku: string;
    imageUrl?: string;
    price: number;
    cost: number;
    stock?: number;
    minStock?: number;
    trackStock?: boolean;
    igvRegime?: string;
    workerId?: string;
};

export async function createProduct(input: CreateProductInput) {
    await assertCategory(input.tenantId, input.categoryId);
    try {
        return await prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
                data: {
                    tenantId: input.tenantId,
                    categoryId: input.categoryId,
                    name: input.name.trim(),
                    sku: input.sku.trim().toUpperCase(),
                    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
                    price: input.price,
                    cost: input.cost,
                    stock: input.stock ?? 0,
                    ...(input.minStock !== undefined ? { minStock: input.minStock } : {}),
                    ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}),
                    ...(input.igvRegime !== undefined ? { igvRegime: input.igvRegime } : {}),
                },
                select: productSelect,
            });
            if (product.trackStock && product.stock > 0) {
                await tx.stockMovement.create({
                    data: {
                        type: "INICIAL", delta: product.stock, stockBefore: 0, stockAfter: product.stock,
                        tenantId: input.tenantId, productId: product.id, workerId: input.workerId ?? null,
                    },
                });
            }
            return toNumbers(product);
        });
    } catch (err) {
        rethrowUnique(err, "Ya existe un producto con ese SKU.");
    }
}

export type UpdateProductInput = {
    tenantId: string;
    productId: string;
    name?: string;
    imageUrl?: string | null;
    categoryId?: string;
    price?: number;
    cost?: number;
    minStock?: number;
    isActive?: boolean;
    trackStock?: boolean;
    igvRegime?: string | null;
};

export async function updateProduct(input: UpdateProductInput) {
    if (input.categoryId !== undefined) await assertCategory(input.tenantId, input.categoryId);
    try {
        const product = await prisma.product.update({
            where: { id: input.productId, tenantId: input.tenantId },
            data: {
                ...(input.name !== undefined && { name: input.name.trim() }),
                ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl || null }),
                ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
                ...(input.price !== undefined && { price: input.price }),
                ...(input.cost !== undefined && { cost: input.cost }),
                ...(input.minStock !== undefined && { minStock: input.minStock }),
                ...(input.isActive !== undefined && { isActive: input.isActive }),
                ...(input.trackStock !== undefined && { trackStock: input.trackStock }),
                ...(input.igvRegime !== undefined && { igvRegime: input.igvRegime || null }),
            },
            select: productSelect,
        });
        return toNumbers(product);
    } catch (err) {
        if ((err as { code?: string })?.code === "P2025") throw new InventoryError("Producto no encontrado para este negocio.", 404);
        throw err;
    }
}

export type AdjustType = "ENTRADA" | "SALIDA" | "CORRECCION";

/**
 * Stock adjustment + movement in one transaction. The row is locked (FOR UPDATE) so concurrent
 * adjustments/sales serialize and stock can never go negative.
 */
export async function adjustStock(tenantId: string, productId: string, workerId: string, type: AdjustType, quantity: number, reason: string) {
    if (type !== "CORRECCION" && quantity <= 0) throw new InventoryError("La cantidad debe ser un entero mayor a 0.", 422);
    const why = reason.trim();
    if (why.length < 3) throw new InventoryError("El motivo debe tener al menos 3 caracteres.", 422);
    return prisma.$transaction(async (tx) => {
        const [cur] = await tx.$queryRaw<{ stock: number; trackStock: boolean }[]>`SELECT stock, "trackStock" FROM products WHERE id = ${productId} AND "tenantId" = ${tenantId} FOR UPDATE`;
        if (!cur) throw new InventoryError("Producto no encontrado para este negocio.", 404);
        if (!cur.trackStock) throw new InventoryError("Este producto no controla stock.", 422);
        const delta = type === "ENTRADA" ? quantity : type === "SALIDA" ? -quantity : quantity - cur.stock;
        if (delta === 0) throw new InventoryError("El stock ya tiene ese valor; no hay nada que corregir.", 422);
        const after = cur.stock + delta;
        if (after < 0) throw new InventoryError(`Stock insuficiente: hay ${cur.stock} unidades.`, 422);
        if (after > 2147483647) throw new InventoryError("Stock fuera de rango.", 422);
        await tx.product.update({ where: { id: productId }, data: { stock: after } });
        const movement = await tx.stockMovement.create({
            data: { type, delta, stockBefore: cur.stock, stockAfter: after, reason: why, tenantId, productId, workerId },
            select: { id: true, type: true, delta: true, stockBefore: true, stockAfter: true, reason: true, createdAt: true, saleId: true },
        });
        const product = await tx.product.findFirstOrThrow({ where: { id: productId, tenantId }, select: productSelect });
        return { product: toNumbers(product), movement };
    });
}

// ── Bulk import (Excel) ──────────────────────────────────────

export const IMPORT_MAX_ROWS = 2000;

/** Accepts booleans and the usual Excel spellings (SI/NO, 1/0, true/false). undefined = cell empty. */
function parseBool(v: unknown): boolean | undefined | "bad" {
    if (v === undefined || v === null || String(v).trim() === "") return undefined;
    const s = String(v).trim().toLowerCase();
    if (["si", "sí", "s", "1", "true", "verdadero", "x"].includes(s)) return true;
    if (["no", "n", "0", "false", "falso"].includes(s)) return false;
    return "bad";
}

const empty = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

function parseNum(v: unknown, int: boolean, max: number): number | "bad" {
    const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > max || (int && !Number.isInteger(n))) return "bad";
    return n;
}

type ImportRow = {
    row: number; sku: string; name: string; category: string; price: number;
    stock: number | undefined; minStock: number | undefined; trackStock: boolean | undefined; isActive: boolean | undefined;
};

/**
 * Upsert by SKU inside the tenant. Rows are validated one by one (errors reported, valid rows still applied,
 * all writes in a single transaction). Missing categories are created. On update, stock is only overwritten
 * when `updateStock` is true; otherwise the live stock (sales/adjustments) is preserved.
 */
export async function importProducts(tenantId: string, workerId: string | null, rawRows: Record<string, unknown>[], updateStock: boolean) {
    if (rawRows.length > IMPORT_MAX_ROWS) throw new InventoryError(`Máximo ${IMPORT_MAX_ROWS} filas por importación.`, 422);
    const errors: { row: number; message: string }[] = [];
    const rows: ImportRow[] = [];
    const seen = new Set<string>();

    rawRows.forEach((r, i) => {
        const row = typeof r["row"] === "number" ? r["row"] : i + 2;
        const bad = (message: string) => void errors.push({ row, message });
        const sku = String(r["sku"] ?? "").trim().toUpperCase();
        const name = String(r["name"] ?? "").trim();
        const category = String(r["category"] ?? "").trim();
        if (!sku || /\s/.test(sku) || sku.length > 40) return bad("SKU obligatorio, sin espacios (máx. 40).");
        if (seen.has(sku)) return bad(`SKU ${sku} repetido en el archivo.`);
        if (!name || name.length > 120) return bad("Nombre obligatorio (máx. 120).");
        if (!category || category.length > 80) return bad("Categoría obligatoria (máx. 80).");
        const price = empty(r["price"]) ? "bad" : parseNum(r["price"], false, 99999999.99);
        if (price === "bad") return bad("Precio obligatorio: número ≥ 0.");
        const stock = empty(r["stock"]) ? undefined : parseNum(r["stock"], true, 2147483647);
        if (stock === "bad") return bad("Stock inválido: entero ≥ 0.");
        const minStock = empty(r["minStock"]) ? undefined : parseNum(r["minStock"], true, 2147483647);
        if (minStock === "bad") return bad("Stock mínimo inválido: entero ≥ 0.");
        const trackStock = parseBool(r["trackStock"]);
        const isActive = parseBool(r["isActive"]);
        if (trackStock === "bad" || isActive === "bad") return bad("controla_stock/activo deben ser SI o NO.");
        seen.add(sku);
        rows.push({ row, sku, name, category, price, stock, minStock, trackStock, isActive });
    });

    let created = 0, updated = 0;
    if (rows.length > 0) {
        await prisma.$transaction(async (tx) => {
            const cats = new Map((await tx.category.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((c) => [c.name.toLowerCase(), c.id]));
            for (const r of rows) {
                const key = r.category.toLowerCase();
                if (!cats.has(key)) cats.set(key, (await tx.category.create({ data: { tenantId, name: r.category }, select: { id: true } })).id);
            }
            const existing = new Map((await tx.product.findMany({ where: { tenantId, sku: { in: rows.map((r) => r.sku) } }, select: { sku: true, stock: true } })).map((p) => [p.sku, p] as const));
            for (const r of rows) {
                const categoryId = cats.get(r.category.toLowerCase())!;
                const common = {
                    name: r.name, categoryId, price: r.price,
                    ...(r.trackStock !== undefined && { trackStock: r.trackStock }),
                    ...(r.isActive !== undefined && { isActive: r.isActive }),
                    ...(r.minStock !== undefined && { minStock: r.minStock }),
                };
                const prev = existing.get(r.sku);
                const mv = (productId: string, before: number, after: number, type: string) =>
                    tx.stockMovement.create({ data: { type, delta: after - before, stockBefore: before, stockAfter: after, tenantId, productId, workerId, reason: "Importación Excel" } });
                if (prev) {
                    const setStock = updateStock && r.stock !== undefined;
                    const p = await tx.product.update({ where: { tenantId_sku: { tenantId, sku: r.sku } }, data: { ...common, ...(setStock ? { stock: r.stock! } : {}) }, select: { id: true, stock: true, trackStock: true } });
                    if (setStock && p.trackStock && p.stock !== prev.stock) await mv(p.id, prev.stock, p.stock, "IMPORTACION");
                    updated++;
                } else {
                    const p = await tx.product.create({ data: { ...common, tenantId, sku: r.sku, stock: r.stock ?? 0, cost: 0, igvRegime: "EXONERADO" }, select: { id: true, stock: true, trackStock: true } });
                    if (p.trackStock && p.stock > 0) await mv(p.id, 0, p.stock, "INICIAL");
                    created++;
                }
            }
        }, { timeout: 60_000, maxWait: 10_000 });
    }
    return { created, updated, errors };
}
