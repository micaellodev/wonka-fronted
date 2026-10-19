// Anular venta restaura stock solo de productos con trackStock.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qavoid"); });
afterAll(async () => { await dropTenant(c.tid); });
const stock = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock;

test("void restaura tracked (10->7->10), untracked queda en 0 sin movimiento", async () => {
    await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 10 } });
    const s = await call("POST", "/pos/sales", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, tipoComprobante: "TICKET", paymentMethod: "efectivo", items: [{ productId: c.product.id, qty: 3 }, { productId: c.untracked.id, qty: 2 }] } });
    expect(s.status).toBe(201);
    expect(await stock(c.product.id)).toBe(7);
    expect(await stock(c.untracked.id)).toBe(0);
    const rq = await call("POST", `/pos/sales/${s.json.data.sale.id}/void`, { token: c.cashierToken, body: { tenantId: c.tid, reason: "qa" } });
    const r = await call("POST", `/pos/void/${rq.json.data.id}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverCode: c.approvalCode, approve: true } });
    expect(r.status).toBe(200);
    expect(await stock(c.product.id)).toBe(10);
    expect(await stock(c.untracked.id)).toBe(0);
    expect(await prisma.stockMovement.count({ where: { productId: c.untracked.id } })).toBe(0);
});
