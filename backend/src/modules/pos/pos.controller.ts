import Elysia, { t } from "elysia";
import {
    processSale,
    listSales,
    getSaleById,
    listSalesToday,
    createVoidRequest,
    resolveVoidRequest,
    listVoidRequests,
    sendSaleEmail,
} from "./pos.service.ts";
import { CreateSaleBody } from "../../types/schemas.ts";
import { verifyApprovalCodeAny } from "../hr/hr.service.ts";
import { getAuth } from "../../lib/auth.ts";
import { RateLimitError } from "../../lib/rateLimiter.ts";

// ============================================================
//  POS Controller — Prefix: /pos
// ============================================================

export const posController = new Elysia({ prefix: "/pos", tags: ["POS"] })

    // ── GET /pos/sales ──────────────────────────────────────────
    .get(
        "/sales",
        async ({ query }) => {
            const result = await listSales(
                query.tenantId,
                query.page ?? 1,
                query.limit ?? 20,
                // Días Lima (UTC-5, sin DST)
                query.dateFrom ? new Date(query.dateFrom + "T00:00:00-05:00") : undefined,
                query.dateTo ? new Date(query.dateTo + "T23:59:59.999-05:00") : undefined,
                query.status
            );
            return result;
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, default: 20 })),
                dateFrom: t.Optional(t.String({ format: "date" })),
                dateTo: t.Optional(t.String({ format: "date" })),
                status: t.Optional(t.String({ pattern: "^(ACTIVE|CANCELLED|PENDING_SUNAT)$" })),
            }),
            detail: { summary: "List sales with pagination and optional date range" },
        }
    )

    // ── GET /pos/sales/today ────────────────────────────────────
    .get(
        "/sales/today",
        async ({ query }) => {
            const sales = await listSalesToday(query.tenantId);
            return { data: sales };
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
            }),
            detail: { summary: "List today's sales" },
        }
    )

    // ── GET /pos/sales/:id ──────────────────────────────────────
    .get(
        "/sales/:id",
        async ({ params, query, set }) => {
            try {
                return { data: await getSaleById(query.tenantId, params.id) };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unexpected error.";
                set.status = /not found/i.test(message) ? 404 : 500;
                return { message };
            }
        },
        {
            params: t.Object({
                id: t.String({ minLength: 1 }),
            }),
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
            }),
            detail: { summary: "Get sale detail" },
        }
    )

    // ── POST /pos/sales ───────────────────────────────────────
    /**
     * Process a new sale:
     *   1. Validate worker & products (all tenant-scoped).
     *   2. Check stock sufficiency for every item.
     *   3. Decrement stock atomically via Prisma interactive transaction.
     *   4. Create Sale + SaleItem records with fiscal breakdown.
     *   5. Emit electronic document via APISPeru if BOLETA/FACTURA.
     *   → Any failure rolls back ALL stock changes.
     */
    .post(
        "/sales",
        async ({ body, set, request }) => {
            try {
                const result = await processSale({
                    tenantId: body.tenantId,
                    // Cajero = dueño del token (el guard global garantiza que existe)
                    workerId: getAuth(request)!.workerId,
                    items: body.items,
                    tipoComprobante: body.tipoComprobante as "TICKET" | "BOLETA" | "FACTURA",
                    paymentMethod: body.paymentMethod as "efectivo" | "yape" | "tarjeta",
                    clientDocType: body.clientDocType as "1" | "6" | "-" | undefined,
                    clientDocNumber: body.clientDocNumber,
                    clientName: body.clientName,
                    clientAddress: body.clientAddress,
                });
                set.status = 201;
                return {
                    data: result,
                    meta: {
                        message: "Sale processed successfully.",
                        itemCount: result.items.length,
                    },
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unexpected error.";

                if (message.toLowerCase().includes("insufficient stock") || message.includes("ya fue cobrado") || message.includes("duplicado") || message.startsWith("CASH_NOT_OPEN")) {
                    set.status = 409;
                } else if (
                    message.toLowerCase().includes("not found") ||
                    message.toLowerCase().includes("inactive")
                ) {
                    set.status = 404;
                } else {
                    set.status = 422;
                }
                return { message };
            }
        },
        {
            body: CreateSaleBody,
            detail: {
                summary: "Process a POS sale",
                description:
                    "Receives an array of { productId, qty }, validates stock, " +
                    "decrements inventory, records the sale, and optionally emits an electronic document via APISPeru.",
            },
        }
    )

    // ── GET /pos/void ───────────────────────────────────────────
    .get(
        "/void",
        async ({ query }) => {
            const requests = await listVoidRequests(
                query.tenantId,
                query.status as "PENDING" | "APPROVED" | "REJECTED" | undefined
            );
            return { data: requests };
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                status: t.Optional(t.String({ pattern: "^(PENDING|APPROVED|REJECTED)$" })),
            }),
            detail: { summary: "List void requests" },
        }
    )

    // ── POST /pos/sales/:id/void ────────────────────────────────
    .post(
        "/sales/:id/void",
        async ({ params, body, set, request: req }) => {
            try {
                const request = await createVoidRequest({
                    saleId: params.id,
                    tenantId: body.tenantId,
                    requesterWorkerId: getAuth(req)!.workerId,
                    reason: body.reason,
                });
                set.status = 201;
                return {
                    data: request,
                    meta: { message: "Void request created successfully." },
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unexpected error.";
                set.status = 422;
                return { message };
            }
        },
        {
            params: t.Object({
                id: t.String({ minLength: 1 }),
            }),
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                /** Ignorado: el solicitante es el dueño del token. */
                workerId: t.Optional(t.String()),
                reason: t.String({ minLength: 1 }),
            }),
            detail: { summary: "Request a sale void (cashier)" },
        }
    )

    // ── POST /pos/void/:id/resolve ──────────────────────────────
    .post(
        "/void/:id/resolve",
        async ({ params, body, set, request }) => {
            try {
                // The approver is the admin owning the code (the caller is usually the cashier)
                const approver = await verifyApprovalCodeAny(body.tenantId, body.approverCode, getAuth(request)!.workerId);

                const result = await resolveVoidRequest({
                    voidRequestId: params.id,
                    tenantId: body.tenantId,
                    approverWorkerId: approver.worker.id,
                    approve: body.approve,
                });

                return {
                    data: result,
                    meta: {
                        message: body.approve
                            ? "Void approved and credit note emitted."
                            : "Void rejected.",
                    },
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unexpected error.";
                set.status = err instanceof RateLimitError ? 429 : /already/i.test(message) ? 409 : 422;
                return { message };
            }
        },
        {
            params: t.Object({
                id: t.String({ minLength: 1 }),
            }),
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                /** Ignorado: el admin se identifica por el código. */
                approverWorkerId: t.Optional(t.String()),
                approverCode: t.String({ minLength: 1 }),
                approve: t.Boolean(),
            }),
            detail: { summary: "Approve or reject a void request (admin)" },
        }
    )

    // ── POST /pos/sales/:id/email ──────────────────────────────
    .post(
        "/sales/:id/email",
        async ({ params, body, set }) => {
            try {
                const result = await sendSaleEmail(
                    body.tenantId,
                    params.id,
                    body.email
                );
                return { data: result };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unexpected error.";
                set.status = message.includes("not found") ? 404 : 422;
                return { message };
            }
        },
        {
            params: t.Object({
                id: t.String({ minLength: 1 }),
            }),
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                email: t.String({ format: "email" }),
            }),
            detail: { summary: "Send sale receipt by email" },
        }
    );
