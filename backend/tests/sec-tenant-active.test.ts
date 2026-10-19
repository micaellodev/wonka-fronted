import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, prisma, type Ctx } from "./helpers.ts";

let a: Ctx, b: Ctx;
beforeAll(async () => { a = await createTenant("secA"); b = await createTenant("secB"); });
afterAll(async () => { await dropTenant(a.tid); await dropTenant(b.tid); });

describe("aislamiento por tenant", () => {
    test("PATCH worker de otro tenant por :id -> 404 y sin cambios", async () => {
        const r = await call("PATCH", `/hr/workers/${b.cashier.id}`, { token: a.adminToken, query: { tenantId: a.tid }, body: { adminPin: a.adminPin, name: "HACK" } });
        expect(r.status).toBe(404);
        expect((await prisma.worker.findUnique({ where: { id: b.cashier.id } }))?.name).toBe("QA Cajero");
    });
    test("tenantId ajeno en query/body -> 403", async () => {
        expect((await call("GET", "/hr/workers", { token: a.adminToken, query: { tenantId: b.tid } })).status).toBe(403);
        expect((await call("POST", "/billing/retry-pending", { token: a.adminToken, body: { tenantId: b.tid } })).status).toBe(403);
    });
});

describe("worker inactivo", () => {
    test("token de worker desactivado -> 401", async () => {
        expect((await call("GET", "/hr/roles", { token: a.adminToken, query: { tenantId: a.tid } })).status).toBe(200);
        expect((await call("GET", "/cash/summary", { token: a.cashierToken, query: { tenantId: a.tid } })).status).not.toBe(401);
        const off = await call("PATCH", `/hr/workers/${a.cashier.id}`, { token: a.adminToken, query: { tenantId: a.tid }, body: { adminPin: a.adminPin, isActive: false } });
        expect(off.status).toBe(200);
        const r = await call("GET", "/cash/summary", { token: a.cashierToken, query: { tenantId: a.tid } });
        expect(r.status).toBe(401);
        expect(r.json.code).toBe("WORKER_INACTIVE");
    });
});

describe("hr limites", () => {
    const q = (extra: Record<string, string>) => call("GET", "/hr/attendance", { token: a.adminToken, query: { tenantId: a.tid, ...extra } });
    test("limit fuera de rango -> 422", async () => {
        expect((await q({ limit: "0" })).status).toBe(422);
        expect((await q({ limit: "201" })).status).toBe(422);
        expect((await q({ limit: "200" })).status).toBe(200);
    });
    test("fechas invalidas -> 400", async () => {
        expect((await q({ startDate: "xx", endDate: "yy" })).status).toBe(400);
        expect((await q({ startDate: "2026-01-01", endDate: "2026-12-31" })).status).toBe(200);
    });
});
