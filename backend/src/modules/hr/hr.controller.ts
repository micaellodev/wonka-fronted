import Elysia, { t } from "elysia";
import {
    createWorker,
    processAttendance,
    verifyAdmin,
    verifyPin,
    updateWorker,
} from "./hr.service.ts";
import {
    CreateWorkerBody,
    AttendanceBody,
    UpdateWorkerBody,
} from "../../types/schemas.ts";
import { prisma } from "../../lib/prisma.ts";
import { RateLimitError } from "../../lib/rateLimiter.ts";
import { clientIp, signToken } from "../../lib/auth.ts";

const AUTH_FAILURES = ["Pin Inválido.", "Worker does not have ADMIN privileges."];

/** Maps service errors: rate limit → 429, bad PIN/not admin → 401, rest → `fallback`. */
function fail(set: { status?: number | string }, err: unknown, fallback = 422) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    set.status = err instanceof RateLimitError ? 429 : AUTH_FAILURES.includes(message) ? 401 : message.endsWith("not found for this tenant.") ? 404 : fallback;
    return { message };
}

// ============================================================
//  HR Controller — Prefix: /hr
// ============================================================

export const hrController = new Elysia({ prefix: "/hr", tags: ["HR"] })

    // ── GET /hr/roles ─────────────────────────────────────────
    .get(
        "/roles",
        async ({ query }) => {
            const roles = await prisma.role.findMany({
                where: { tenantId: query.tenantId },
                orderBy: { name: "asc" },
                select: { id: true, name: true, createdAt: true },
            });
            return { data: roles };
        },
        {
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            detail: { summary: "List all roles for a tenant" },
        }
    )

    // ── POST /hr/roles ────────────────────────────────────────
    .post(
        "/roles",
        async ({ body, set, request, server }) => {
            try {
                await verifyAdmin(body.tenantId, body.adminPin, clientIp(request, server));
            } catch (err) {
                return fail(set, err);
            }

            const tenant = await prisma.tenant.findUnique({
                where: { id: body.tenantId },
            });
            if (!tenant) {
                set.status = 404;
                return { message: "Tenant not found." };
            }

            try {
                const role = await prisma.role.create({
                    data: { tenantId: body.tenantId, name: body.name.toUpperCase() },
                    select: { id: true, name: true, tenantId: true, createdAt: true },
                });
                set.status = 201;
                return { data: role };
            } catch {
                set.status = 409;
                return { message: "A role with this name already exists for this tenant." };
            }
        },
        {
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                name: t.String({ minLength: 1 }),
                adminPin: t.String({ minLength: 1 }),
            }),
            detail: { summary: "Create a role for a tenant (requires admin PIN)" },
        }
    )

    // ── POST /hr/workers ──────────────────────────────────────
    /**
     * Admin creates a new worker and assigns (or auto-generates) a 5/6-digit PIN.
     * The raw PIN is returned exactly ONCE.
     */
    .post(
        "/workers",
        async ({ body, set, request, server }) => {
            try {
                await verifyAdmin(body.tenantId, body.adminPin, clientIp(request, server));
            } catch (err) {
                return fail(set, err);
            }

            try {
                const result = await createWorker({
                    tenantId: body.tenantId,
                    name: body.name,
                    roleId: body.roleId,
                    ...(body.dni ? { dni: body.dni } : {}),
                    ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
                    ...(body.pin !== undefined ? { pin: body.pin } : {}),
                    ...(body.approvalCode !== undefined ? { approvalCode: body.approvalCode } : {}),
                });
                set.status = 201;
                return {
                    data: result.worker,
                    meta: {
                        rawPin: result.rawPin,
                        rawApprovalCode: result.rawApprovalCode,
                        message:
                            "Worker created. Store the PIN and approval code securely — they cannot be retrieved again.",
                    },
                };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            body: CreateWorkerBody,
            detail: {
                summary: "Create a worker and assign a 5 or 6 digit PIN (Admin only)",
                description:
                    "If `pin` is omitted, the system auto-generates a secure random 5-digit PIN. " +
                    "The raw PIN is returned once and must be communicated to the worker.",
            },
        }
    )

    // ── GET /hr/workers ───────────────────────────────────────
    .get(
        "/workers",
        async ({ query }) => {
            const workers = await prisma.worker.findMany({
                where: { tenantId: query.tenantId },
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    name: true,
                    roleId: true,
                    dni: true,
                    avatarUrl: true,
                    isActive: true,
                    createdAt: true,
                    approvalCodeHash: true,
                    role: { select: { id: true, name: true } },
                },
            });
            return {
                data: workers.map((w) => ({
                    ...w,
                    hasApprovalCode: !!w.approvalCodeHash,
                    approvalCodeHash: undefined,
                })),
            };
        },
        {
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            detail: { summary: "List all workers for a tenant (PINs excluded)" },
        }
    )

    // ── PATCH /hr/workers/:id ─────────────────────────────────
    .patch(
        "/workers/:id",
        async ({ params, body, query, set, request, server }) => {
            try {
                await verifyAdmin(query.tenantId, body.adminPin, clientIp(request, server));
            } catch (err) {
                return fail(set, err);
            }

            const { adminPin, ...updateFields } = body;
            try {
                const data = await updateWorker({
                    tenantId: query.tenantId,
                    workerId: params.id,
                    ...updateFields,
                });
                return { data };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            params: t.Object({ id: t.String() }),
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            body: UpdateWorkerBody,
            detail: { summary: "Update a worker (name, role, pin, active)" },
        }
    )

    // ── POST /hr/attendance ───────────────────────────────────
    /**
     * PIN-based attendance toggle:
     *  - No open record → CHECK_IN
     *  - Open record found → CHECK_OUT
     */
    .post(
        "/attendance",
        async ({ body, set, request, server }) => {
            try {
                const result = await processAttendance(body.tenantId, body.pin, clientIp(request, server));
                return {
                    data: result,
                    meta: {
                        message:
                            result.action === "CHECK_IN"
                                ? `${result.worker.name} checked in successfully.`
                                : `${result.worker.name} checked out successfully.`,
                    },
                };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            body: AttendanceBody,
            detail: {
                summary: "Register attendance check-in or check-out using a PIN",
                description:
                    "Scans PIN against all active workers of the tenant. " +
                    "No open record → CHECK_IN. Open record exists → CHECK_OUT.",
            },
        }
    )

    // ── GET /hr/attendance ────────────────────────────────────
    .get(
        "/attendance",
        async ({ query }) => {
            const { tenantId, workerId, startDate, endDate, limit } = query;
            const records = await prisma.attendance.findMany({
                where: {
                    tenantId,
                    ...(workerId !== undefined ? { workerId } : {}),
                    ...(startDate && endDate ? { checkIn: { gte: new Date(startDate), lte: new Date(endDate + 'T23:59:59.999Z') } } : {}),
                },
                orderBy: { checkIn: "desc" },
                take: limit ? Number(limit) : 50,
                select: {
                    id: true,
                    checkIn: true,
                    checkOut: true,
                    worker: { select: { id: true, name: true } },
                },
            });
            return { data: records };
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                workerId: t.Optional(t.String()),
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
                limit: t.Optional(t.Numeric()),
            }),
            detail: { summary: "List attendance records for a tenant" },
        }
    )

    // ── POST /hr/verify-pin ───────────────────────────────────
    .post(
        "/verify-pin",
        async ({ body, set, request, server }) => {
            try {
                const { worker, token } = await verifyPin(body.tenantId, body.pin, clientIp(request, server));
                return { data: worker, token };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                pin: t.String({ minLength: 1 }),
            }),
            detail: {
                summary: "Verify any worker PIN and return their info",
                description: "Used to unlock the POS without marking attendance.",
            },
        }
    )

    // ── POST /hr/verify-admin ─────────────────────────────────
    .post(
        "/verify-admin",
        async ({ body, set, request, server }) => {
            try {
                const result = await verifyAdmin(body.tenantId, body.pin, clientIp(request, server));
                // Elevated session token for the admin who unlocked the gatekeeper.
                const token = signToken({ workerId: result.worker.id, tenantId: body.tenantId, role: result.worker.role.name });
                return { data: result, token };
            } catch (err) {
                return fail(set, err);
            }
        },
        {
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                pin: t.String({ minLength: 1 }),
            }),
            detail: {
                summary: "Verify if a PIN belongs to an ADMIN worker",
                description: "Used by the frontend Gatekeeper to unlock admin-only functions.",
            },
        }
    );
