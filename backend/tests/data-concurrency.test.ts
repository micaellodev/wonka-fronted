// Datos/perf: concurrencia (apertura, aprobación, pulseras) y topes de listas.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qadata"); });
afterAll(async () => { await dropTenant(c.tid); });

const today = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

describe("caja", () => {
    test("apertura doble concurrente: una 201, el resto 409", async () => {
        const open = () => call("POST", "/cash/opening", { token: c.cashierToken, body: { tenantId: c.tid, amount: 10 } });
        const res = await Promise.all([open(), open(), open(), open(), open()]);
        expect(res.filter((r) => r.status === 201).length).toBe(1);
        expect(res.filter((r) => r.status === 409).length).toBe(4);
        expect(await prisma.cashMovement.count({ where: { tenantId: c.tid, type: "OPENING" } })).toBe(1);
    });

    test("aprobación doble concurrente: exactamente una 200, el resto 409", async () => {
        const close = await call("POST", "/cash/close", {
            token: c.cashierToken, body: { tenantId: c.tid, countedEfectivo: 10, countedYape: 0, countedTarjeta: 0 },
        });
        expect(close.status).toBe(201);
        const id = close.json.data.id;
        const approve = () =>
            call("POST", `/cash/close/${id}/approve`, { token: c.adminToken, body: { tenantId: c.tid, approverCode: c.approvalCode } });
        const res = await Promise.all([approve(), approve(), approve(), approve()]);
        expect(res.filter((r) => r.status === 200).length).toBe(1);
        expect(res.filter((r) => r.status === 409).length).toBe(3);
        expect((await call("POST", `/cash/close/${id}/approve`, { token: c.adminToken, body: { tenantId: c.tid, approverCode: c.approvalCode } })).status).toBe(409);
    });

    test("history: rango > 366 días -> 422; con fechas responde y trae day", async () => {
        const bad = await call("GET", "/cash/history", { token: c.adminToken, query: { tenantId: c.tid, from: "2020-01-01", to: today() } });
        expect(bad.status).toBe(422);
        const ok = await call("GET", "/cash/history", { token: c.adminToken, query: { tenantId: c.tid, days: 7 } });
        expect(ok.status).toBe(200);
        expect(ok.json.data.length).toBe(1);
        expect(ok.json.data[0].day.cashStatus).toBe("CERRADA");
        expect(ok.json.data[0].day.expectedCash).toBe(10);
    });

    test("movimientos sin fecha: tope 500; con fecha sin tope", async () => {
        const w = c.cashier.id;
        await prisma.cashMovement.createMany({
            data: Array.from({ length: 505 }, (_, i) => ({ tenantId: c.tid, workerId: w, type: "IN", amount: 1, currency: "PEN", reason: `bulk ${i}` })),
        });
        const all = await call("GET", "/cash/movements", { token: c.adminToken, query: { tenantId: c.tid } });
        expect(all.json.data.length).toBe(500);
        const day = await call("GET", "/cash/movements", { token: c.adminToken, query: { tenantId: c.tid, date: today() } });
        expect(day.json.data.length).toBe(506); // 505 + apertura
    });

    test("delete movimiento: doble concurrente -> uno 200, otro 404", async () => {
        const m = await prisma.cashMovement.findFirstOrThrow({ where: { tenantId: c.tid, type: "IN" } });
        const del = () => call("DELETE", `/cash/movements/${m.id}`, { token: c.adminToken, query: { tenantId: c.tid } });
        const res = await Promise.all([del(), del()]);
        expect(res.map((r) => r.status).sort()).toEqual([200, 404]);
    });
});

describe("dashboard", () => {
    test("sales-report: rango > 366 días -> 422", async () => {
        const r = await call("GET", "/dashboard/sales-report", { token: c.adminToken, query: { tenantId: c.tid, from: "2020-01-01", to: today() } });
        expect(r.status).toBe(422);
        const ok = await call("GET", "/dashboard/sales-report", { token: c.adminToken, query: { tenantId: c.tid, from: today(), to: today() } });
        expect(ok.status).toBe(200);
    });
});

describe("playzone", () => {
    test("inicios concurrentes: códigos de pulsera distintos, todos 201", async () => {
        const g = await prisma.guardian.create({ data: { tenantId: c.tid, dni: "99999999", fullName: "Tutor QA" } });
        const kids = await Promise.all(
            Array.from({ length: 8 }, (_, i) => prisma.child.create({ data: { tenantId: c.tid, guardianId: g.id, fullName: `Niño ${i}` } })),
        );
        const res = await Promise.all(
            kids.map((k) => call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId: k.id } })),
        );
        expect(res.map((r) => r.status)).toEqual(kids.map(() => 201));
        expect(new Set(res.map((r) => r.json.data.wristbandCode)).size).toBe(8);
    });
});
