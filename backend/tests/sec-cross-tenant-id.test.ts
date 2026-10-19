// A (token+tenantId propios) ataca recursos de B por :id. Espera 4xx y B intacto.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let a: Ctx, b: Ctx, bSaleId = "", bMoveId = "";
beforeAll(async () => {
    a = await createTenant("xtA"); b = await createTenant("xtB");
    await call("POST", "/cash/opening", { token: b.cashierToken, body: { tenantId: b.tid, workerId: b.cashier.id, amount: 50 } });
    const s = await call("POST", "/pos/sales", { token: b.cashierToken, body: { tenantId: b.tid, workerId: b.cashier.id, tipoComprobante: "TICKET", paymentMethod: "efectivo", items: [{ productId: b.product.id, qty: 1 }] } });
    bSaleId = s.json.data.sale.id;
    bMoveId = (await prisma.cashMovement.create({ data: { tenantId: b.tid, workerId: b.cashier.id, type: "INCOME", amount: 1, reason: "qa" } as any })).id;
});
afterAll(async () => { await dropTenant(a.tid); await dropTenant(b.tid); });
const bad = (s: number) => expect(s).toBeGreaterThanOrEqual(400);
const bStock = async () => (await prisma.product.findUnique({ where: { id: b.product.id } }))!.stock;

describe("pos", () => {
    test("GET /sales/:id ajeno -> 404", async () => {
        const r = await call("GET", `/pos/sales/${bSaleId}`, { token: a.adminToken, query: { tenantId: a.tid } });
        expect(r.status).toBe(404);
    });
    test("POST /sales/:id/void ajeno -> 4xx, sin VoidRequest", async () => {
        const r = await call("POST", `/pos/sales/${bSaleId}/void`, { token: a.cashierToken, body: { tenantId: a.tid, reason: "x" } });
        bad(r.status);
        expect(await prisma.voidRequest.count({ where: { saleId: bSaleId } })).toBe(0);
    });
    test("POST /sales/:id/email ajeno -> 4xx", async () => {
        bad((await call("POST", `/pos/sales/${bSaleId}/email`, { token: a.adminToken, body: { tenantId: a.tid, email: "a@b.co" } })).status);
    });
});

describe("inventory", () => {
    test("PATCH /products/:id ajeno -> 4xx, precio intacto", async () => {
        bad((await call("PATCH", `/inventory/products/${b.product.id}`, { token: a.adminToken, query: { tenantId: a.tid }, body: { price: 999 } })).status);
        expect(Number((await prisma.product.findUnique({ where: { id: b.product.id } }))!.price)).toBe(5);
    });
    test("POST /products/:id/stock ajeno -> 4xx, stock intacto", async () => {
        const before = await bStock();
        bad((await call("POST", `/inventory/products/${b.product.id}/stock`, { token: a.adminToken, body: { tenantId: a.tid, type: "IN", quantity: 100, reason: "hack" } })).status);
        expect(await bStock()).toBe(before);
    });
    test("PATCH/DELETE /categories/:id ajeno -> 4xx, nombre intacto", async () => {
        bad((await call("PATCH", `/inventory/categories/${b.category.id}`, { token: a.adminToken, query: { tenantId: a.tid }, body: { name: "HACK" } })).status);
        bad((await call("DELETE", `/inventory/categories/${b.category.id}`, { token: a.adminToken, query: { tenantId: a.tid } })).status);
        expect((await prisma.category.findUnique({ where: { id: b.category.id } }))?.name).toBe("QA Cat");
    });
});

describe("cash", () => {
    test("DELETE /movements/:id ajeno -> 4xx, movimiento sigue", async () => {
        bad((await call("DELETE", `/cash/movements/${bMoveId}`, { token: a.adminToken, query: { tenantId: a.tid } })).status);
        expect(await prisma.cashMovement.count({ where: { id: bMoveId } })).toBe(1);
    });
    test("POST /close/:id/approve ajeno -> 4xx", async () => {
        bad((await call("POST", "/cash/close/nope-id/approve", { token: a.adminToken, body: { tenantId: a.tid, approverCode: a.approvalCode } })).status);
    });
});

describe("playzone", () => {
    test("POST /guardians/:id/children con guardian ajeno -> 4xx, sin hijo nuevo", async () => {
        const g = await call("POST", "/playzone/guardians", { token: b.cashierToken, body: { tenantId: b.tid, dni: "70000099", fullName: "Apo B", childName: "Niño B", childAge: 5 } });
        const gid = g.json.data?.guardian?.id ?? g.json.data?.id;
        const before = await prisma.child.count({ where: { tenantId: b.tid } });
        bad((await call("POST", `/playzone/guardians/${gid}/children`, { token: a.cashierToken, body: { tenantId: a.tid, fullName: "Intruso" } })).status);
        expect(await prisma.child.count({ where: { tenantId: b.tid } })).toBe(before);
    });
    test("PATCH /sessions/:id/complete ajeno -> 4xx, sesión sigue activa", async () => {
        const ch = (await prisma.child.findFirst({ where: { tenantId: b.tid } }))!;
        await call("PUT", "/playzone/rates", { token: b.adminToken, body: { tenantId: b.tid, durations: [{ minutes: 30, price: 20, label: "30 Min" }], extraPerMinute: 1, freePerMinute: 0.5 } });
        const s = await call("POST", "/playzone/sessions", { token: b.cashierToken, body: { tenantId: b.tid, childId: ch.id, durationMinutes: 30 } });
        const sid = s.json.data.id;
        const st = (await prisma.playSession.findUnique({ where: { id: sid } }))!.status;
        bad((await call("PATCH", `/playzone/sessions/${sid}/complete`, { token: a.cashierToken, query: { tenantId: a.tid } })).status);
        expect((await prisma.playSession.findUnique({ where: { id: sid } }))!.status).toBe(st);
    });
});

describe("ids reales de otro tenant", () => {
    test("cash: POST /close/:id/approve con cierre real ajeno -> 4xx, sigue PENDING_APPROVAL", async () => {
        const sum = (await call("GET", "/cash/summary", { token: b.cashierToken, query: { tenantId: b.tid } })).json.data;
        const c = await call("POST", "/cash/close", { token: b.cashierToken, body: { tenantId: b.tid, workerId: b.cashier.id, countedEfectivo: sum.expectedCash, countedYape: 0, countedTarjeta: 0 } });
        expect(c.status).toBe(201);
        const closeId = c.json.data.id;
        bad((await call("POST", `/cash/close/${closeId}/approve`, { token: a.adminToken, body: { tenantId: a.tid, approverCode: a.approvalCode } })).status);
        expect((await prisma.cashClose.findUnique({ where: { id: closeId } }))?.status).toBe("PENDING_APPROVAL");
    });
    test("birthday: GET /:id y PATCH invitado ajeno -> 4xx, invitado intacto", async () => {
        const g = await call("POST", "/playzone/guardians", { token: b.cashierToken, body: { tenantId: b.tid, dni: "70000098", fullName: "Apo B2", childName: "Niño B2", childAge: 6 } });
        const guardianId = g.json.data?.guardian?.id ?? g.json.data?.id;
        const r = await call("POST", "/birthdays", { token: b.cashierToken, body: { tenantId: b.tid, guardianId, date: new Date(Date.now() + 86400000).toISOString(), guestCount: 1 } });
        expect(r.status).toBe(201);
        const resId = r.json.data.id;
        const guest = (await prisma.birthdayGuest.findFirst({ where: { reservationId: resId } }))!;
        bad((await call("GET", `/birthdays/${resId}`, { token: a.cashierToken, query: { tenantId: a.tid } })).status);
        bad((await call("PATCH", `/birthdays/${resId}/guests/${guest.id}`, { token: a.cashierToken, query: { tenantId: a.tid }, body: { firstName: "HACK" } })).status);
        expect((await prisma.birthdayGuest.findUnique({ where: { id: guest.id } }))?.firstName).toBe(guest.firstName);
    });
});
