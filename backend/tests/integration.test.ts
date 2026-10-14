// Integración entre módulos (contrato docs/equipo/integracion-contrato.md): un día completo en un tenant
// desechable; en cada paso las cifras de caja, dashboard, reportes, historial y DB deben coincidir.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

const MOCK = "http://localhost:3999";
let c: Ctx;
const stockOf = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock;
const money = (n: number) => Math.round(n * 100) / 100;
const q = (extra: Record<string, string | number> = {}) => ({ tenantId: c.tid, ...extra });
const sell = (items: unknown[], extra: Record<string, unknown> = {}) =>
    call("POST", "/pos/sales", {
        token: c.cashierToken,
        body: { tenantId: c.tid, workerId: c.cashier.id, items, tipoComprobante: "TICKET", paymentMethod: "efectivo", ...extra },
    });
const summary = async () => {
    const r = await call("GET", "/cash/summary", { token: c.cashierToken, query: q() });
    expect(r.status).toBe(200);
    return r.json.data ?? r.json;
};
const today = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/** Compara todas las superficies de lectura con la DB y con el DaySummary. */
async function crossCheck(expected: { count: number; total: number; efectivo: number; yape: number; tarjeta: number; voidedCount: number; voidedTotal: number }) {
    const s = await summary();
    expect(s.sales.count).toBe(expected.count);
    expect(s.sales.total).toBeCloseTo(expected.total, 2);
    expect(s.sales.byMethod.efectivo).toBeCloseTo(expected.efectivo, 2);
    expect(s.sales.byMethod.yape).toBeCloseTo(expected.yape, 2);
    expect(s.sales.byMethod.tarjeta).toBeCloseTo(expected.tarjeta, 2);
    expect(s.voided.count).toBe(expected.voidedCount);
    expect(s.voided.total).toBeCloseTo(expected.voidedTotal, 2);
    const k = s.sales.byKind;
    expect(money(k.productos + k.zonaJuegos + k.ventaLibre)).toBeCloseTo(expected.total, 2);

    // DB
    const db = await prisma.sale.findMany({ where: { tenantId: c.tid, status: "ACTIVE" } });
    expect(db.length).toBe(expected.count);
    expect(money(db.reduce((a, x) => a + Number(x.total), 0))).toBeCloseTo(expected.total, 2);

    // dashboard/metrics (acepta forma vieja salesToday o DaySummary)
    const m = (await call("GET", "/dashboard/metrics", { token: c.adminToken, query: q() })).json.data;
    expect(m.salesToday?.count ?? m.sales?.count).toBe(expected.count);
    expect(m.salesToday?.amount ?? m.sales?.total).toBeCloseTo(expected.total, 2);

    // dashboard/sales-report
    const d = today();
    const rep = (await call("GET", "/dashboard/sales-report", { token: c.adminToken, query: q({ from: d, to: d }) })).json;
    expect(rep.summary.count).toBe(expected.count);
    expect(rep.summary.amount).toBeCloseTo(expected.total, 2);
    expect(rep.summary.byMethod.efectivo).toBeCloseTo(expected.efectivo, 2);
    expect(rep.summary.cancelledCount).toBe(expected.voidedCount);
    expect(rep.summary.cancelledAmount).toBeCloseTo(expected.voidedTotal, 2);

    // historial /pos/sales y /pos/sales/today: sin duplicados, mismos importes
    const hist = (await call("GET", "/pos/sales", { token: c.cashierToken, query: q({ limit: 500 }) })).json.data as any[];
    const tod = (await call("GET", "/pos/sales/today", { token: c.cashierToken, query: q() })).json.data as any[];
    for (const list of [hist, tod]) {
        expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
        const act = list.filter((x) => x.status !== "CANCELLED");
        expect(act.length).toBe(expected.count);
        expect(money(act.reduce((a, x) => a + Number(x.total), 0))).toBeCloseTo(expected.total, 2);
        expect(list.filter((x) => x.status === "CANCELLED").length).toBe(expected.voidedCount);
    }
    return s;
}

beforeAll(async () => {
    if (!(await fetch(`${MOCK}/__log`).catch(() => null))) throw new Error("Mock APISPeru no corre en :3999");
    c = await createTenant("qaint");
});
afterAll(async () => { await dropTenant(c.tid); });

let sessions: string[] = [];
let boletaSaleId = "";
let voidReqId = "";

describe("día completo", () => {
    test("0. NO_ABIERTA: todo en cero", async () => {
        const s = await summary();
        expect(s.cashStatus).toBe("NO_ABIERTA");
        expect(s.opening).toBeNull();
        expect(s.sales.count).toBe(0);
        expect(s.expectedCash).toBe(0);
        const m = (await call("GET", "/dashboard/metrics", { token: c.adminToken, query: q() })).json.data;
        expect(m.cashCloseStatus ?? m.cashStatus).toMatch(/NO_ABIERTA|NOT_OPENED/);
    });

    test("1. apertura 100 → ABIERTA; movimiento OPENING no cuenta como venta", async () => {
        const r = await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 100 } });
        expect(r.status).toBe(201);
        const s = await summary();
        expect(s.cashStatus).toBe("ABIERTA");
        expect(s.opening.amount).toBe(100);
        expect(s.expectedCash).toBeCloseTo(100, 2);
        expect(s.sales.count).toBe(0);
        // facturación electrónica activa (mock) para poder probar nota de crédito
        const p = await call("PATCH", "/dashboard/settings", { token: c.adminToken, query: q(), body: { adminPin: c.adminPin, electronicInvoicingEnabled: true } });
        expect(p.status).toBe(200);
    });

    test("2. venta producto 2×5 efectivo: stock 10→8, 1 sola vez en todas las superficies", async () => {
        const r = await sell([{ productId: c.product.id, qty: 2 }]);
        expect(r.status).toBe(201);
        expect(await stockOf(c.product.id)).toBe(8);
        const s = await crossCheck({ count: 1, total: 10, efectivo: 10, yape: 0, tarjeta: 0, voidedCount: 0, voidedTotal: 0 });
        expect(s.sales.byKind).toMatchObject({ productos: 10, zonaJuegos: 0, ventaLibre: 0 });
        expect(s.expectedCash).toBeCloseTo(110, 2);
    });

    test("3. venta libre 9 tarjeta: no toca stock ni cuenta como producto/zona", async () => {
        const r = await sell([{ productId: "free-sale-int1", qty: 2, unitPrice: 4.5, label: "Limpieza" }], { paymentMethod: "tarjeta" });
        expect(r.status).toBe(201);
        const s = await crossCheck({ count: 2, total: 19, efectivo: 10, yape: 0, tarjeta: 9, voidedCount: 0, voidedTotal: 0 });
        expect(s.sales.byKind).toMatchObject({ productos: 10, zonaJuegos: 0, ventaLibre: 9 });
        expect(s.expectedCash).toBeCloseTo(110, 2); // tarjeta no entra al efectivo
        expect(await stockOf(c.product.id)).toBe(8);
    });

    test("4. tiempo de niño (30 min a 17.5 configurada) yape: sin stock, 1 sola vez; el cobro no duplica", async () => {
        const rates = { tenantId: c.tid, durations: [{ minutes: 30, price: 17.5, label: "30 Min" }], extraPerMinute: 1, freePerMinute: 0.5 };
        expect((await call("PUT", "/playzone/rates", { token: c.adminToken, body: rates })).status).toBe(200);
        const g = await call("POST", "/playzone/guardians", { token: c.cashierToken, body: { tenantId: c.tid, dni: "70000099", fullName: "Apoderado INT", childName: "Niño A", childAge: 6 } });
        expect(g.status).toBe(201);
        const kid2 = await call("POST", `/playzone/guardians/${g.json.data.id}/children`, { token: c.cashierToken, body: { tenantId: c.tid, guardianId: g.json.data.id, fullName: "Niño B", age: 5 } });
        expect(kid2.status).toBe(201);
        const kids = await prisma.child.findMany({ where: { tenantId: c.tid }, orderBy: { createdAt: "asc" } });
        for (const k of kids) {
            const s = await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId: k.id, durationMinutes: 30 } });
            expect(s.status).toBe(201);
            sessions.push(s.json.data.id);
        }
        const stockBefore = await stockOf(c.product.id);
        const r = await sell([{ productId: `pz-base-${sessions[0]}`, qty: 1, unitPrice: 0.01 }], { paymentMethod: "yape" });
        expect(r.status).toBe(201);
        expect(Number(r.json.data.sale.total)).toBe(17.5);
        expect(await stockOf(c.product.id)).toBe(stockBefore);
        const s = await crossCheck({ count: 3, total: 36.5, efectivo: 10, yape: 17.5, tarjeta: 9, voidedCount: 0, voidedTotal: 0 });
        expect(s.sales.byKind).toMatchObject({ productos: 10, zonaJuegos: 17.5, ventaLibre: 9 });
        // cobrar de nuevo el mismo cargo: rechazado y nada cambia
        expect((await sell([{ productId: `pz-base-${sessions[0]}`, qty: 1 }], { paymentMethod: "yape" })).status).toBeGreaterThanOrEqual(400);
        expect((await summary()).sales.count).toBe(3);
        // reporte de zona de juegos: la sesión completada cuenta 1 vez
        expect((await call("PATCH", `/playzone/sessions/${sessions[0]}/complete`, { token: c.cashierToken, query: q() })).status).toBe(200);
        const pz = (await call("GET", "/playzone/reports/summary", { token: c.adminToken, query: q({ days: 7 }) })).json.data;
        expect(pz.completedSessions).toBe(1);
        const rev = pz.revenue ?? pz.totalRevenue ?? pz.amount;
        if (rev !== undefined) expect(Number(rev)).toBeCloseTo(17.5, 2);
    });

    test("5. ajuste de stock (+5): no es venta ni movimiento de caja", async () => {
        const r = await call("POST", `/inventory/products/${c.product.id}/stock`, { token: c.adminToken, body: { tenantId: c.tid, type: "ENTRADA", quantity: 5, reason: "QA reposición" } });
        expect(r.status).toBe(200);
        expect(await stockOf(c.product.id)).toBe(13);
        const s = await crossCheck({ count: 3, total: 36.5, efectivo: 10, yape: 17.5, tarjeta: 9, voidedCount: 0, voidedTotal: 0 });
        expect(s.movements.count).toBe(0);
        expect(await prisma.stockMovement.count({ where: { tenantId: c.tid, productId: c.product.id } })).toBeGreaterThanOrEqual(1);
    });

    test("6. movimientos IN 20 / OUT 5: afectan esperado, no son ventas", async () => {
        const a = await call("POST", "/cash/movements", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, type: "IN", amount: 20, currency: "PEN", reason: "QA ingreso" } });
        const b = await call("POST", "/cash/movements", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, type: "OUT", amount: 5, currency: "PEN", reason: "QA egreso" } });
        expect([a.status, b.status]).toEqual([201, 201]);
        const s = await crossCheck({ count: 3, total: 36.5, efectivo: 10, yape: 17.5, tarjeta: 9, voidedCount: 0, voidedTotal: 0 });
        expect(s.movements).toMatchObject({ in: 20, out: 5, count: 2 });
        expect(s.expectedCash).toBeCloseTo(100 + 10 + 20 - 5, 2);
        const list = (await call("GET", "/cash/movements", { token: c.cashierToken, query: q() })).json.data as any[];
        expect(list.filter((m) => m.type === "IN" || m.type === "OUT")).toHaveLength(2);
    });

    test("7. boleta (producto + tiempo de niño B) ACEPTADA", async () => {
        const stock = await stockOf(c.product.id);
        const r = await sell([{ productId: c.product.id, qty: 1 }, { productId: `pz-base-${sessions[1]}`, qty: 1 }], {
            tipoComprobante: "BOLETA", clientDocType: "1", clientDocNumber: "45678912", clientName: "Cliente INT",
        });
        expect(r.status).toBe(201);
        boletaSaleId = r.json.data.sale.id;
        expect(Number(r.json.data.sale.total)).toBe(22.5);
        expect(await stockOf(c.product.id)).toBe(stock - 1);
        const end = Date.now() + 8000;
        while (Date.now() < end && (await prisma.sale.findUnique({ where: { id: boletaSaleId } }))?.sunatStatus !== "ACEPTADA") await Bun.sleep(200);
        expect((await prisma.sale.findUnique({ where: { id: boletaSaleId } }))?.sunatStatus).toBe("ACEPTADA");
        const s = await crossCheck({ count: 4, total: 59, efectivo: 32.5, yape: 17.5, tarjeta: 9, voidedCount: 0, voidedTotal: 0 });
        expect(s.sales.byKind).toMatchObject({ productos: 15, zonaJuegos: 35, ventaLibre: 9 });
        expect(s.expectedCash).toBeCloseTo(100 + 32.5 + 20 - 5, 2);
    });

    test("8. solicitud de anulación: pendiente en /pos/void y en summary.pending; la venta sigue contando", async () => {
        const r = await call("POST", `/pos/sales/${boletaSaleId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA integración" } });
        expect(r.status).toBe(201);
        voidReqId = r.json.data.id;
        const list = (await call("GET", "/pos/void", { token: c.adminToken, query: q({ status: "PENDING" }) })).json.data as any[];
        expect(list.filter((v) => v.id === voidReqId)).toHaveLength(1);
        const s = await crossCheck({ count: 4, total: 59, efectivo: 32.5, yape: 17.5, tarjeta: 9, voidedCount: 0, voidedTotal: 0 });
        expect(s.pending.voids).toBe(1);
        const m = (await call("GET", "/dashboard/metrics", { token: c.adminToken, query: q() })).json.data;
        expect(m.pendingVoidRequests ?? m.pending?.voids).toBe(1);
    });

    test("9. aprobar anulación: CANCELLED, stock +1 (solo el producto), nota de crédito, cifras 1 vez", async () => {
        const stock = await stockOf(c.product.id);
        const r = await call("POST", `/pos/void/${voidReqId}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBe(200);
        const sale = await prisma.sale.findUnique({ where: { id: boletaSaleId } });
        expect(sale?.status).toBe("CANCELLED");
        expect(await stockOf(c.product.id)).toBe(stock + 1);
        expect(await prisma.product.count({ where: { tenantId: c.tid, sku: { startsWith: "pz-" } } })).toBe(0);
        const notes = await prisma.billingNote.findMany({ where: { tenantId: c.tid } });
        expect(notes).toHaveLength(1);
        expect(Number(notes[0]!.totalAmount)).toBe(22.5);
        const s = await crossCheck({ count: 3, total: 36.5, efectivo: 10, yape: 17.5, tarjeta: 9, voidedCount: 1, voidedTotal: 22.5 });
        expect(s.pending.voids).toBe(0);
        expect(s.sales.byKind).toMatchObject({ productos: 10, zonaJuegos: 17.5, ventaLibre: 9 });
        expect(s.expectedCash).toBeCloseTo(100 + 10 + 20 - 5, 2);
        // segunda aprobación no vuelve a restaurar ni a contar
        const again = await call("POST", `/pos/void/${voidReqId}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(again.status).toBeGreaterThanOrEqual(400);
        expect(await stockOf(c.product.id)).toBe(stock + 1);
        expect(await prisma.billingNote.count({ where: { tenantId: c.tid } })).toBe(1);
    });

    let closeId = "";
    test("10. cierre → PENDIENTE; cifras congeladas = summary", async () => {
        const before = await summary();
        const r = await call("POST", "/cash/close", {
            token: c.cashierToken,
            body: { tenantId: c.tid, workerId: c.cashier.id, countedEfectivo: money(before.expectedCash - 1), countedYape: before.sales.byMethod.yape, countedTarjeta: before.sales.byMethod.tarjeta },
        });
        expect(r.status).toBe(201);
        closeId = r.json.data.id;
        const row = await prisma.cashClose.findUnique({ where: { id: closeId } });
        expect(row?.status).toBe("PENDING_APPROVAL");
        expect(Number(row?.difference)).toBeCloseTo(-1, 2);
        const s = await summary();
        expect(s.cashStatus).toBe("PENDIENTE");
        expect(s.close).toMatchObject({ id: closeId, status: "PENDING_APPROVAL" });
        expect(s.pending.closes).toBe(1);
        expect(s.expectedCash).toBeCloseTo(before.expectedCash, 2);
        const m = (await call("GET", "/dashboard/metrics", { token: c.adminToken, query: q() })).json.data;
        expect(m.cashCloseStatus ?? m.cashStatus).toMatch(/PENDIENTE|PENDING_APPROVAL/);
        const h = (await call("GET", "/cash/history", { token: c.adminToken, query: q({ days: 7 }) })).json.data as any[];
        const rec = h.filter((x) => x.id === closeId);
        expect(rec).toHaveLength(1);
        expect(rec[0].openingBalance).toBeCloseTo(100, 2);
        expect(rec[0].totalSales).toBeCloseTo(s.sales.total, 2);
        expect(rec[0].difference).toBeCloseTo(-1, 2);
        // no se puede cerrar dos veces
        const dup = await call("POST", "/cash/close", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, countedEfectivo: 0, countedYape: 0, countedTarjeta: 0 } });
        expect(dup.status).toBeGreaterThanOrEqual(400);
        expect(await prisma.cashClose.count({ where: { tenantId: c.tid } })).toBe(1);
    });

    test("11. aprobar cierre → CERRADA; historial y panel coinciden; cifras no cambian", async () => {
        const bad = await call("POST", `/cash/close/${closeId}/approve`, { token: c.cashierToken, body: { tenantId: c.tid, approverCode: "999999" } });
        expect(bad.status).toBe(403);
        const r = await call("POST", `/cash/close/${closeId}/approve`, { token: c.cashierToken, body: { tenantId: c.tid, approverCode: c.approvalCode } });
        expect(r.status).toBe(200);
        const s = await crossCheck({ count: 3, total: 36.5, efectivo: 10, yape: 17.5, tarjeta: 9, voidedCount: 1, voidedTotal: 22.5 });
        expect(s.cashStatus).toBe("CERRADA");
        expect(s.close.status).toBe("APPROVED");
        expect(s.pending.closes).toBe(0);
        const m = (await call("GET", "/dashboard/metrics", { token: c.adminToken, query: q() })).json.data;
        expect(m.cashCloseStatus ?? m.cashStatus).toMatch(/CERRADA|APPROVED/);
        const h = (await call("GET", "/cash/history", { token: c.adminToken, query: q({ days: 7 }) })).json.data as any[];
        expect(h.find((x) => x.id === closeId).status).toBe("APPROVED");
        // reaprobar no duplica
        const again = await call("POST", `/cash/close/${closeId}/approve`, { token: c.cashierToken, body: { tenantId: c.tid, approverCode: c.approvalCode } });
        expect(again.status).toBeGreaterThanOrEqual(400);
    });
});

describe("permisos y aislamiento", () => {
    test("cajero no puede listar/resolver anulaciones ni ajustar stock; sin token 401", async () => {
        expect((await call("GET", "/pos/void", { token: c.cashierToken, query: q() })).status).toBe(403);
        expect((await call("POST", `/inventory/products/${c.product.id}/stock`, { token: c.cashierToken, body: { tenantId: c.tid, type: "ENTRADA", quantity: 1, reason: "x" } })).status).toBe(403);
        expect((await call("GET", "/cash/summary", { query: q() })).status).toBe(401);
    });
    test("cajero y admin ven el mismo /cash/summary; tenant ajeno 403 en todas las lecturas", async () => {
        const a = await call("GET", "/cash/summary", { token: c.adminToken, query: q() });
        const b = await call("GET", "/cash/summary", { token: c.cashierToken, query: q() });
        expect(a.status).toBe(200);
        expect(a.json).toEqual(b.json);
        const other = { tenantId: "wonka_main_store_001" };
        for (const p of ["/cash/summary", "/dashboard/metrics", "/pos/sales", "/pos/sales/today", "/cash/history", "/cash/movements", "/playzone/reports/summary"]) {
            expect((await call("GET", p, { token: c.adminToken, query: other })).status).toBe(403);
        }
        const rep = await call("GET", "/dashboard/sales-report", { token: c.adminToken, query: { ...other, from: today(), to: today() } });
        expect(rep.status).toBe(403);
    });
    test("tenant ajeno no puede anular ni mover caja en este tenant", async () => {
        const o = await createTenant("qaint2");
        try {
            const sale = await prisma.sale.findFirst({ where: { tenantId: c.tid } });
            const v = await call("POST", `/pos/sales/${sale!.id}/void`, { token: o.cashierToken, body: { tenantId: c.tid, workerId: o.cashier.id, reason: "x" } });
            expect(v.status).toBe(403);
            const mv = await call("POST", "/cash/movements", { token: o.cashierToken, body: { tenantId: c.tid, workerId: o.cashier.id, type: "IN", amount: 1, currency: "PEN", reason: "x" } });
            expect(mv.status).toBe(403);
            // el otro tenant no ve nuestras cifras
            const s = (await call("GET", "/cash/summary", { token: o.cashierToken, query: { tenantId: o.tid } })).json;
            expect((s.data ?? s).sales.count).toBe(0);
        } finally { await dropTenant(o.tid); }
    });
});
