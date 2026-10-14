// Inventario v2: ajustes, movimientos, minStock, stats, filtros, ventas/anulación, import, concurrencia.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx, other: Ctx;
beforeAll(async () => { c = await createTenant("qainv2"); other = await createTenant("qainv2b"); });
afterAll(async () => { await dropTenant(c.tid); await dropTenant(other.tid); });

const stockOf = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock;
const movs = (productId: string) => prisma.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: "asc" } });
const adjust = (id: string, body: any, ctx: Ctx = c, token = ctx.adminToken) =>
    call("POST", `/inventory/products/${id}/stock`, { token, body: { tenantId: ctx.tid, ...body } });
const mkProduct = (ctx: Ctx, sku: string, extra: any = {}) =>
    call("POST", "/inventory/products", {
        token: ctx.adminToken,
        body: { tenantId: ctx.tid, categoryId: ctx.category.id, name: `P ${sku}`, sku, price: 5, ...extra },
    });

describe("ajustes de stock", () => {
    test("ENTRADA: stock y movimiento en la misma operación", async () => {
        const r = await adjust(c.product.id, { type: "ENTRADA", quantity: 5, reason: "compra proveedor" });
        expect(r.status).toBe(200);
        expect(r.json.data.product.stock).toBe(15);
        expect(r.json.data.movement).toMatchObject({ type: "ENTRADA", delta: 5, stockBefore: 10, stockAfter: 15 });
        expect(await stockOf(c.product.id)).toBe(15);
        const m = (await movs(c.product.id)).at(-1)!;
        expect(m).toMatchObject({ type: "ENTRADA", delta: 5, stockBefore: 10, stockAfter: 15, reason: "compra proveedor", workerId: c.admin.id });
    });
    test("SALIDA", async () => {
        const r = await adjust(c.product.id, { type: "SALIDA", quantity: 3, reason: "merma" });
        expect(r.status).toBe(200);
        expect(await stockOf(c.product.id)).toBe(12);
        expect((await movs(c.product.id)).at(-1)).toMatchObject({ type: "SALIDA", delta: -3, stockBefore: 15, stockAfter: 12 });
    });
    test("CORRECCION fija stock final", async () => {
        const r = await adjust(c.product.id, { type: "CORRECCION", quantity: 7, reason: "conteo físico" });
        expect(r.status).toBe(200);
        expect(await stockOf(c.product.id)).toBe(7);
        expect((await movs(c.product.id)).at(-1)).toMatchObject({ type: "CORRECCION", delta: -5, stockBefore: 12, stockAfter: 7 });
    });
    test("CORRECCION a 0 permitida", async () => {
        const p = (await mkProduct(c, "COR0", { stock: 4 })).json.data;
        expect((await adjust(p.id, { type: "CORRECCION", quantity: 0, reason: "vaciar" })).status).toBe(200);
        expect(await stockOf(p.id)).toBe(0);
    });
    test("inválidos → 422 y sin cambios", async () => {
        const before = await stockOf(c.product.id), n = (await movs(c.product.id)).length;
        const bad: any[] = [
            { type: "ENTRADA", quantity: 0, reason: "cero" },
            { type: "ENTRADA", quantity: -2, reason: "negativa" },
            { type: "ENTRADA", quantity: 1.5, reason: "decimal" },
            { type: "SALIDA", quantity: 999, reason: "más que stock" },
            { type: "CORRECCION", quantity: before, reason: "delta cero" },
            { type: "CORRECCION", quantity: -1, reason: "negativo" },
            { type: "ENTRADA", quantity: 1, reason: "ab" },
            { type: "ENTRADA", quantity: 1, reason: "x".repeat(201) },
            { type: "ENTRADA", quantity: 1 },
            { type: "OTRO", quantity: 1, reason: "tipo malo" },
        ];
        for (const b of bad) expect([b, (await adjust(c.product.id, b)).status]).toEqual([b, 422]);
        expect(await stockOf(c.product.id)).toBe(before);
        expect((await movs(c.product.id)).length).toBe(n);
    });
    test("trackStock=false → 422", async () => {
        expect((await adjust(c.untracked.id, { type: "ENTRADA", quantity: 1, reason: "no aplica" })).status).toBe(422);
        expect(await prisma.stockMovement.count({ where: { productId: c.untracked.id } })).toBe(0);
    });
    test("tenant ajeno → 403/404", async () => {
        const r = await call("POST", `/inventory/products/${other.product.id}/stock`, { token: c.adminToken, body: { tenantId: c.tid, type: "ENTRADA", quantity: 1, reason: "intruso" } });
        expect([403, 404]).toContain(r.status);
        const r2 = await adjust(other.product.id, { type: "ENTRADA", quantity: 1, reason: "intruso" }, other, c.adminToken);
        expect([403, 404]).toContain(r2.status);
        expect(await stockOf(other.product.id)).toBe(10);
    });
    test("cajero → 403 en ajuste y movimientos", async () => {
        expect((await adjust(c.product.id, { type: "ENTRADA", quantity: 1, reason: "cajero" }, c, c.cashierToken)).status).toBe(403);
        expect((await call("GET", "/inventory/movements", { token: c.cashierToken, query: { tenantId: c.tid } })).status).toBe(403);
    });
});

describe("movimientos GET", () => {
    test("forma, orden desc, filtros y meta", async () => {
        const r = await call("GET", "/inventory/movements", { token: c.adminToken, query: { tenantId: c.tid, productId: c.product.id, limit: 2 } });
        expect(r.status).toBe(200);
        expect(r.json.meta.total).toBeGreaterThanOrEqual(3);
        expect(r.json.data).toHaveLength(2);
        const m = r.json.data[0];
        expect(m).toMatchObject({ product: { id: c.product.id, sku: "QA-1" }, worker: { id: c.admin.id } });
        expect(m).toHaveProperty("stockBefore");
        expect(new Date(r.json.data[0].createdAt) >= new Date(r.json.data[1].createdAt)).toBe(true);
        const t = await call("GET", "/inventory/movements", { token: c.adminToken, query: { tenantId: c.tid, type: "SALIDA" } });
        expect(t.json.data.every((x: any) => x.type === "SALIDA")).toBe(true);
        const future = await call("GET", "/inventory/movements", { token: c.adminToken, query: { tenantId: c.tid, from: "2999-01-01" } });
        expect(future.json.meta.total).toBe(0);
        const p2 = await call("GET", "/inventory/movements", { token: c.adminToken, query: { tenantId: c.tid, productId: c.product.id, limit: 2, page: 2 } });
        expect(p2.json.data[0].id).not.toBe(r.json.data[0].id);
    });
    test("no mezcla tenants", async () => {
        const r = await call("GET", "/inventory/movements", { token: other.adminToken, query: { tenantId: other.tid, limit: 200 } });
        expect(r.json.data.every((x: any) => x.product.id !== c.product.id)).toBe(true);
    });
});

describe("minStock, stats, filtros", () => {
    let t: Ctx;
    beforeAll(async () => {
        t = await createTenant("qainv2s");
        await prisma.product.deleteMany({ where: { tenantId: t.tid } });
        const mk = (sku: string, extra: any) => mkProduct(t, sku, extra);
        expect((await mk("OK1", { stock: 50 })).status).toBe(201);
        expect((await mk("LOW1", { stock: 3 })).status).toBe(201); // default minStock 5
        expect((await mk("LOW2", { stock: 10, minStock: 10 })).status).toBe(201);
        expect((await mk("OUT1", { stock: 0 })).status).toBe(201);
        expect((await mk("NOTRK", { stock: 0, trackStock: false })).status).toBe(201);
        expect((await mk("INACT", { stock: 0 })).status).toBe(201);
        const inact = await prisma.product.findFirst({ where: { tenantId: t.tid, sku: "INACT" } });
        await call("PATCH", `/inventory/products/${inact!.id}`, { token: t.adminToken, body: { tenantId: t.tid, isActive: false } });
    });
    afterAll(() => dropTenant(t.tid));

    test("minStock por defecto 5, custom en create, PATCH lo cambia", async () => {
        const low1 = await prisma.product.findFirst({ where: { tenantId: t.tid, sku: "LOW1" } });
        const low2 = await prisma.product.findFirst({ where: { tenantId: t.tid, sku: "LOW2" } });
        expect(low1?.minStock).toBe(5);
        expect(low2?.minStock).toBe(10);
        const r = await call("PATCH", `/inventory/products/${low1!.id}`, { token: t.adminToken, body: { tenantId: t.tid, minStock: 2 } });
        expect(r.status).toBe(200);
        expect(r.json.data.minStock).toBe(2);
        expect((await prisma.product.findUnique({ where: { id: low1!.id } }))?.minStock).toBe(2);
        // 3 > 2 ya no es bajo; restaurar
        expect((await call("GET", "/inventory/stats", { token: t.adminToken, query: { tenantId: t.tid } })).json.data.lowStock).toBe(1);
        await call("PATCH", `/inventory/products/${low1!.id}`, { token: t.adminToken, body: { tenantId: t.tid, minStock: 5 } });
    });
    test("minStock inválido → 422; PATCH con stock no lo cambia", async () => {
        const p = await prisma.product.findFirst({ where: { tenantId: t.tid, sku: "OK1" } });
        expect((await mkProduct(t, "NEG", { minStock: -1 })).status).toBe(422);
        expect((await mkProduct(t, "DEC", { minStock: 1.5 })).status).toBe(422);
        await call("PATCH", `/inventory/products/${p!.id}`, { token: t.adminToken, body: { tenantId: t.tid, stock: 999 } });
        expect(await stockOf(p!.id)).toBe(50);
    });
    test("stats", async () => {
        const r = await call("GET", "/inventory/stats", { token: t.adminToken, query: { tenantId: t.tid } });
        expect(r.status).toBe(200);
        // activos: OK1, LOW1, LOW2, OUT1, NOTRK = 5 ; bajo: LOW1, LOW2 ; agotado: OUT1
        expect(r.json.data).toEqual({ active: 5, lowStock: 2, outOfStock: 1 });
    });
    const list = async (q: Record<string, any>) =>
        (await call("GET", "/inventory/products", { token: t.adminToken, query: { tenantId: t.tid, ...q } })).json;
    const skus = (j: any) => j.data.map((p: any) => p.sku).sort();
    test("filtro stock", async () => {
        expect(skus(await list({ stock: "low" }))).toEqual(["LOW1", "LOW2"]);
        expect(skus(await list({ stock: "out", status: "all" }))).toEqual(["INACT", "OUT1"].sort());
        expect(skus(await list({ stock: "ok" }))).toContain("OK1");
        expect(skus(await list({ stock: "ok" }))).not.toContain("LOW1");
    });
    test("filtro status", async () => {
        expect(skus(await list({ status: "inactive" }))).toEqual(["INACT"]);
        expect(skus(await list({ status: "active" }))).not.toContain("INACT");
        expect(skus(await list({ status: "all" }))).toContain("INACT");
    });
    test("search nombre/SKU insensible; categoryId", async () => {
        expect(skus(await list({ search: "low" }))).toEqual(["LOW1", "LOW2"]);
        expect(skus(await list({ search: "p ok1", status: "all" }))).toEqual(["OK1"]);
        expect((await list({ categoryId: t.category.id, status: "all" })).meta.total).toBe(6);
        expect((await list({ categoryId: "no-existe", status: "all" })).meta.total).toBe(0);
    });
    test("paginación con meta.total", async () => {
        const j = await list({ status: "all", limit: 4, page: 2 });
        expect(j.meta).toMatchObject({ total: 6, page: 2, limit: 4 });
        expect(j.data).toHaveLength(2);
        expect((await list({ limit: 501 })).data).toBeUndefined();
    });
    test("crear con stock>0 → INICIAL; stock 0 o sin trackStock → nada", async () => {
        const mv = async (sku: string) => prisma.stockMovement.findMany({ where: { product: { tenantId: t.tid, sku } } });
        expect(await mv("OK1")).toMatchObject([{ type: "INICIAL", delta: 50, stockBefore: 0, stockAfter: 50 }]);
        expect(await mv("OUT1")).toHaveLength(0);
        expect(await mv("NOTRK")).toHaveLength(0);
        const nt = await mkProduct(t, "NT5", { stock: 5, trackStock: false });
        expect(nt.status).toBe(201);
        expect(await mv("NT5")).toHaveLength(0);
    });
});

describe("ventas y anulaciones", () => {
    let saleId = "";
    const sell = (items: unknown[]) =>
        call("POST", "/pos/sales", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, items, tipoComprobante: "TICKET", paymentMethod: "efectivo" } });
    beforeAll(async () => {
        await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 100 } });
    });
    test("venta real → VENTA; virtual y sin trackStock → nada", async () => {
        const p = (await mkProduct(c, "VTA", { stock: 20 })).json.data;
        const before = (await prisma.stockMovement.count({ where: { tenantId: c.tid } }));
        const r = await sell([
            { productId: p.id, qty: 4 },
            { productId: c.untracked.id, qty: 2 },
            { productId: "free-sale-qa9", qty: 1, unitPrice: 3, label: "Libre" },
        ]);
        expect(r.status).toBe(201);
        saleId = r.json.data.sale.id;
        expect(await stockOf(p.id)).toBe(16);
        const all = await prisma.stockMovement.findMany({ where: { tenantId: c.tid, saleId } });
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ type: "VENTA", delta: -4, stockBefore: 20, stockAfter: 16, productId: p.id });
        expect(await prisma.stockMovement.count({ where: { tenantId: c.tid } })).toBe(before + 1);
        (globalThis as any).__vta = p.id;
    });
    test("venta rechazada por stock insuficiente no deja movimientos", async () => {
        const p = (await mkProduct(c, "VTA2", { stock: 1 })).json.data;
        const r = await sell([{ productId: p.id, qty: 5 }]);
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(await stockOf(p.id)).toBe(1);
        expect((await movs(p.id)).map((m) => m.type)).toEqual(["INICIAL"]);
    });
    test("anulación aprobada → ANULACION (+); rechazada no mueve", async () => {
        const pid = (globalThis as any).__vta as string;
        const v = await call("POST", `/pos/sales/${saleId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA inv" } });
        expect(v.status).toBe(201);
        const rej = await call("POST", `/pos/void/${v.json.data.id}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: false } });
        expect(rej.status).toBe(200);
        expect(await stockOf(pid)).toBe(16);
        const v2 = await call("POST", `/pos/sales/${saleId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA inv 2" } });
        const ok = await call("POST", `/pos/void/${v2.json.data.id}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(ok.status).toBe(200);
        expect(await stockOf(pid)).toBe(20);
        const all = await prisma.stockMovement.findMany({ where: { tenantId: c.tid, saleId }, orderBy: { createdAt: "asc" } });
        expect(all.map((m) => m.type)).toEqual(["VENTA", "ANULACION"]);
        expect(all[1]).toMatchObject({ delta: 4, stockBefore: 16, stockAfter: 20, productId: pid });
        expect(await prisma.stockMovement.count({ where: { saleId, productId: c.untracked.id } })).toBe(0);
    });
});

describe("import y movimientos", () => {
    const imp = (rows: any[], extra: any = {}) => call("POST", "/inventory/products/import", { token: c.adminToken, body: { tenantId: c.tid, rows, ...extra } });
    test("crear con stock → INICIAL; sin stock → nada", async () => {
        const r = await imp([
            { sku: "IMV-1", name: "Imp 1", category: "QA Cat", price: 1, stock: 8 },
            { sku: "IMV-2", name: "Imp 2", category: "QA Cat", price: 1, stock: 0 },
        ]);
        expect(r.json.data.created).toBe(2);
        const p1 = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMV-1" } });
        const p2 = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMV-2" } });
        expect(await movs(p1!.id)).toMatchObject([{ type: "INICIAL", delta: 8, stockBefore: 0, stockAfter: 8 }]);
        expect(await movs(p2!.id)).toHaveLength(0);
    });
    test("update sin updateStock no pisa stock ni crea movimiento", async () => {
        await imp([{ sku: "IMV-1", name: "Imp 1b", category: "QA Cat", price: 2, stock: 99 }]);
        const p = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMV-1" } });
        expect(p?.stock).toBe(8);
        expect(await movs(p!.id)).toHaveLength(1);
    });
    test("updateStock=true → IMPORTACION; mismo stock → sin movimiento", async () => {
        await imp([{ sku: "IMV-1", name: "Imp 1b", category: "QA Cat", price: 2, stock: 20 }], { updateStock: true });
        const p = await prisma.product.findFirst({ where: { tenantId: c.tid, sku: "IMV-1" } });
        expect(p?.stock).toBe(20);
        expect((await movs(p!.id)).at(-1)).toMatchObject({ type: "IMPORTACION", delta: 12, stockBefore: 8, stockAfter: 20 });
        await imp([{ sku: "IMV-1", name: "Imp 1b", category: "QA Cat", price: 2, stock: 20 }], { updateStock: true });
        expect(await movs(p!.id)).toHaveLength(2);
    });
});

describe("concurrencia", () => {
    test("10 salidas concurrentes de 3 sobre stock 20: nunca negativo, deltas cuadran", async () => {
        const p = (await mkProduct(c, "CONC", { stock: 20 })).json.data;
        const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => adjust(p.id, { type: "SALIDA", quantity: 3, reason: `conc ${i}` })));
        const ok = rs.filter((r) => r.status === 200).length;
        expect(ok).toBe(6); // floor(20/3)
        expect(rs.filter((r) => r.status !== 200).every((r) => r.status === 422 || r.status === 409)).toBe(true);
        const stock = await stockOf(p.id);
        expect(stock).toBe(2);
        const m = await movs(p.id);
        expect(m.reduce((a, x) => a + x.delta, 0)).toBe(stock);
        expect(m.every((x) => x.stockAfter >= 0 && x.stockBefore + x.delta === x.stockAfter)).toBe(true);
    });
});

describe("import stock_minimo", () => {
    test("minStock al crear, default 5, actualiza sin tocar si falta", async () => {
        const imp = (rows: any[]) => call("POST", "/inventory/products/import", { token: c.adminToken, body: { tenantId: c.tid, rows } });
        await imp([{ sku: "MIN-1", name: "M1", category: "QA Cat", price: 1, minStock: 12 }, { sku: "MIN-2", name: "M2", category: "QA Cat", price: 1 }]);
        const g = (sku: string) => prisma.product.findFirst({ where: { tenantId: c.tid, sku } });
        expect((await g("MIN-1"))?.minStock).toBe(12);
        expect((await g("MIN-2"))?.minStock).toBe(5);
        await imp([{ sku: "MIN-1", name: "M1", category: "QA Cat", price: 1 }, { sku: "MIN-2", name: "M2", category: "QA Cat", price: 1, minStock: 1 }]);
        expect((await g("MIN-1"))?.minStock).toBe(12);
        expect((await g("MIN-2"))?.minStock).toBe(1);
        const bad = await imp([{ row: 2, sku: "MIN-3", name: "M3", category: "QA Cat", price: 1, minStock: -2 }]);
        expect(bad.json.data.errors).toHaveLength(1);
    });
});
