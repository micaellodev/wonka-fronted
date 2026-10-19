// Facturación con mock APISPeru (:3999, APISPERU_URL de .env.test) + cumpleaños.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => {
    const mock = await fetch("http://localhost:3999/__log").catch(() => null);
    if (!mock) throw new Error("Mock APISPeru no está corriendo en :3999 (bun scripts/mock-apisperu.ts)");
    c = await createTenant("qabill");
    await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 0 } });
});
afterAll(async () => { await dropTenant(c.tid); });

const boleta = (clientName = "Cliente QA") =>
    call("POST", "/pos/sales", {
        token: c.cashierToken,
        body: { tenantId: c.tid, workerId: c.cashier.id, items: [{ productId: c.product.id, qty: 1 }], tipoComprobante: "BOLETA", paymentMethod: "efectivo", clientDocType: "1", clientDocNumber: "45678912", clientName },
    });
const waitStatus = async (id: string, want: string, ms = 8000) => {
    const end = Date.now() + ms;
    let s: string | null | undefined;
    while (Date.now() < end) {
        s = (await prisma.sale.findUnique({ where: { id } }))?.sunatStatus;
        if (s === want) return s;
        await Bun.sleep(200);
    }
    return s;
};

describe("emisión y recuperación de pendientes", () => {
    let pendingId = "", acceptedId = "";
    test("facturación desactivada: boleta queda PENDING_SUNAT", async () => {
        const r = await boleta();
        expect(r.status).toBe(201);
        pendingId = r.json.data.sale.id;
        const s = await prisma.sale.findUnique({ where: { id: pendingId } });
        expect(s?.status).toBe("PENDING_SUNAT");
        expect(s?.sunatStatus ?? "PENDING_SUNAT").toBe("PENDING_SUNAT");
    });
    test("activar facturación (admin + adminPin) y recuperar pendientes → ACEPTADA", async () => {
        const p = await call("PATCH", "/dashboard/settings", { token: c.adminToken, query: { tenantId: c.tid }, body: { adminPin: c.adminPin, electronicInvoicingEnabled: true } });
        expect(p.status).toBe(200);
        const settings = await call("GET", "/dashboard/settings", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(JSON.stringify(settings.json)).not.toContain("qa-mock-token"); // token nunca se expone
        const r = await call("POST", "/billing/retry-pending", { token: c.adminToken, body: { tenantId: c.tid } });
        expect(r.status).toBe(200);
        expect(await waitStatus(pendingId, "ACEPTADA")).toBe("ACEPTADA");
        expect((await prisma.sale.findUnique({ where: { id: pendingId } }))?.status).toBe("ACTIVE");
    });
    test("pie de recibo: se guarda, se lee y vacío vuelve a null", async () => {
        const set = (receiptFooter: string) => call("PATCH", "/dashboard/settings", { token: c.adminToken, query: { tenantId: c.tid }, body: { adminPin: c.adminPin, receiptFooter } });
        const get = async () => (await call("GET", "/dashboard/settings", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data.receiptFooter;
        expect((await set("Gracias por su visita")).status).toBe(200);
        expect(await get()).toBe("Gracias por su visita");
        expect((await set("   ")).status).toBe(200);
        expect(await get()).toBeNull();
        expect((await set("x".repeat(301))).status).toBeGreaterThanOrEqual(400);
    });
    test("boleta con facturación activa → ACEPTADA", async () => {
        const r = await boleta();
        expect(r.status).toBe(201);
        acceptedId = r.json.data.sale.id;
        expect(await waitStatus(acceptedId, "ACEPTADA")).toBe("ACEPTADA");
    });
    test("SUNAT rechaza (MOCK_RECHAZO) → RECHAZADA, no reintenta", async () => {
        const r = await boleta("MOCK_RECHAZO QA");
        expect(r.status).toBe(201);
        expect(await waitStatus(r.json.data.sale.id, "RECHAZADA")).toBe("RECHAZADA");
    });
    test("anular boleta aceptada → nota de crédito emitida, stock restaurado", async () => {
        const before = (await prisma.product.findUnique({ where: { id: c.product.id } }))!.stock;
        const v = await call("POST", `/pos/sales/${acceptedId}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA NC" } });
        expect(v.status).toBe(201);
        const r = await call("POST", `/pos/void/${v.json.data.id}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBe(200);
        expect((await prisma.sale.findUnique({ where: { id: acceptedId } }))?.status).toBe("CANCELLED");
        expect((await prisma.product.findUnique({ where: { id: c.product.id } }))!.stock).toBe(before + 1);
        const note = await prisma.billingNote.findFirst({ where: { tenantId: c.tid, type: "CREDIT_NOTE" } });
        expect(note?.serie).toMatch(/^B/);
    });
});

describe("notas manuales", () => {
    const body = () => ({
        tenantId: c.tid, workerId: c.admin.id, approvalCode: c.approvalCode, type: "CREDIT_NOTE",
        modifiedDocumentSerie: "B001", modifiedDocumentCorrelative: "1", reasonCode: "01", reasonDescription: "Anulación QA", totalAmount: 5,
    });
    test("código de aprobación inválido → 401", async () => {
        const r = await call("POST", "/billing/notes", { token: c.adminToken, body: { ...body(), approvalCode: "000000" } });
        expect(r.status).toBe(401);
    });
    test("cajero → 403", async () => {
        expect((await call("POST", "/billing/notes", { token: c.cashierToken, body: body() })).status).toBe(403);
    });
    test("crear nota con código admin → DB y listado", async () => {
        const n0 = await prisma.billingNote.count({ where: { tenantId: c.tid } });
        const r = await call("POST", "/billing/notes", { token: c.adminToken, body: body() });
        expect(r.status).toBe(201);
        expect(await prisma.billingNote.count({ where: { tenantId: c.tid } })).toBe(n0 + 1);
        const list = await call("GET", "/billing/notes", { token: c.adminToken, query: { tenantId: c.tid } });
        expect(list.status).toBe(200);
        expect(JSON.stringify(list.json)).toContain("Anulación QA");
    });
});

describe("cumpleaños", () => {
    let resId = "";
    test("crear reserva con invitados para apoderado", async () => {
        const g = await call("POST", "/playzone/guardians", { token: c.cashierToken, body: { tenantId: c.tid, dni: "70000002", fullName: "Mamá QA", childName: "Cumpleañero QA" } });
        expect(g.status).toBe(201);
        const guardianId = g.json.data.id ?? g.json.data.guardian?.id;
        const r = await call("POST", "/birthdays", { token: c.cashierToken, body: { tenantId: c.tid, guardianId, date: new Date(Date.now() + 86400000).toISOString(), guestCount: 3, notes: "QA" } });
        expect(r.status).toBe(201);
        resId = r.json.data.id;
        expect(await prisma.birthdayGuest.count({ where: { reservationId: resId } })).toBe(3);
    });
    test("listar y detalle", async () => {
        const l = await call("GET", "/birthdays", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(l.json.data.some((x: any) => x.id === resId)).toBe(true);
        const d = await call("GET", `/birthdays/${resId}`, { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(d.json.data.guests).toHaveLength(3);
    });
    test("actualizar invitado (nombre + asistió) → DB", async () => {
        const guest = (await prisma.birthdayGuest.findFirst({ where: { reservationId: resId } }))!;
        const r = await call("PATCH", `/birthdays/${resId}/guests/${guest.id}`, { token: c.cashierToken, query: { tenantId: c.tid }, body: { firstName: "Ana", attended: true } });
        expect(r.status).toBe(200);
        expect(await prisma.birthdayGuest.findUnique({ where: { id: guest.id } })).toMatchObject({ firstName: "Ana", attended: true });
    });
    test("reserva de otro tenant → 403/404", async () => {
        const r = await call("GET", `/birthdays/${resId}`, { token: c.cashierToken, query: { tenantId: "wonka_main_store_001" } });
        expect([403, 404]).toContain(r.status);
    });
});
