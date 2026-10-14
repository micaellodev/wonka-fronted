// QA E2E helpers. Run: `bun --env-file=.env.test test tests/` with a backend up on BASE_URL (default :3016).
// Each suite creates its own throwaway tenant (cascade-deleted afterwards) so runs are isolated and repeatable.
import { createHash, randomInt } from "node:crypto";
import { prisma } from "../src/lib/prisma.ts";

export { prisma };
export const BASE = process.env["BASE_URL"] ?? "http://localhost:3016";
export const MAIN_TENANT = "wonka_main_store_001";

if (!process.env["DATABASE_URL"]?.includes("localhost")) {
    throw new Error("QA tests must run against the local test DB (bun --env-file=.env.test test).");
}

export type Res = { status: number; json: any };

export async function call(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<Res> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {};
    if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const r = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const text = await r.text();
    let json: any = text;
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
    return { status: r.status, json };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function login(tenantId: string, pin: string): Promise<{ token: string; worker: any; res: Res }> {
    const res = await call("POST", "/hr/verify-pin", { body: { tenantId, pin } });
    const token = res.json?.token ?? res.json?.data?.token ?? res.json?.meta?.token;
    return { token, worker: res.json?.data?.worker ?? res.json?.data, res };
}

export type Ctx = Awaited<ReturnType<typeof createTenant>>;

/** Fresh tenant with ADMIN + CAJERO workers, one category and two products (one tracked, one untracked). */
export async function createTenant(label = "qa") {
    const tid = `${label}_${Date.now().toString(36)}_${randomInt(1e6)}`;
    const adminPin = "54321", cashierPin = "22222", approvalCode = "135790", admin6Pin = "246813";
    await prisma.tenant.create({
        data: {
            id: tid, name: `QA ${tid}`, slug: tid,
            ruc: "20123456789", razonSocial: "QA SAC", direccion: "Av QA 1", ubigeo: "150101",
            apisperuToken: "qa-mock-token", apisperuUrl: process.env["APISPERU_URL"] ?? "http://localhost:3999/api/v1",
            electronicInvoicingEnabled: false,
        },
    });
    const adminRole = await prisma.role.create({ data: { tenantId: tid, name: "ADMIN" } });
    const cashierRole = await prisma.role.create({ data: { tenantId: tid, name: "CAJERO" } });
    const admin = await prisma.worker.create({
        data: { tenantId: tid, roleId: adminRole.id, name: "QA Admin", pinHash: sha256(`${tid}:${adminPin}`), approvalCodeHash: sha256(`${tid}:${approvalCode}`) },
    });
    // 6-digit admin login whose PIN doubles as approval code (same as seeded 060904 reviewer).
    const admin6 = await prisma.worker.create({
        data: { tenantId: tid, roleId: adminRole.id, name: "QA Admin6", pinHash: sha256(`${tid}:${admin6Pin}`), approvalCodeHash: sha256(`${tid}:${admin6Pin}`) },
    });
    const cashier = await prisma.worker.create({
        data: { tenantId: tid, roleId: cashierRole.id, name: "QA Cajero", pinHash: sha256(`${tid}:${cashierPin}`) },
    });
    const category = await prisma.category.create({ data: { tenantId: tid, name: "QA Cat" } });
    const product = await prisma.product.create({
        data: { tenantId: tid, categoryId: category.id, name: "QA Chocolate", sku: "QA-1", price: 5, cost: 2, stock: 10, trackStock: true },
    });
    const untracked = await prisma.product.create({
        data: { tenantId: tid, categoryId: category.id, name: "QA Servicio", sku: "QA-2", price: 3, cost: 0, stock: 0, trackStock: false },
    });
    const a = await login(tid, adminPin);
    const c = await login(tid, cashierPin);
    return {
        tid, adminPin, cashierPin, approvalCode, admin6Pin,
        admin, admin6, cashier, adminRole, cashierRole, category, product, untracked,
        adminToken: a.token, cashierToken: c.token,
    };
}

export async function dropTenant(tid: string) {
    // Cascades from Tenant cover every tenant-scoped table.
    await prisma.tenant.delete({ where: { id: tid } }).catch((e) => console.warn(`cleanup ${tid}:`, e.message));
}
