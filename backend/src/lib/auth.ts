// ============================================================
//  Auth — HMAC-signed session tokens + global route guard.
//  Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256)
// ============================================================

import { Elysia } from "elysia";
import { prisma } from "./prisma.ts";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { can, requiredPermission } from "./permissions.ts";

export type AuthPayload = { workerId: string; tenantId: string; role: string; exp: number };

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function loadSecret(): string {
    const s = process.env["AUTH_SECRET"];
    if (s && s.length >= 32) return s;
    if (process.env["NODE_ENV"] === "production") {
        throw new Error("AUTH_SECRET (>=32 chars) is required in production.");
    }
    // Dev/test: per-process random secret (tokens die on restart).
    return randomBytes(32).toString("hex");
}
const SECRET = loadSecret();

const sign = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64url");

export const isAdminRole = (role?: string | null) => role === "ADMIN" || role === "ADMINISTRADOR";

export function signToken(p: Omit<AuthPayload, "exp">): string {
    const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
    return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | null | undefined): AuthPayload | null {
    if (!token) return null;
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
        const p = JSON.parse(Buffer.from(body, "base64url").toString()) as AuthPayload;
        if (typeof p.exp !== "number" || p.exp < Date.now() || !p.tenantId || !p.workerId) return null;
        return p;
    } catch {
        return null;
    }
}

/** Decoded token of the current request (null if absent/invalid). Use in handlers that lack tenantId in the request. */
export function getAuth(request: Request): AuthPayload | null {
    const h = request.headers.get("authorization") ?? "";
    return verifyToken(h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null);
}

/** Client identifier for rate limiting. X-Forwarded-For (right-most hop) is trusted only when TRUSTED_PROXY=true (behind Railway/nginx); otherwise it is spoofable and ignored. */
export function clientIp(request: Request, server?: { requestIP(r: Request): { address: string } | null } | null): string {
    const xff = process.env["TRUSTED_PROXY"] === "true" ? request.headers.get("x-forwarded-for") : null;
    if (xff) return xff.split(",").pop()!.trim();
    return server?.requestIP(request)?.address ?? "unknown";
}

// Short-lived cache of "worker still active" so the guard does not query per request.
// shortcut: per-process, 30s stale window for deactivation done on another instance; PATCH /hr/workers invalidates locally.
const ACTIVE_TTL_MS = 30_000;
const activeCache = new Map<string, { ok: boolean; at: number }>();
export const invalidateWorkerCache = (workerId: string) => void activeCache.delete(workerId);

async function isWorkerActive(a: AuthPayload): Promise<boolean> {
    const hit = activeCache.get(a.workerId);
    if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.ok;
    const ok = !!(await prisma.worker.findFirst({ where: { id: a.workerId, tenantId: a.tenantId, isActive: true }, select: { id: true } }));
    activeCache.set(a.workerId, { ok, at: Date.now() });
    return ok;
}

// "METHOD /path" keys; route patterns as Elysia reports them in `route`.
const PUBLIC_ROUTES = new Set(["GET /health", "POST /hr/verify-pin", "POST /hr/attendance"]);

const isPublic = (method: string, path: string) =>
    method === "OPTIONS" || PUBLIC_ROUTES.has(`${method} ${path.replace(/\/+$/, "") || "/"}`) || path === "/swagger" || path.startsWith("/swagger/");

const denial = (code: string, message: string) => ({ error: true, code, message });

export const authGuard = new Elysia({ name: "auth-guard" })
    // 401 before body parsing/validation.
    .onRequest(({ request, set }) => {
        if (isPublic(request.method, new URL(request.url).pathname)) return;
        if (!getAuth(request)) {
            set.status = 401;
            return denial("UNAUTHENTICATED", "Sesión no válida o expirada. Inicia sesión de nuevo.");
        }
    })
    // 403 on tenant mismatch / missing admin role. Transform runs after parsing but before
    // schema validation, so a forbidden caller gets 403 instead of a 422 validation dump.
    .onTransform({ as: "global" }, async ({ request, route, query, body, params, status }) => {
        if (isPublic(request.method, new URL(request.url).pathname)) return;
        const auth = getAuth(request);
        if (!auth) throw status(401, denial("UNAUTHENTICATED", "Sesión no válida o expirada. Inicia sesión de nuevo."));
        if (!(await isWorkerActive(auth))) {
            throw status(401, denial("WORKER_INACTIVE", "Usuario inactivo o eliminado. Inicia sesión de nuevo."));
        }
        const tenants = [
            (query as Record<string, unknown> | undefined)?.["tenantId"],
            (body as Record<string, unknown> | undefined)?.["tenantId"],
            (params as Record<string, unknown> | undefined)?.["tenantId"],
        ];
        if (tenants.some((t) => t !== undefined && t !== auth.tenantId)) {
            throw status(403, denial("TENANT_MISMATCH", "No tienes acceso a este negocio."));
        }
        const needed = requiredPermission(request.method, route);
        const stockInOnly = request.method === "POST" && route === "/inventory/products/:id/stock"
            && (body as Record<string, unknown> | undefined)?.["type"] === "ENTRADA"
            && can(auth.role, "inventory.stock.add");
        if (needed && !can(auth.role, needed) && !stockInOnly) {
            throw status(403, denial("FORBIDDEN", "Tu rol no tiene permiso para esta acción."));
        }
    });
