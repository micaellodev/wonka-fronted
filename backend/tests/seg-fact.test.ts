// Facturación E2E con mock (modo error → retry), rate limit de código de aprobación y 404 de workers.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, MAIN_TENANT, prisma, type Ctx } from "./helpers.ts";

const MOCK = "http://localhost:3999";
const setMode = (mode: string) => fetch(`${MOCK}/__mode`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
let c: Ctx;
beforeAll(async () => {
    if (!(await fetch(`${MOCK}/__log`).catch(() => null))) throw new Error("Mock APISPeru no corre en :3999");
    c = await createTenant("qasegf");
    await call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, amount: 0 } });
    await call("PATCH", "/dashboard/settings", { token: c.adminToken, query: { tenantId: c.tid }, body: { adminPin: c.adminPin, electronicInvoicingEnabled: true } });
});
afterAll(async () => { await setMode("ok"); await dropTenant(c.tid); });

const boleta = () =>
    call("POST", "/pos/sales", {
        token: c.cashierToken,
        body: { tenantId: c.tid, workerId: c.cashier.id, items: [{ productId: c.product.id, qty: 1 }], tipoComprobante: "BOLETA", paymentMethod: "efectivo", clientDocType: "1", clientDocNumber: "45678912", clientName: "Cliente QA" },
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

describe("facturación E2E", () => {
    const ids: string[] = [];
    test("boleta → ACEPTADA", async () => {
        await setMode("ok");
        const r = await boleta();
        expect(r.status).toBe(201);
        ids.push(r.json.data.sale.id);
        expect(await waitStatus(ids[0]!, "ACEPTADA")).toBe("ACEPTADA");
    });
    test("mock en error → PENDING_SUNAT; retry-pending → ACEPTADA", async () => {
        await setMode("error");
        const r = await boleta();
        expect(r.status).toBe(201);
        const id = r.json.data.sale.id as string;
        ids.push(id);
        await Bun.sleep(1500);
        const s = await prisma.sale.findUnique({ where: { id } });
        expect(s?.status).toBe("PENDING_SUNAT");
        await setMode("ok");
        expect((await call("POST", "/billing/retry-pending", { token: c.adminToken, body: { tenantId: c.tid } })).status).toBe(200);
        expect(await waitStatus(id, "ACEPTADA")).toBe("ACEPTADA");
    });
    test("anulación → nota de crédito; correlativos sin duplicar", async () => {
        const v = await call("POST", `/pos/sales/${ids[0]}/void`, { token: c.cashierToken, body: { tenantId: c.tid, workerId: c.cashier.id, reason: "QA NC" } });
        expect(v.status).toBe(201);
        const r = await call("POST", `/pos/void/${v.json.data.id}/resolve`, { token: c.adminToken, body: { tenantId: c.tid, approverWorkerId: c.admin.id, approverCode: c.approvalCode, approve: true } });
        expect(r.status).toBe(200);
        const note = await prisma.billingNote.findFirst({ where: { tenantId: c.tid, type: "CREDIT_NOTE" } });
        expect(note?.serie).toMatch(/^B/);
        const sales = await prisma.sale.findMany({ where: { tenantId: c.tid, id: { in: ids } }, select: { serie: true, correlativo: true } });
        const keys = sales.map((s) => `${s.serie}-${s.correlativo}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("rate limit código de aprobación", () => {
    test("intentos fallidos repetidos → 429", async () => {
        const body = { tenantId: c.tid, workerId: c.admin.id, approvalCode: "000000", type: "CREDIT_NOTE", modifiedDocumentSerie: "B001", modifiedDocumentCorrelative: "1", reasonCode: "01", reasonDescription: "QA rate", totalAmount: 5 };
        const codes: number[] = []; const first = await call("POST", "/billing/notes", { token: c.adminToken, body });
        for (let i = 0; i < 12; i++) codes.push((await call("POST", "/billing/notes", { token: c.adminToken, body })).status);
        expect(codes[0], JSON.stringify(first.json)).toBe(401);
        expect(codes).toContain(429);
    });
});

describe("workers inexistentes / de otro tenant → 404", () => {
    test("PATCH id inexistente", async () => {
        const r = await call("PATCH", "/hr/workers/nope", { token: c.adminToken, query: { tenantId: c.tid }, body: { adminPin: c.adminPin, name: "x" } });
        expect(r.status).toBe(404);
    });
    test("PATCH worker de otro tenant", async () => {
        const other = await prisma.worker.findFirst({ where: { tenantId: MAIN_TENANT } });
        const r = await call("PATCH", `/hr/workers/${other!.id}`, { token: c.adminToken, query: { tenantId: c.tid }, body: { adminPin: c.adminPin, name: "x" } });
        expect(r.status).toBe(404);
        expect((await prisma.worker.findUnique({ where: { id: other!.id } }))?.name).not.toBe("x");
    });
    test("DELETE worker inexistente / ajeno nunca 2xx", async () => {
        const other = await prisma.worker.findFirst({ where: { tenantId: MAIN_TENANT } });
        for (const id of ["nope", other!.id]) {
            const r = await call("DELETE", `/hr/workers/${id}`, { token: c.adminToken, query: { tenantId: c.tid } });
            expect(r.status).toBe(404);
        }
    });
});

describe("consultas DNI/RUC (mock)", () => {
    const q = () => ({ token: c.cashierToken, query: { tenantId: c.tid } });
    test("DNI válido", async () => {
        const r = await call("GET", "/apisperu/dni/45678912", q());
        expect(r.status).toBe(200);
        expect(r.json.data.numero).toBe("45678912");
        expect(r.json.data.nombreCompleto ?? r.json.data.nombre_completo ?? JSON.stringify(r.json)).toContain("PEREZ");
    });
    test("DNI inválido → error", async () => {
        const r = await call("GET", "/apisperu/dni/1234567X", q());
        expect(r.status).toBeGreaterThanOrEqual(400);
    });
    test("RUC válido", async () => {
        const r = await call("GET", "/apisperu/ruc/20123456789", q());
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.json)).toContain("EMPRESA MOCK SAC");
    });
    test("RUC inválido → error", async () => {
        const r = await call("GET", "/apisperu/ruc/2012345678X", q());
        expect(r.status).toBeGreaterThanOrEqual(400);
    });
});
