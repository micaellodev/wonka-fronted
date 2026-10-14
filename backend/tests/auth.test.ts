import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, login, MAIN_TENANT, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qaauth"); });
afterAll(async () => { await dropTenant(c.tid); });

describe("login PIN", () => {
    test("/health is public", async () => {
        expect((await call("GET", "/health")).status).toBe(200);
    });

    for (const [pin, role] of [["12345", "ADMIN"], ["11111", "CAJERO"], ["060904", "ADMIN"]] as const) {
        test(`seeded PIN ${pin.length} digits (${role}) logs in with token`, async () => {
            const { res, token, worker } = await login(MAIN_TENANT, pin);
            expect(res.status).toBe(200);
            expect(typeof token).toBe("string");
            expect(worker?.role?.name).toBe(role);
        });
    }

    test("own tenant: 5-digit admin, 6-digit admin and cashier get tokens", async () => {
        expect(c.adminToken).toBeString();
        expect(c.cashierToken).toBeString();
        const six = await login(c.tid, c.admin6Pin);
        expect(six.res.status).toBe(200);
        expect(six.token).toBeString();
    });

    test("wrong PIN → 401, no token", async () => {
        const { res, token } = await login(c.tid, "99999");
        expect(res.status).toBe(401);
        expect(token).toBeUndefined();
    });

    test("malformed PIN (4 digits / letters / 7 digits) is rejected", async () => {
        for (const pin of ["1234", "abcde", "1234567"]) {
            const { res, token } = await login(c.tid, pin);
            expect([400, 401, 422]).toContain(res.status);
            expect(token).toBeUndefined();
        }
    });

    test("response never leaks pinHash/approvalCodeHash", async () => {
        const { res } = await login(c.tid, c.adminPin);
        expect(JSON.stringify(res.json)).not.toMatch(/pinHash|approvalCodeHash/);
    });
});

describe("guard", () => {
    test("rutas de cualquier autenticado: GET /playzone/rates y /apisperu/dni (cajero 200)", async () => {
        expect((await call("GET", "/playzone/rates", { token: c.cashierToken, query: { tenantId: c.tid } })).status).toBe(200);
        const dni = await call("GET", "/apisperu/dni/12345678", { token: c.cashierToken, query: { tenantId: c.tid } });
        expect(dni.status).not.toBe(401);
        expect(dni.status).not.toBe(403);
    });

    test("protected route without token → 401", async () => {
        const r = await call("GET", "/pos/sales/today", { query: { tenantId: c.tid } });
        expect(r.status).toBe(401);
    });

    test("forged token → 401", async () => {
        const r = await call("GET", "/pos/sales/today", { token: "eyJ4IjoxfQ.bad", query: { tenantId: c.tid } });
        expect(r.status).toBe(401);
    });

    test("foreign tenant in query → 403", async () => {
        const r = await call("GET", "/pos/sales/today", { token: c.cashierToken, query: { tenantId: MAIN_TENANT } });
        expect(r.status).toBe(403);
    });

    test("foreign tenant in body → 403", async () => {
        const r = await call("POST", "/cash/movements", {
            token: c.adminToken,
            body: { tenantId: MAIN_TENANT, workerId: c.admin.id, type: "IN", amount: 1, currency: "PEN", reason: "x" },
        });
        expect(r.status).toBe(403);
    });

    const adminRoutes: Array<[string, string, unknown?]> = [
        ["GET", "/hr/workers"],
        ["GET", "/hr/roles"],
        ["GET", "/dashboard/metrics"],
        ["GET", "/pos/void"],
        ["GET", "/billing/notes"],
        ["POST", "/inventory/categories", { name: "hack" }],
        ["PATCH", "/dashboard/settings", { adminPin: "11111", name: "hack" }],
        ["GET", "/hr/attendance"],
        ["GET", "/playzone/reports/summary"],
        ["POST", "/billing/retry-pending", {}],
        ["POST", "/upload", {}],
        ["DELETE", "/inventory/categories/x"],
        ["PATCH", "/inventory/products/x", { stock: 1 }],
        ["POST", "/inventory/products/x/stock", { delta: 1 }],
        ["PATCH", "/hr/workers/x", { adminPin: "1" }],
        ["DELETE", "/cash/movements/x"],
        ["PUT", "/playzone/rates", { durations: [], extraPerMinute: 0, freePerMinute: 0 }],
    ];
    for (const [m, p, body] of adminRoutes) {
        test(`cashier ${m} ${p} → 403; admin not 401/403`, async () => {
            const b = body ? { tenantId: c.tid, ...(body as object) } : undefined;
            const q = m === "POST" || m === "PUT" ? undefined : { tenantId: c.tid };
            const asCashier = await call(m, p, { token: c.cashierToken, body: b, query: q });
            expect(asCashier.status).toBe(403);
            if (m === "GET") {
                const asAdmin = await call(m, p, { token: c.adminToken, query: q });
                expect(asAdmin.status).toBe(200);
            }
        });
    }
});
