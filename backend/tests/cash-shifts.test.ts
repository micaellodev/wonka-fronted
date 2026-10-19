// Varios turnos de caja por día: apertura → ventas → cierre → aprobación → nueva apertura. Sin cambiar la lógica de un turno.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qashift"); });
afterAll(() => dropTenant(c.tid));

const open = (amount: number) => call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount } });
const sell = () => call("POST", "/pos/sales", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, tipoComprobante: "TICKET", paymentMethod: "efectivo", items: [{ productId: c.product.id, qty: 1 }] } });
const summary = async () => (await call("GET", "/cash/summary", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data;
const close = async () => {
    const s = await summary();
    return call("POST", "/cash/close", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, countedEfectivo: s.expectedCash, countedYape: 0, countedTarjeta: 0 } });
};
const approve = (id: string) => call("POST", `/cash/close/${id}/approve`, { token: c.cashierToken, body: { tenantId: c.tid, approverCode: c.approvalCode } });

describe("turnos del mismo día", () => {
    let close1 = "", close2 = "";

    test("turno 1: abre, no se puede abrir otra vez mientras sigue abierto, vende", async () => {
        expect((await open(100)).status).toBe(201);
        expect((await open(50)).status).toBe(409);
        expect((await sell()).status).toBe(201);
        const s = await summary();
        expect(s).toMatchObject({ cashStatus: "ABIERTA", expectedCash: 105 });
        expect(s.shift.number).toBe(1);
    });

    test("cierre pendiente: no se abre turno nuevo hasta aprobarlo; no se vende", async () => {
        const r = await close();
        expect(r.status).toBe(201);
        close1 = r.json.data.id;
        expect((await summary()).cashStatus).toBe("PENDIENTE");
        expect((await open(50)).status).toBe(409);
        expect((await close()).status).toBe(409); // un cierre por turno
    });

    test("aprobado: CERRADA y las ventas se rechazan hasta abrir turno", async () => {
        expect((await approve(close1)).status).toBe(200);
        expect((await summary()).cashStatus).toBe("CERRADA");
        expect((await sell()).status).toBeGreaterThanOrEqual(400);
    });

    test("turno 2: se abre con su propia apertura; cifras del turno parten de cero, las del día acumulan", async () => {
        expect((await open(50)).status).toBe(201);
        let s = await summary();
        expect(s).toMatchObject({ cashStatus: "ABIERTA", expectedCash: 50 });
        expect(s.opening.amount).toBe(50);
        expect(s.shift).toMatchObject({ number: 2 });
        expect(s.shift.sales.total).toBe(0);
        expect(s.sales.total).toBe(5); // ventas del DÍA (panel "ventas hoy")
        expect((await sell()).status).toBe(201);
        s = await summary();
        expect(s.shift.sales.total).toBe(5);
        expect(s.sales.total).toBe(10);
        expect(s.expectedCash).toBe(55); // 50 + 5 de ESTE turno (no 105 + 5)
    });

    test("cierre del turno 2 congela solo sus cifras; mismo cajero puede cerrar dos veces el día", async () => {
        const r = await close();
        expect(r.status).toBe(201);
        close2 = r.json.data.id;
        expect(r.json.data).toMatchObject({ openingBalance: 50, totalSales: 5, expectedEfectivo: 55, totalExpected: 55 });
        expect((await approve(close2)).status).toBe(200);
        const rows = await prisma.cashClose.findMany({ where: { tenantId: c.tid }, orderBy: { createdAt: "asc" } });
        expect(rows.map((x) => [Number(x.openingBalance), Number(x.totalExpected), x.status])).toEqual([[100, 105, "APPROVED"], [50, 55, "APPROVED"]]);
    });

    test("historial: dos cierres del día; turno 3 se puede abrir y deja el día ABIERTA", async () => {
        const h = await call("GET", "/cash/history", { token: c.cashierToken, query: { tenantId: c.tid, days: 1 } });
        expect(h.json.data.length).toBe(2);
        expect((await open(20)).status).toBe(201);
        expect((await summary()).cashStatus).toBe("ABIERTA");
        expect((await call("GET", "/cash/opening-today", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data).toMatchObject({ isOpened: true, openingBalance: 20 });
    });
});
