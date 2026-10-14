// Permisos: 401 sin token, 403 cajero en rutas admin, tenant ajeno nunca accede a datos (rutas por id incluidas).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let a: Ctx, b: Ctx;
let bSaleId: string, bVoidId: string, bMovId: string, bCloseId: string;
beforeAll(async () => {
    a = await createTenant("qasa");
    b = await createTenant("qasb");
    await call("POST", "/cash/opening", { token: b.cashierToken, body: { tenantId: b.tid, workerId: b.cashier.id, amount: 10 } });
    const s = await call("POST", "/pos/sales", { token: b.cashierToken, body: { tenantId: b.tid, items: [{ productId: b.product.id, qty: 1 }], tipoComprobante: "TICKET", paymentMethod: "efectivo" } });
    bSaleId = s.json.data.sale.id;
    bVoidId = (await call("POST", `/pos/sales/${bSaleId}/void`, { token: b.cashierToken, body: { tenantId: b.tid, reason: "qa" } })).json.data.id;
    bMovId = (await call("POST", "/cash/movements", { token: b.cashierToken, body: { tenantId: b.tid, workerId: b.cashier.id, type: "IN", amount: 1, currency: "PEN", reason: "qa" } })).json.data.id;
    bCloseId = (await call("POST", "/cash/close", { token: b.cashierToken, body: { tenantId: b.tid, workerId: b.cashier.id, countedEfectivo: 1, countedYape: 0, countedTarjeta: 0 } })).json.data.id;
});
afterAll(async () => { await dropTenant(a.tid); await dropTenant(b.tid); });

describe("sin token → 401 en todas las rutas protegidas", () => {
    const routes: Array<[string, string]> = [
        ["GET", "/hr/workers"], ["POST", "/hr/workers"], ["PATCH", "/hr/workers/x"], ["GET", "/hr/roles"], ["POST", "/hr/roles"], ["GET", "/hr/attendance"], ["POST", "/hr/verify-admin"],
        ["GET", "/inventory/products"], ["POST", "/inventory/products"], ["POST", "/inventory/products/import"], ["PATCH", "/inventory/products/x"], ["POST", "/inventory/products/x/stock"],
        ["GET", "/inventory/categories"], ["GET", "/inventory/stats"], ["GET", "/inventory/movements"],
        ["GET", "/pos/sales"], ["GET", "/pos/sales/today"], ["GET", "/pos/sales/x"], ["POST", "/pos/sales"], ["GET", "/pos/void"], ["POST", "/pos/sales/x/void"], ["POST", "/pos/void/x/resolve"], ["POST", "/pos/sales/x/email"],
        ["GET", "/cash/today"], ["GET", "/cash/history"], ["GET", "/cash/summary"], ["GET", "/cash/opening-today"], ["POST", "/cash/opening"], ["POST", "/cash/close"], ["POST", "/cash/close/x/approve"], ["POST", "/cash/movements"], ["GET", "/cash/movements"], ["DELETE", "/cash/movements/x"],
        ["GET", "/dashboard/metrics"], ["GET", "/dashboard/sales-report"], ["GET", "/dashboard/settings"], ["PATCH", "/dashboard/settings"],
        ["GET", "/billing/notes"], ["POST", "/billing/notes"], ["POST", "/billing/retry-pending"],
        ["GET", "/apisperu/dni/45678912"], ["GET", "/apisperu/ruc/20123456789"], ["POST", "/upload"],
        ["GET", "/birthdays"], ["POST", "/birthdays"], ["GET", "/birthdays/x"], ["PATCH", "/birthdays/x/guests/y"],
        ["GET", "/playzone/sessions"], ["POST", "/playzone/sessions"], ["PATCH", "/playzone/sessions/x/complete"], ["GET", "/playzone/rates"], ["PUT", "/playzone/rates"], ["GET", "/playzone/reports/summary"], ["GET", "/playzone/guardians"], ["POST", "/playzone/guardians"],
    ];
    for (const [m, p] of routes) {
        test(`${m} ${p}`, async () => {
            expect((await call(m, p, { body: m === "GET" || m === "DELETE" ? undefined : {} })).status).toBe(401);
        });
    }
});

describe("cajero en rutas admin → 403", () => {
    const routes: Array<[string, string, boolean]> = [
        ["POST", "/hr/workers", true], ["POST", "/hr/roles", true], ["POST", "/inventory/products", true], ["POST", "/inventory/products/import", true],
        ["PATCH", "/inventory/categories/x", true], ["GET", "/inventory/movements", false], ["POST", "/billing/notes", true],
    ];
    for (const [m, p, hasBody] of routes) {
        test(`${m} ${p}`, async () => {
            const r = await call(m, p, { token: a.cashierToken, body: hasBody ? { tenantId: a.tid } : undefined, query: hasBody ? undefined : { tenantId: a.tid } });
            expect(r.status).toBe(403);
        });
    }
});

describe("tenant ajeno por id: nunca datos ni cambios", () => {
    const tk = () => a.adminToken;
    const denied = (s: number) => expect([400, 403, 404, 409, 422]).toContain(s);
    test("GET /pos/sales/:id", async () => denied((await call("GET", `/pos/sales/${bSaleId}`, { token: tk(), query: { tenantId: a.tid } })).status));
    test("POST /pos/sales/:id/void", async () => denied((await call("POST", `/pos/sales/${bSaleId}/void`, { token: tk(), body: { tenantId: a.tid, reason: "x" } })).status));
    test("POST /pos/sales/:id/email", async () => denied((await call("POST", `/pos/sales/${bSaleId}/email`, { token: tk(), body: { tenantId: a.tid, email: "x@y.com" } })).status));
    test("POST /pos/void/:id/resolve", async () => {
        denied((await call("POST", `/pos/void/${bVoidId}/resolve`, { token: tk(), body: { tenantId: a.tid, approverCode: a.approvalCode, approve: true } })).status);
        expect((await prisma.voidRequest.findUnique({ where: { id: bVoidId } }))?.status).toBe("PENDING");
    });
    test("POST /cash/close/:id/approve", async () => {
        denied((await call("POST", `/cash/close/${bCloseId}/approve`, { token: tk(), body: { tenantId: a.tid, approverCode: a.approvalCode } })).status);
        expect((await prisma.cashClose.findUnique({ where: { id: bCloseId } }))?.status).toBe("PENDING_APPROVAL");
    });
    test("DELETE /cash/movements/:id", async () => {
        denied((await call("DELETE", `/cash/movements/${bMovId}`, { token: tk(), query: { tenantId: a.tid } })).status);
        expect(await prisma.cashMovement.findUnique({ where: { id: bMovId } })).not.toBeNull();
    });
    test("PATCH /hr/workers/:id", async () => {
        denied((await call("PATCH", `/hr/workers/${b.cashier.id}`, { token: tk(), body: { tenantId: a.tid, adminPin: a.adminPin, name: "HACK" } })).status);
        expect((await prisma.worker.findUnique({ where: { id: b.cashier.id } }))?.name).toBe("QA Cajero");
    });
    test("PATCH/POST /inventory/products/:id", async () => {
        denied((await call("PATCH", `/inventory/products/${b.product.id}`, { token: tk(), body: { tenantId: a.tid, name: "HACK" } })).status);
        denied((await call("POST", `/inventory/products/${b.product.id}/stock`, { token: tk(), body: { tenantId: a.tid, delta: 100 } })).status);
        const p = await prisma.product.findUnique({ where: { id: b.product.id } });
        expect(p?.name).toBe("QA Chocolate");
        expect(Number(p?.stock)).toBe(9);
    });
    test("PATCH/DELETE /inventory/categories/:id", async () => {
        denied((await call("PATCH", `/inventory/categories/${b.category.id}`, { token: tk(), body: { tenantId: a.tid, name: "HACK" } })).status);
        denied((await call("DELETE", `/inventory/categories/${b.category.id}`, { token: tk(), query: { tenantId: a.tid } })).status);
        expect((await prisma.category.findUnique({ where: { id: b.category.id } }))?.name).toBe("QA Cat");
    });
    test("GET /birthdays/:id y PATCH invitado", async () => {
        denied((await call("GET", "/birthdays/nope", { token: tk(), query: { tenantId: a.tid } })).status);
        denied((await call("PATCH", "/birthdays/nope/guests/nope", { token: tk(), body: { tenantId: a.tid, attended: true } })).status);
    });
    test("PATCH /playzone/sessions/:id/complete", async () => denied((await call("PATCH", "/playzone/sessions/nope/complete", { token: tk(), body: { tenantId: a.tid } })).status));
    test("token de A con tenantId de B → 403", async () => {
        for (const p of ["/pos/sales", "/cash/summary", "/inventory/products", "/dashboard/metrics", "/hr/workers", "/billing/notes", "/playzone/rates"])
            expect((await call("GET", p, { token: tk(), query: { tenantId: b.tid } })).status).toBe(403);
        expect((await call("POST", "/pos/sales", { token: tk(), body: { tenantId: b.tid, items: [{ productId: b.product.id, qty: 1 }], tipoComprobante: "TICKET", paymentMethod: "efectivo" } })).status).toBe(403);
    });
});

describe("workerId viene del token", () => {
    test("venta registra al dueño del token, no el workerId del body", async () => {
        await call("POST", "/cash/opening", { token: a.cashierToken, body: { tenantId: a.tid, workerId: a.cashier.id, amount: 0 } });
        const r = await call("POST", "/pos/sales", { token: a.cashierToken, body: { tenantId: a.tid, workerId: a.admin.id, items: [{ productId: a.product.id, qty: 1 }], tipoComprobante: "TICKET", paymentMethod: "efectivo" } });
        expect(r.status).toBe(201);
        expect((await prisma.sale.findUnique({ where: { id: r.json.data.sale.id } }))?.workerId).toBe(a.cashier.id);
    });
    test("movimiento de caja registra al dueño del token", async () => {
        const r = await call("POST", "/cash/movements", { token: a.cashierToken, body: { tenantId: a.tid, workerId: a.admin.id, type: "IN", amount: 2, currency: "PEN", reason: "qa" } });
        expect(r.status).toBe(201);
        expect((await prisma.cashMovement.findUnique({ where: { id: r.json.data.id } }))?.workerId).toBe(a.cashier.id);
    });
});

describe("configuración se refleja en checkout", () => {
    const newSession = async (dni: string) => {
        await call("POST", "/playzone/guardians", { token: a.cashierToken, body: { tenantId: a.tid, dni, fullName: "Apo", childName: "Nino", childAge: 5 } });
        const child = await prisma.child.findFirst({ where: { tenantId: a.tid, guardian: { dni } } });
        const s = await call("POST", "/playzone/sessions", { token: a.cashierToken, body: { tenantId: a.tid, childId: child!.id, durationMinutes: 30 } });
        return s.json.data.id as string;
    };
    const sell = (items: unknown[], tipo = "TICKET") =>
        call("POST", "/pos/sales", { token: a.cashierToken, body: { tenantId: a.tid, tipoComprobante: tipo, paymentMethod: "efectivo", items } });
    test("cambiar tarifa: la siguiente venta usa la nueva", async () => {
        await call("POST", "/cash/opening", { token: a.cashierToken, body: { tenantId: a.tid, workerId: a.cashier.id, amount: 0 } });
        const put = (price: number) => call("PUT", "/playzone/rates", { token: a.adminToken, body: { tenantId: a.tid, durations: [{ minutes: 30, price, label: "30 Min" }], extraPerMinute: 1, freePerMinute: 0.5 } });
        expect((await put(20)).status).toBe(200);
        const s1 = await newSession("70000011");
        expect(Number((await sell([{ productId: `pz-base-${s1}`, qty: 1 }])).json.data.sale.total)).toBe(20);
        expect((await put(25)).status).toBe(200);
        const s2 = await newSession("70000012");
        expect(Number((await sell([{ productId: `pz-base-${s2}`, qty: 1 }])).json.data.sale.total)).toBe(25);
    });
    test("facturación desactivada: BOLETA se registra sin emitir (PENDING_SUNAT, sin XML)", async () => {
        const r = await sell([{ productId: a.product.id, qty: 1 }], "BOLETA");
        expect(r.status).toBe(201);
        await Bun.sleep(800);
        const sale = await prisma.sale.findUnique({ where: { id: r.json.data.sale.id } });
        expect(sale?.status).toBe("PENDING_SUNAT");
        expect(sale?.sunatStatus).not.toBe("ACEPTADA");
    });
});
