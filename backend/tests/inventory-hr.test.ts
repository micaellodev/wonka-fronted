import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, login, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qainv"); });
afterAll(async () => { await dropTenant(c.tid); });

describe("categorías", () => {
    let catId = "";
    test("crear categoría (admin) → DB", async () => {
        const r = await call("POST", "/inventory/categories", { token: c.adminToken, body: { tenantId: c.tid, name: "Snacks QA" } });
        expect(r.status).toBe(201);
        catId = r.json.data.id;
        expect((await prisma.category.findUnique({ where: { id: catId } }))?.name).toBe("Snacks QA");
    });
    test("nombre duplicado → 409/422", async () => {
        const r = await call("POST", "/inventory/categories", { token: c.adminToken, body: { tenantId: c.tid, name: "Snacks QA" } });
        expect([409, 422]).toContain(r.status);
    });
    test("editar categoría → DB", async () => {
        const r = await call("PATCH", `/inventory/categories/${catId}`, { token: c.adminToken, query: { tenantId: c.tid }, body: { name: "Snacks QA2" } });
        expect(r.status).toBe(200);
        expect((await prisma.category.findUnique({ where: { id: catId } }))?.name).toBe("Snacks QA2");
    });
    test("listar categorías (cajero puede leer)", async () => {
        const r = await call("GET", "/inventory/categories", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.json)).toContain("Snacks QA2");
    });
});

describe("productos", () => {
    let pid = "";
    test("crear producto → DB", async () => {
        const r = await call("POST", "/inventory/products", {
            token: c.adminToken,
            body: { tenantId: c.tid, categoryId: c.category.id, name: "Gomitas QA", sku: "QA-GOM", price: 2.5, cost: 1, stock: 7, trackStock: true },
        });
        expect(r.status).toBe(201);
        pid = r.json.data.id;
        const p = await prisma.product.findUnique({ where: { id: pid } });
        expect(p?.stock).toBe(7);
        expect(Number(p?.price)).toBe(2.5);
    });
    test("cajero no puede crear producto → 403", async () => {
        const r = await call("POST", "/inventory/products", {
            token: c.cashierToken,
            body: { tenantId: c.tid, categoryId: c.category.id, name: "X", sku: "X", price: 1, cost: 1 },
        });
        expect(r.status).toBe(403);
    });
    test("editar stock/precio/isActive → DB", async () => {
        const r = await call("PATCH", `/inventory/products/${pid}`, { token: c.adminToken, query: { tenantId: c.tid }, body: { stock: 20, price: 3, isActive: false } });
        expect(r.status).toBe(200);
        const p = await prisma.product.findUnique({ where: { id: pid } });
        expect(p?.stock).toBe(20);
        expect(Number(p?.price)).toBe(3);
        expect(p?.isActive).toBe(false);
    });
    test("stock negativo rechazado", async () => {
        const r = await call("PATCH", `/inventory/products/${pid}`, { token: c.adminToken, query: { tenantId: c.tid }, body: { stock: -1 } });
        expect([400, 422]).toContain(r.status);
    });
    test("ajustar stock por delta → DB; no permite quedar negativo", async () => {
        const r = await call("POST", `/inventory/products/${pid}/stock`, { token: c.adminToken, query: { tenantId: c.tid }, body: { delta: -5 } });
        expect(r.status).toBeLessThan(300);
        expect((await prisma.product.findUnique({ where: { id: pid } }))?.stock).toBe(15);
        const bad = await call("POST", `/inventory/products/${pid}/stock`, { token: c.adminToken, query: { tenantId: c.tid }, body: { delta: -999 } });
        expect([409, 422]).toContain(bad.status);
        expect((await prisma.product.findUnique({ where: { id: pid } }))?.stock).toBe(15);
    });
    test("eliminar categoría con productos → 409; vacía → OK", async () => {
        const busy = await call("DELETE", `/inventory/categories/${c.category.id}`, { token: c.adminToken, query: { tenantId: c.tid } });
        expect(busy.status).toBe(409);
        const empty = await prisma.category.create({ data: { tenantId: c.tid, name: "Vacía QA" } });
        const ok = await call("DELETE", `/inventory/categories/${empty.id}`, { token: c.adminToken, query: { tenantId: c.tid } });
        expect(ok.status).toBeLessThan(300);
        expect(await prisma.category.findUnique({ where: { id: empty.id } })).toBeNull();
    });
    test("listar productos", async () => {
        const r = await call("GET", "/inventory/products", { token: c.cashierToken, query: { tenantId: c.tid, page: 1, limit: 100 } });
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.json)).toContain("QA Chocolate");
    });
});

describe("empleados / roles / asistencia", () => {
    let roleId = "", wid = "";
    test("crear rol (admin token + adminPin)", async () => {
        const r = await call("POST", "/hr/roles", { token: c.adminToken, body: { tenantId: c.tid, name: "supervisor", adminPin: c.adminPin } });
        expect(r.status).toBe(201);
        roleId = r.json.data.id;
        expect(r.json.data.name).toBe("SUPERVISOR");
    });
    test("crear rol con adminPin de cajero → 401", async () => {
        const r = await call("POST", "/hr/roles", { token: c.adminToken, body: { tenantId: c.tid, name: "otro", adminPin: c.cashierPin } });
        expect(r.status).toBe(401);
    });
    test("crear empleado con PIN → hash en DB, login OK", async () => {
        const r = await call("POST", "/hr/workers", { token: c.adminToken, body: { tenantId: c.tid, name: "Nuevo QA", roleId, pin: "77777", adminPin: c.adminPin } });
        expect(r.status).toBe(201);
        wid = r.json.data.id;
        const w = await prisma.worker.findUnique({ where: { id: wid } });
        expect(w?.pinHash).not.toBe("77777");
        expect(w?.pinHash).toHaveLength(64);
        expect((await login(c.tid, "77777")).res.status).toBe(200);
    });
    test("PIN duplicado rechazado", async () => {
        const r = await call("POST", "/hr/workers", { token: c.adminToken, body: { tenantId: c.tid, name: "Dup", roleId, pin: "77777", adminPin: c.adminPin } });
        expect([409, 422]).toContain(r.status);
    });
    test("listar empleados sin hashes", async () => {
        const r = await call("GET", "/hr/workers", { token: c.adminToken, query: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.json)).not.toMatch(/pinHash|approvalCodeHash"\s*:\s*"/);
        expect(JSON.stringify(r.json)).toContain("Nuevo QA");
    });
    test("desactivar empleado → ya no inicia sesión", async () => {
        const r = await call("PATCH", `/hr/workers/${wid}`, { token: c.adminToken, query: { tenantId: c.tid }, body: { isActive: false, adminPin: c.adminPin } });
        expect(r.status).toBe(200);
        expect((await login(c.tid, "77777")).res.status).toBe(401);
    });
    test("asistencia: check-in y luego check-out", async () => {
        const a = await call("POST", "/hr/attendance", { body: { tenantId: c.tid, pin: c.cashierPin } });
        expect(a.status).toBe(200);
        expect(a.json.data.action).toBe("CHECK_IN");
        const b = await call("POST", "/hr/attendance", { body: { tenantId: c.tid, pin: c.cashierPin } });
        expect(b.json.data.action).toBe("CHECK_OUT");
        const rec = await prisma.attendance.findFirst({ where: { tenantId: c.tid, workerId: c.cashier.id } });
        expect(rec?.checkOut).not.toBeNull();
        const list = await call("GET", "/hr/attendance", { token: c.adminToken, query: { tenantId: c.tid } });
        expect(list.status).toBe(200);
        expect(list.json.data.length).toBeGreaterThan(0);
    });
    test("asistencia con PIN inválido → 401", async () => {
        const r = await call("POST", "/hr/attendance", { body: { tenantId: c.tid, pin: "00000" } });
        expect(r.status).toBe(401);
    });
});
