// Sales racing a cash close: the frozen close must equal the sales that committed, and none may land after it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qarace"); });
afterAll(async () => { await dropTenant(c.tid); });

const sell = () =>
    call("POST", "/pos/sales", {
        token: c.cashierToken,
        body: { tenantId: c.tid, items: [{ productId: c.untracked.id, qty: 1 }], tipoComprobante: "TICKET", paymentMethod: "efectivo" },
    });

describe("venta vs cierre concurrentes", () => {
    test("el cierre congelado coincide con las ventas confirmadas; las tardías dan 409", async () => {
        await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, amount: 0 } });
        const close = () =>
            call("POST", "/cash/close", { token: c.cashierToken, body: { tenantId: c.tid, countedEfectivo: 0, countedYape: 0, countedTarjeta: 0 } });
        const results = await Promise.all([sell(), sell(), sell(), close(), sell(), sell(), sell()]);
        const sales = results.filter((_, i) => i !== 3);
        const ok = sales.filter((r) => r.status === 201).length;
        for (const r of sales) expect([201, 409]).toContain(r.status);
        const closed = results[3]!;
        expect(closed.status).toBe(201);
        const rec = (await prisma.cashClose.findFirst({ where: { tenantId: c.tid } }))!;
        const inDb = await prisma.sale.count({ where: { tenantId: c.tid } });
        expect(inDb).toBe(ok);
        expect(Number(rec.totalSales)).toBeCloseTo(ok * 3, 2); // untracked product costs 3
        expect((await sell()).status).toBe(409);
    });
});
