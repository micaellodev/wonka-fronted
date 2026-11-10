// Roles finos: ADMIN todo, GERENTE back-office sin empresa/empleados, COCINA solo ver inventario, CAJERO nada extra.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, login, prisma, sha256, type Ctx } from "./helpers.ts";

let c: Ctx, gerente = "", cocina = "";
const PINS = { gerente: "33333", cocina: "44444" };

beforeAll(async () => {
    c = await createTenant("qarol");
    for (const [name, pin] of [["GERENTE", PINS.gerente], ["COCINA", PINS.cocina]] as const) {
        const role = await prisma.role.create({ data: { tenantId: c.tid, name } });
        await prisma.worker.create({ data: { tenantId: c.tid, roleId: role.id, name: `QA ${name}`, pinHash: sha256(`${c.tid}:${pin}`) } });
    }
    gerente = (await login(c.tid, PINS.gerente)).token;
    cocina = (await login(c.tid, PINS.cocina)).token;
});
afterAll(() => dropTenant(c.tid));

const q = (token: string, method: string, path: string, body?: object) =>
    call(method, path, { token, query: { tenantId: c.tid }, ...(body ? { body } : {}) });

describe("verify-pin devuelve permisos", () => {
    test("admin: todos; gerente: sin empresa/empleados; cajero: ninguno", async () => {
        const a = await login(c.tid, "543210"), g = await login(c.tid, PINS.gerente), k = await login(c.tid, "222222");
        expect(a.res.json.permissions).toContain("company.settings");
        expect(g.res.json.permissions).toContain("reports.view");
        expect(g.res.json.permissions).not.toContain("company.settings");
        expect(g.res.json.permissions).not.toContain("employees.manage");
        expect(k.res.json.permissions).toEqual([]);
    });
});

describe("GERENTE", () => {
    test("puede: métricas, movimientos de inventario, listar empleados, editar producto", async () => {
        expect((await q(gerente, "GET", "/dashboard/metrics")).status).toBe(200);
        expect((await q(gerente, "GET", "/inventory/movements")).status).toBe(200);
        expect((await q(gerente, "GET", "/hr/workers")).status).toBe(200);
        expect((await q(gerente, "PATCH", `/inventory/products/${c.product.id}`, { price: 6 })).status).toBe(200);
    });
    test("no puede: ajustes de empresa ni crear empleados/roles", async () => {
        expect((await q(gerente, "PATCH", "/dashboard/settings", { adminPin: "543210", name: "x" })).status).toBe(403);
        expect((await q(gerente, "POST", "/hr/workers", { tenantId: c.tid, name: "X", roleId: "x", pin: "999999" })).status).toBe(403);
        expect((await q(gerente, "POST", "/hr/roles", { tenantId: c.tid, name: "otro" })).status).toBe(403);
    });
});

describe("COCINA", () => {
    test("puede ver movimientos de inventario", async () => {
        expect((await q(cocina, "GET", "/inventory/movements")).status).toBe(200);
    });
    test("no puede: ajustar stock, ver métricas ni empleados", async () => {
        expect((await q(cocina, "POST", `/inventory/products/${c.product.id}/stock`, { tenantId: c.tid, type: "IN", quantity: 5, reason: "prueba" })).status).toBe(403);
        expect((await q(cocina, "GET", "/dashboard/metrics")).status).toBe(403);
        expect((await q(cocina, "GET", "/hr/workers")).status).toBe(403);
    });
});

describe("CAJERO (sin cambios)", () => {
    test("sigue sin acceso a back-office", async () => {
        expect((await q(c.cashierToken, "GET", "/inventory/movements")).status).toBe(403);
        expect((await q(c.cashierToken, "GET", "/dashboard/metrics")).status).toBe(403);
    });
});
