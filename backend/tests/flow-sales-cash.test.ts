// End-to-end day: apertura → ventas (producto, venta libre, zona de juegos) → anulación → movimientos → cierre → aprobación.
// Tests in this file are sequential and share one fresh tenant.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
const stockOf = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock;
const sell = (items: unknown[], extra: Record<string, unknown> = {}) =>
    call("POST", "/pos/sales", {
        token: c.cashierToken,
        body: { tenantId: c.tid, workerId: c.cashier.id, items, tipoComprobante: "TICKET", paymentMethod: "efectivo", ...extra },
    });

beforeAll(async () => { c = await createTenant("qaflow"); });
afterAll(async () => { await dropTenant(c.tid); });

describe("apertura de caja", () => {
    test("sin apertura: opening-today = false; cierre → 409", async () => {
        const r = await call("GET", "/cash/opening-today", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        expect(r.json.data.isOpened).toBe(false);
        const close = await call("POST", "/cash/close", {
            token: c.cashierToken,
            body: { tenantId: c.tid, workerId: c.cashier.id, countedEfectivo: 0, countedYape: 0, countedTarjeta: 0 },
        });
        expect(close.status).toBe(409);
    });
    test("abrir caja con 100 → movimiento OPENING en DB; segunda apertura 409", async () => {
        const r = await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 100 } });
        expect(r.status).toBe(201);
        const mov = await prisma.cashMovement.findMany({ where: { tenantId: c.tid, type: "OPENING" } });
        expect(mov).toHaveLength(1);
        expect(Number(mov[0]!.amount)).toBe(100);
        const again = await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 50 } });
        expect(again.status).toBe(409);
        const today = await call("GET", "/cash/opening-today", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(today.json.data).toMatchObject({ isOpened: true, openingBalance: 100 });
    });
});

let saleProductId = "", pzSaleId = "", pzSessionId = "", freeSessionId = "";

describe("ventas", () => {
    test("ticket efectivo con producto: total desde DB, stock baja", async () => {
        const r = await sell([{ productId: c.product.id, qty: 2, unitPrice: 0.01 }]);
        expect(r.status).toBe(201);
        saleProductId = r.json.data.sale.id;
        expect(Number(r.json.data.sale.total)).toBe(10); // 2 × 5, unitPrice del cliente ignorado
        expect(await stockOf(c.product.id)).toBe(8);
        const sale = await prisma.sale.findUnique({ where: { id: saleProductId }, include: { items: true } });
        expect(sale?.status).toBe("ACTIVE");
        expect(sale?.serie).toBeNull();
    });
    test("workerId de la venta sale del token (no del body)", async () => {
        const r = await sell([{ productId: c.untracked.id, qty: 1 }], { workerId: c.admin.id, paymentMethod: "yape" });
        expect(r.status).toBe(201);
        expect((await prisma.sale.findUnique({ where: { id: r.json.data.sale.id } }))?.workerId).toBe(c.cashier.id);
    });
    test("producto sin control de stock: no cambia stock", async () => {
        const r = await sell([{ productId: c.untracked.id, qty: 3 }], { paymentMethod: "yape" });
        expect(r.status).toBe(201);
        expect(Number(r.json.data.sale.total)).toBe(9);
        expect(await stockOf(c.untracked.id)).toBe(0);
    });
    test("stock insuficiente → 409 y sin cambios", async () => {
        const r = await sell([{ productId: c.product.id, qty: 999 }]);
        expect(r.status).toBe(409);
        expect(await stockOf(c.product.id)).toBe(8);
    });
    test("producto de otro tenant → 404", async () => {
        const r = await sell([{ productId: "prod_inexistente_qa", qty: 1 }]);
        expect(r.status).toBe(404);
    });
    test("venta libre tarjeta: línea virtual sin productId", async () => {
        const r = await sell([{ productId: "free-sale-qa1", qty: 2, unitPrice: 4.5, label: "Limpieza" }], { paymentMethod: "tarjeta" });
        expect(r.status).toBe(201);
        expect(Number(r.json.data.sale.total)).toBe(9);
        const items = await prisma.saleItem.findMany({ where: { saleId: r.json.data.sale.id } });
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ isVirtual: true, productId: null, virtualLabel: "Limpieza" });
    });
    test("venta libre sin monto → 422", async () => {
        expect((await sell([{ productId: "free-sale-qa2", qty: 1 }])).status).toBe(422);
    });
    test("FACTURA sin RUC → 422; método de pago inválido → 422", async () => {
        expect((await sell([{ productId: c.untracked.id, qty: 1 }], { tipoComprobante: "FACTURA" })).status).toBe(422);
        expect((await sell([{ productId: c.untracked.id, qty: 1 }], { paymentMethod: "bitcoin" })).status).toBe(422);
    });
    test("BOLETA (facturación electrónica deshabilitada): serie B001 y correlativo", async () => {
        const r = await sell([{ productId: c.untracked.id, qty: 1 }], { tipoComprobante: "BOLETA", clientDocType: "1", clientDocNumber: "12345678", clientName: "Juan QA" });
        expect(r.status).toBe(201);
        const s = await prisma.sale.findUnique({ where: { id: r.json.data.sale.id } });
        expect(s?.serie).toBe("B001");
        expect(s?.correlativo).toMatch(/^\d+$/);
    });
});

describe("zona de juegos → venta", () => {
    test("admin configura tarifas; cajero no puede (403)", async () => {
        const rates = { tenantId: c.tid, durations: [{ minutes: 30, price: 17.5, label: "30 Min" }, { minutes: 60, price: 30, label: "1 Hora" }], extraPerMinute: 1, freePerMinute: 0.5 };
        expect((await call("PUT", "/playzone/rates", { token: c.cashierToken, body: rates })).status).toBe(403);
        const r = await call("PUT", "/playzone/rates", { token: c.adminToken, body: rates });
        expect(r.status).toBe(200);
        const g = await call("GET", "/playzone/rates", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(g.json.data.durations[0].price).toBe(17.5);
    });
    test("registrar apoderado+niño, iniciar sesión de 30 min con pulsera", async () => {
        const g = await call("POST", "/playzone/guardians", {
            token: c.cashierToken,
            body: { tenantId: c.tid, dni: "70000001", fullName: "Apoderado QA", childName: "Niño QA", childAge: 6 },
        });
        expect(g.status).toBe(201);
        const childId = g.json.data.children?.[0]?.id ?? (await prisma.child.findFirst({ where: { tenantId: c.tid } }))!.id;
        const s = await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId, durationMinutes: 30 } });
        expect(s.status).toBe(201);
        pzSessionId = s.json.data.id;
        expect(s.json.data.wristbandCode).toMatch(/^\d{3}$/);
        const lookup = await call("GET", "/playzone/sessions/lookup", { token: c.cashierToken, query: { tenantId: c.tid, code: s.json.data.wristbandCode } });
        expect(lookup.status).toBe(200);
        // un niño solo puede tener una sesión activa
        const dup = await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId } });
        expect(dup.status).toBe(422);
        const sib = await call("POST", `/playzone/guardians/${g.json.data.id}/children`, { token: c.cashierToken, body: { tenantId: c.tid, guardianId: g.json.data.id, fullName: "Hermana QA", age: 4 } });
        expect(sib.status).toBe(201);
        const free = await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId: sib.json.data.id } });
        expect(free.status).toBe(201);
        freeSessionId = free.json.data.id;
    });
    test("duración sin tarifa → rechazada", async () => {
        const child = (await prisma.child.findFirst({ where: { tenantId: c.tid } }))!;
        const r = await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId: child.id, durationMinutes: 7 } });
        expect([400, 422]).toContain(r.status);
    });
    test("venta producto + cargo base: precio del backend, una sola línea, sin stock", async () => {
        const before = await stockOf(c.product.id);
        const r = await sell([{ productId: c.product.id, qty: 1 }, { productId: `pz-base-${pzSessionId}`, qty: 1, unitPrice: 0.01 }]);
        expect(r.status).toBe(201);
        pzSaleId = r.json.data.sale.id;
        expect(Number(r.json.data.sale.total)).toBe(22.5); // 5 + 17.5
        expect(await stockOf(c.product.id)).toBe(before - 1);
        const items = await prisma.saleItem.findMany({ where: { saleId: pzSaleId } });
        expect(items).toHaveLength(2);
        const pz = items.filter((i) => i.isVirtual);
        expect(pz).toHaveLength(1);
        expect(pz[0]).toMatchObject({ productId: null, virtualSku: `pz-base-${pzSessionId}` });
        expect(Number(pz[0]!.unitPrice)).toBe(17.5);
    });
    test("cobrar el mismo cargo otra vez → 422; duplicado en la misma venta → 422", async () => {
        expect((await sell([{ productId: `pz-base-${pzSessionId}`, qty: 1 }])).status).toBe(409);
        expect([409, 422]).toContain((await sell([{ productId: `pz-free-${freeSessionId}`, qty: 1 }, { productId: `pz-free-${freeSessionId}`, qty: 1 }])).status);
    });
    test("sesión libre activa no se puede cobrar; al completar se cobra ≥1 min a 0.5", async () => {
        expect((await sell([{ productId: `pz-free-${freeSessionId}`, qty: 1 }])).status).toBe(422);
        const done = await call("PATCH", `/playzone/sessions/${freeSessionId}/complete`, { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(done.status).toBe(200);
        const r = await sell([{ productId: `pz-free-${freeSessionId}`, qty: 1 }], { paymentMethod: "yape" });
        expect(r.status).toBe(201);
        expect(Number(r.json.data.sale.total)).toBeGreaterThanOrEqual(0.5);
        const ps = await prisma.playSession.findUnique({ where: { id: freeSessionId } });
        expect(ps?.status).toBe("COMPLETED");
    });
    test("detalle de venta muestra el cargo una sola vez", async () => {
        const r = await call("GET", `/pos/sales/${pzSaleId}`, { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        expect(r.json.data.items).toHaveLength(2);
        expect(r.json.data.items.filter((i: any) => JSON.stringify(i).includes(`pz-base-${pzSessionId}`))).toHaveLength(1);
        expect(Number(r.json.data.total)).toBe(22.5);
    });
});

describe("anulación", () => {
    let reqReject = "", reqApprove = "";
    test("cajero solicita anulación → PENDING", async () => {
        const r = await call("POST", `/pos/sales/${saleProductId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA rechazo" } });
        expect(r.status).toBe(201);
        reqReject = r.json.data.id;
        expect((await prisma.voidRequest.findUnique({ where: { id: reqReject } }))?.status).toBe("PENDING");
    });
    test("cajero no puede listar/resolver anulaciones → 403", async () => {
        expect((await call("GET", "/pos/void", { token: c.cashierToken, query: { tenantId: c.tid } })).status).toBe(403);
        const r = await call("POST", `/pos/void/${reqReject}/resolve`, { token: c.cashierToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBe(403);
    });
    test("código de aprobación inválido → error, venta intacta", async () => {
        const r = await call("POST", `/pos/void/${reqReject}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: "000000", approve: true } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect((await prisma.sale.findUnique({ where: { id: saleProductId } }))?.status).toBe("ACTIVE");
    });
    test("rechazar → REJECTED, venta y stock intactos", async () => {
        const before = await stockOf(c.product.id);
        const r = await call("POST", `/pos/void/${reqReject}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: false } });
        expect(r.status).toBe(200);
        expect((await prisma.voidRequest.findUnique({ where: { id: reqReject } }))?.status).toBe("REJECTED");
        expect((await prisma.sale.findUnique({ where: { id: saleProductId } }))?.status).toBe("ACTIVE");
        expect(await stockOf(c.product.id)).toBe(before);
    });
    test("aprobar anulación de venta con producto + zona: stock vuelve solo del producto", async () => {
        const before = await stockOf(c.product.id);
        const r0 = await call("POST", `/pos/sales/${pzSaleId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA aprobar" } });
        expect(r0.status).toBe(201);
        reqApprove = r0.json.data.id;
        const list = await call("GET", "/pos/void", { token: c.adminToken, query: { tenantId: c.tid, status: "PENDING" } });
        expect(list.json.data.some((v: any) => v.id === reqApprove)).toBe(true);
        const r = await call("POST", `/pos/void/${reqApprove}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBe(200);
        expect((await prisma.sale.findUnique({ where: { id: pzSaleId } }))?.status).toBe("CANCELLED");
        expect(await stockOf(c.product.id)).toBe(before + 1);
        expect(await prisma.product.count({ where: { tenantId: c.tid, sku: { startsWith: "pz-" } } })).toBe(0);
    });
    test("doble aprobación → error, stock no se restaura dos veces", async () => {
        const before = await stockOf(c.product.id);
        const r = await call("POST", `/pos/void/${reqApprove}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(await stockOf(c.product.id)).toBe(before);
    });
    test("tras anular, el cargo de zona puede volver a cobrarse", async () => {
        const r = await sell([{ productId: `pz-base-${pzSessionId}`, qty: 1 }]);
        expect(r.status).toBe(201);
        expect(Number(r.json.data.sale.total)).toBe(17.5);
    });
});

let movId = "";
describe("movimientos de caja", () => {
    test("ingreso 20 PEN y egreso 5 PEN → DB", async () => {
        const a = await call("POST", "/cash/movements", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, type: "IN", amount: 20, currency: "PEN", reason: "QA ingreso" } });
        expect(a.status).toBe(201);
        const b = await call("POST", "/cash/movements", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, type: "OUT", amount: 5, currency: "PEN", reason: "QA egreso" } });
        expect(b.status).toBe(201);
        movId = b.json.data.id;
        expect(await prisma.cashMovement.count({ where: { tenantId: c.tid, type: { in: ["IN", "OUT"] } } })).toBe(2);
    });
    test("tipo inválido / monto 0 rechazados", async () => {
        const r = await call("POST", "/cash/movements", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, type: "HACK", amount: 1, currency: "PEN", reason: "x" } });
        expect([400, 422]).toContain(r.status);
        const z = await call("POST", "/cash/movements", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, type: "IN", amount: 0, currency: "PEN", reason: "x" } });
        expect([400, 422]).toContain(z.status);
    });
    test("listar movimientos", async () => {
        const r = await call("GET", "/cash/movements", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        expect(r.json.data.length).toBeGreaterThanOrEqual(2);
    });
    test("borrar: cajero 403, apertura no borrable, admin borra egreso", async () => {
        expect((await call("DELETE", `/cash/movements/${movId}`, { token: c.cashierToken, query: { tenantId: c.tid } })).status).toBe(403);
        const opening = (await prisma.cashMovement.findFirst({ where: { tenantId: c.tid, type: "OPENING" } }))!;
        expect((await call("DELETE", `/cash/movements/${opening.id}`, { token: c.adminToken, query: { tenantId: c.tid } })).status).toBeGreaterThanOrEqual(400);
        expect((await call("DELETE", `/cash/movements/${movId}`, { token: c.adminToken, query: { tenantId: c.tid } })).status).toBe(200);
        expect(await prisma.cashMovement.findUnique({ where: { id: movId } })).toBeNull();
    });
});

describe("resumen y cierre", () => {
    test("resumen del turno = suma de ventas no anuladas por método, zona una sola vez", async () => {
        const r = await call("GET", "/cash/summary", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        const sales = await prisma.sale.findMany({ where: { tenantId: c.tid, status: { not: "CANCELLED" } } });
        const by = (m: string) => sales.filter((s) => s.paymentMethod === m).reduce((a, s) => a + Number(s.total), 0);
        const d = r.json.data;
        expect(d.sales.efectivo).toBeCloseTo(by("efectivo"), 2);
        expect(d.sales.yape).toBeCloseTo(by("yape"), 2);
        expect(d.sales.tarjeta).toBeCloseTo(by("tarjeta"), 2);
        expect(d.cancelled.count).toBe(1);
        expect(d.expected.efectivo).toBeCloseTo(100 + by("efectivo") + 20, 2);
        // the re-sold pz-base charge counts exactly once among active sales
        const pzLines = await prisma.saleItem.count({ where: { virtualSku: `pz-base-${pzSessionId}`, sale: { status: { not: "CANCELLED" } } } });
        expect(pzLines).toBe(1);
    });
    let closeId = "";
    test("cerrar caja: esperado calculado en servidor → PENDING_APPROVAL", async () => {
        const sum = (await call("GET", "/cash/summary", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data;
        const r = await call("POST", "/cash/close", {
            token: c.cashierToken,
            body: { tenantId: c.tid, workerId: c.cashier.id, countedEfectivo: sum.expected.efectivo - 1, countedYape: sum.expected.yape, countedTarjeta: sum.expected.tarjeta },
        });
        expect(r.status).toBe(201);
        closeId = r.json.data.id;
        const row = await prisma.cashClose.findUnique({ where: { id: closeId } });
        expect(row?.status).toBe("PENDING_APPROVAL");
        expect(Number(row?.difference)).toBeCloseTo(-1, 2);
    });
    test("aprobar con código inválido → 403", async () => {
        const r = await call("POST", `/cash/close/${closeId}/approve`, { token: c.cashierToken, body: { tenantId: c.tid, approverCode: "999999" } });
        expect(r.status).toBe(403);
        expect((await prisma.cashClose.findUnique({ where: { id: closeId } }))?.status).toBe("PENDING_APPROVAL");
    });
    test("aprobar desde otro tenant → 403", async () => {
        const r = await call("POST", `/cash/close/${closeId}/approve`, { token: c.cashierToken, body: { tenantId: "wonka_main_store_001", approverCode: "060904" } });
        expect(r.status).toBe(403);
    });
    test("aprobar con código admin → APPROVED", async () => {
        const r = await call("POST", `/cash/close/${closeId}/approve`, { token: c.cashierToken, body: { tenantId: c.tid, approverCode: c.approvalCode } });
        expect(r.status).toBe(200);
        const row = await prisma.cashClose.findUnique({ where: { id: closeId } });
        expect(row?.status).toBe("APPROVED");
        expect(row?.approvedByWorkerId).toBe(c.admin.id);
    });
    test("historial y reportes: cierre aparece una vez", async () => {
        const h = await call("GET", "/cash/history", { token: c.adminToken, query: { tenantId: c.tid, days: 7 } });
        expect(h.status).toBe(200);
        expect(h.json.data.filter((x: any) => x.id === closeId)).toHaveLength(1);
        const rep = await call("GET", "/playzone/reports/summary", { token: c.adminToken, query: { tenantId: c.tid, days: 7 } });
        expect(rep.status).toBe(200);
        const m = await call("GET", "/dashboard/metrics", { token: c.adminToken, query: { tenantId: c.tid } });
        expect(m.status).toBe(200);
    });
});
