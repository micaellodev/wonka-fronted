import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx, other: Ctx;
beforeAll(async () => { c = await createTenant("qaimp"); other = await createTenant("qaimp2"); });
afterAll(async () => { await dropTenant(c.tid); await dropTenant(other.tid); });

const imp = (ctx: Ctx, rows: any[], extra: any = {}, token = ctx.adminToken) =>
    call("POST", "/inventory/products/import", { token, body: { tenantId: ctx.tid, rows, ...extra } });

describe("import masivo de productos", () => {
    test("crea productos y categoría nueva; sku en mayúsculas", async () => {
        const r = await imp(c, [
            { row: 2, sku: "imp-1", name: "Galleta", category: "Dulces Nuevos", price: 2.5, cost: 1, stock: 5, trackStock: "SI", isActive: "NO" },
            { row: 3, sku: "IMP-2", name: "Agua", category: "qa cat", price: "3,5", stock: "" },
        ]);
        expect(r.status).toBe(200);
        expect(r.json.data).toEqual({ created: 2, updated: 0, errors: [] });
        const p = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMP-1" } });
        expect(p?.stock).toBe(5);
        expect(p?.isActive).toBe(false);
        expect(await prisma.category.count({ where: { tenantId: c.tid, name: "Dulces Nuevos" } })).toBe(1);
        const p2 = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMP-2" }, include: { category: true } });
        expect(Number(p2?.price)).toBe(3.5);
        expect(p2?.category.name).toBe("QA Cat"); // reuses existing category case-insensitively
    });
    test("actualiza por SKU sin pisar stock por defecto", async () => {
        const r = await imp(c, [{ sku: "IMP-1", name: "Galleta XL", category: "Dulces Nuevos", price: 9, cost: 4, stock: 99 }]);
        expect(r.json.data).toMatchObject({ created: 0, updated: 1 });
        const p = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMP-1" } });
        expect(p?.name).toBe("Galleta XL");
        expect(p?.stock).toBe(5);
    });
    test("updateStock=true pisa el stock", async () => {
        await imp(c, [{ sku: "IMP-1", name: "Galleta XL", category: "Dulces Nuevos", price: 9, stock: 99 }], { updateStock: true });
        expect((await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMP-1" } }))?.stock).toBe(99);
    });
    test("filas inválidas reportadas, válidas aplicadas", async () => {
        const r = await imp(c, [
            { row: 2, sku: "OK-1", name: "Bueno", category: "X", price: 1 },
            { row: 3, sku: "MAL 1", name: "Espacio", category: "X", price: 1 },
            { row: 4, sku: "MAL2", name: "", category: "X", price: 1 },
            { row: 5, sku: "MAL3", name: "Neg", category: "X", price: -1 },
            { row: 6, sku: "MAL4", name: "Dec", category: "X", price: 1, stock: 1.5 },
            { row: 7, sku: "OK-1", name: "Dup", category: "X", price: 1 },
            { row: 8, sku: "MAL5", name: "Sin cat", category: "", price: 1 },
        ]);
        expect(r.json.data.created).toBe(1);
        expect(r.json.data.errors.map((e: any) => e.row)).toEqual([3, 4, 5, 6, 7, 8]);
        expect(await prisma.product.count({ where: { tenantId: c.tid, sku: { startsWith: "MAL" } } })).toBe(0);
    });
    test("más de 2000 filas → 422", async () => {
        const rows = Array.from({ length: 2001 }, (_, i) => ({ sku: `B${i}`, name: "n", category: "c", price: 1 }));
        expect([400, 422]).toContain((await imp(c, rows)).status);
    });
    test("cajero → 403", async () => {
        expect((await imp(c, [{ sku: "Z", name: "z", category: "c", price: 1 }], {}, c.cashierToken)).status).toBe(403);
    });
    test("tenant ajeno → 403 y sin escrituras", async () => {
        const r = await call("POST", "/inventory/products/import", { token: other.adminToken, body: { tenantId: c.tid, rows: [{ sku: "HACK", name: "h", category: "c", price: 1 }] } });
        expect(r.status).toBe(403);
        expect(await prisma.product.count({ where: { tenantId: c.tid, sku: "HACK" } })).toBe(0);
    });
});
