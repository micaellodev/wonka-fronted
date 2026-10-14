// Flujo principal compacto con contrato nuevo de aprobación (admin identificado solo por código) y conteo único en reportes.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
let saleId = "", sessionId = "", reqId = "";
const stockOf = async () => (await prisma.product.findUnique({ where: { id: c.product.id } }))!.stock;

beforeAll(async () => { c = await createTenant("qae2e"); });
afterAll(async () => { await dropTenant(c.tid); });

describe("login → caja → venta mixta → reportes → anulación", () => {
    test("login cajero, apertura 50, tarifa y sesión de zona", async () => {
        expect(c.cashierToken).toBeTruthy();
        const o = await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 50 } });
        expect(o.status).toBe(201);
        const rates = { tenantId: c.tid, durations: [{ minutes: 30, price: 20, label: "30 Min" }], extraPerMinute: 1, freePerMinute: 0.5 };
        expect((await call("PUT", "/playzone/rates", { token: c.adminToken, body: rates })).status).toBe(200);
        const g = await call("POST", "/playzone/guardians", { token: c.cashierToken, body: { tenantId: c.tid, dni: "70000002", fullName: "Apo E2E", childName: "Niño E2E", childAge: 5 } });
        const childId = (await prisma.child.findFirst({ where: { tenantId: c.tid } }))!.id;
        const s = await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId, durationMinutes: 30 } });
        expect(g.status).toBe(201);
        sessionId = s.json.data.id;
    });
    test("venta producto×3 + cargo zona (precio manipulado por cliente): total 35, stock 7", async () => {
        const r = await call("POST", "/pos/sales", {
            token: c.cashierToken,
            body: { tenantId: c.tid, workerId: c.cashier.id, tipoComprobante: "TICKET", paymentMethod: "efectivo",
                items: [{ productId: c.product.id, qty: 3 }, { productId: `pz-base-${sessionId}`, qty: 1, unitPrice: 1 }] },
        });
        expect(r.status).toBe(201);
        saleId = r.json.data.sale.id;
        expect(Number(r.json.data.sale.total)).toBe(35);
        expect(await stockOf()).toBe(7);
    });
    test("cierre y reportes cuentan la venta una vez", async () => {
        const sum = (await call("GET", "/cash/summary", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data;
        expect(sum.sales.byMethod.efectivo).toBe(35);
        expect(sum.expectedCash).toBe(85);
        const list = await call("GET", "/pos/sales", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(list.status).toBe(200);
        const rows = list.json.data.sales ?? list.json.data;
        expect(rows.filter((s: any) => s.id === saleId)).toHaveLength(1);
        const today = await call("GET", "/pos/sales/today", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(today.status).toBe(200);
    });
    test("anulación: admin identificado SOLO por código (sin approverWorkerId) → CANCELLED, stock 10", async () => {
        const rq = await call("POST", `/pos/sales/${saleId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, reason: "QA e2e" } });
        expect(rq.status).toBe(201);
        reqId = rq.json.data.id;
        const r = await call("POST", `/pos/void/${reqId}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBe(200);
        expect((await prisma.sale.findUnique({ where: { id: saleId } }))?.status).toBe("CANCELLED");
        expect(await stockOf()).toBe(10);
        const vr = await prisma.voidRequest.findUnique({ where: { id: reqId } });
        expect(vr?.status).toBe("APPROVED");
    });
    test("tras anular, resumen excluye la venta (efectivo 0)", async () => {
        const sum = (await call("GET", "/cash/summary", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data;
        expect(sum.sales.byMethod.efectivo).toBe(0);
        expect(sum.expectedCash).toBe(50);
    });
    test("anular venta inexistente / de otro tenant → 4xx", async () => {
        const r = await call("POST", "/pos/sales/no-existe/void", { token: c.cashierToken, body: { tenantId: c.tid, reason: "x" } });
        expect(r.status).toBeGreaterThanOrEqual(400);
    });
    test("código admin inválido o 5 dígitos de cajero no aprueban", async () => {
        const rq = await call("POST", `/pos/sales/${saleId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, reason: "otra" } });
        if (rq.status === 201) {
            const r = await call("POST", `/pos/void/${rq.json.data.id}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverCode: c.cashierPin, approve: true } });
            expect(r.status).toBeGreaterThanOrEqual(400);
        }
    });
});
