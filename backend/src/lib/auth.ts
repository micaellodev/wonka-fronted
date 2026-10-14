// ============================================================
//  Auth — HMAC-signed session tokens + global route guard.
//  Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256)
// ============================================================

import { Elysia } from "elysia";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

/** Client identifier for rate limiting. shortcut: trusts the right-most X-Forwarded-For hop (Railway proxy); spoofable if the backend is exposed without a proxy. */
export function clientIp(request: Request, server?: { requestIP(r: Request): { address: string } | null } | null): string {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) return xff.split(",").pop()!.trim();
    return server?.requestIP(request)?.address ?? "unknown";
}

// "METHOD /path" keys; route patterns as Elysia reports them in `route`.
const PUBLIC_ROUTES = new Set(["GET /health", "POST /hr/verify-pin", "POST /hr/attendance"]);

/** Any non-GET under these prefixes is admin by default, so new mutation routes are not left open. */
const ADMIN_WRITE_PREFIXES = ["/inventory", "/hr", "/upload", "/dashboard/settings", "/billing"];
const WORKER_WRITES = new Set(["POST /hr/verify-pin", "POST /hr/attendance", "POST /hr/verify-admin"]);

/** Admin routes outside the prefix rule (GETs and other modules). Approval-code endpoints used at the
 *  cashier terminal (POST /cash/close/:id/approve) stay worker-level: the 6-digit code is the admin factor. */
const ADMIN_ROUTES = new Set([
    "GET /hr/roles", "GET /hr/workers", "GET /hr/attendance",
    "GET /dashboard/metrics",
    "GET /pos/void", "POST /pos/void/:id/resolve",
    "GET /billing/notes",
    "DELETE /cash/movements/:id",
    "GET /playzone/reports/summary", "PUT /playzone/rates",
]);

export function isAdminRoute(method: string, route: string): boolean {
    const key = `${method} ${route}`;
    if (ADMIN_ROUTES.has(key)) return true;
    if (method === "GET" || WORKER_WRITES.has(key)) return false;
    return ADMIN_WRITE_PREFIXES.some((p) => route === p || route.startsWith(p + "/"));
}

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
    .onTransform({ as: "global" }, ({ request, route, query, body, params, status }) => {
        if (isPublic(request.method, new URL(request.url).pathname)) return;
        const auth = getAuth(request);
        if (!auth) throw status(401, denial("UNAUTHENTICATED", "Sesión no válida o expirada. Inicia sesión de nuevo."));
        const tenants = [
            (query as Record<string, unknown> | undefined)?.["tenantId"],
            (body as Record<string, unknown> | undefined)?.["tenantId"],
            (params as Record<string, unknown> | undefined)?.["tenantId"],
        ];
        if (tenants.some((t) => t !== undefined && t !== auth.tenantId)) {
            throw status(403, denial("TENANT_MISMATCH", "No tienes acceso a este negocio."));
        }
        if (isAdminRoute(request.method, route) && !isAdminRole(auth.role)) {
            throw status(403, denial("ADMIN_REQUIRED", "Se requiere un usuario administrador."));
        }
    });
