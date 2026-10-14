import { Elysia, t } from "elysia";
import { RateLimitError } from "../../lib/rateLimiter.ts";
import { createBillingNote, listBillingNotes, retryPendingDocuments } from "./billing.service.ts";

// POST routes here are admin-only via the global guard (lib/auth.ts admin list).
export const billingController = new Elysia({ prefix: "/billing" })
    .post(
        "/notes",
        async ({ body, set }) => {
            try {
                const note = await createBillingNote(body);
                set.status = 201;
                return note;
            } catch (error: any) {
                const message: string = error.message ?? "Unexpected error.";
                if (error instanceof RateLimitError) {
                    set.status = 429;
                } else if (
                    message === "Invalid approval code." ||
                    message === "Only administrators can use an approval code."
                ) {
                    set.status = 401;
                } else if (message.includes("Worker not found") || message.includes("no encontrado")) {
                    set.status = 404;
                } else {
                    set.status = 400;
                }
                return { error: message };
            }
        },
        {
            body: t.Object({
                tenantId: t.String(),
                workerId: t.String(),
                /** 6-digit owner/admin approval code, required to authorize this record. */
                approvalCode: t.String({ pattern: "^[0-9]{6}$" }),
                type: t.Union([t.Literal("CREDIT_NOTE"), t.Literal("DEBIT_NOTE")]),
                modifiedDocumentSerie: t.String({ pattern: "^[BFbf][A-Za-z0-9]{3}$" }),
                modifiedDocumentCorrelative: t.String({ pattern: "^[0-9]{1,8}$" }),
                reasonCode: t.String({ pattern: "^[0-9]{2}$" }),
                reasonDescription: t.String({ minLength: 3, maxLength: 250 }),
                totalAmount: t.Numeric({ exclusiveMinimum: 0 }),
            }),
        }
    )
    .post(
        "/retry-pending",
        async ({ body, set }) => {
            try {
                return { success: true, data: await retryPendingDocuments(body.tenantId) };
            } catch (error: any) {
                set.status = 500;
                return { error: error.message ?? "Unexpected error." };
            }
        },
        {
            body: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            detail: { summary: "Reintenta envío a SUNAT de ventas y notas PENDING_SUNAT" },
        }
    )
    .get(
        "/notes",
        async ({ query, set }) => {
            try {
                const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
                const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
                return await listBillingNotes(query.tenantId, page, limit);
            } catch (error: any) {
                set.status = 400;
                return { error: error.message };
            }
        },
        {
            query: t.Object({
                tenantId: t.String(),
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
            }),
        }
    );
