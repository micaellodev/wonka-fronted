import Elysia, { t } from "elysia";
import { getDashboardStats, getSalesReport, getTenantById, updateTenant } from "./dashboard.service.ts";
import { verifyAdmin } from "../hr/hr.service.ts";
import { RateLimitError } from "../../lib/rateLimiter.ts";
import { prisma } from "../../lib/prisma.ts";

// ============================================================
//  Dashboard Controller — Prefix: /dashboard
// ============================================================

export const dashboardController = new Elysia({ prefix: "/dashboard", tags: ["Dashboard"] })
    .get(
        "/metrics",
        async ({ query }) => {
            const stats = await getDashboardStats(query.tenantId, query.date);
            return {
                success: true,
                data: stats,
            };
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                date: t.Optional(t.String({ format: "date" })),
            }),
            detail: { summary: "Get admin dashboard KPIs" },
        }
    )
    .get(
        "/sales-report",
        async ({ query, set }) => {
            try {
                return { success: true, ...(await getSalesReport(query.tenantId, query.from, query.to)) };
            } catch (err) {
                set.status = 422;
                return { success: false, message: err instanceof Error ? err.message : "Unexpected error." };
            }
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                from: t.String({ format: "date" }),
                to: t.String({ format: "date" }),
            }),
            detail: { summary: "Sales of a Lima date range with DB-computed totals" },
        }
    )
    .get(
        "/settings",
        async ({ query, set }) => {
            const tenant = await getTenantById(query.tenantId);
            if (!tenant) {
                set.status = 404;
                return { success: false, message: "Tenant not found." };
            }
            return {
                success: true,
                data: tenant,
            };
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
            }),
            detail: { summary: "Get tenant fiscal configuration" },
        }
    )
    .get(
        "/audit",
        async ({ query }) => {
            const rows = await prisma.auditLog.findMany({
                where: { tenantId: query.tenantId },
                orderBy: { createdAt: "desc" },
                take: query.limit ?? 50,
            });
            return { success: true, data: rows };
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
            }),
            detail: { summary: "Config-change audit trail (newest first)" },
        }
    )
    .patch(
        "/settings",
        async ({ query, body, set }) => {
            let actor: { id: string; name: string };
            try {
                actor = (await verifyAdmin(query.tenantId, body.adminPin)).worker;
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unexpected error.";
                set.status =
                    err instanceof RateLimitError
                        ? 429
                        : message === "Pin Inválido." || message === "Worker does not have ADMIN privileges."
                          ? 401
                          : 422;
                return { success: false, message };
            }

            const { adminPin, ...updateFields } = body;
            try {
                const tenant = await updateTenant(query.tenantId, updateFields, actor);
                return {
                    success: true,
                    data: tenant,
                };
            } catch (err) {
                console.error("[dashboard] updateTenant failed:", err);
                set.status = 422;
                // Prisma errors are multi-line; keep only the last line (the actual reason).
                const raw = err instanceof Error ? err.message : "Unexpected error.";
                return { success: false, message: raw.trim().split("\n").pop() || raw };
            }
        },
        {
            query: t.Object({
                tenantId: t.String({ minLength: 1 }),
            }),
            body: t.Composite([
                t.Object({
                    /** Admin's own 5-digit PIN, required to authorize this privileged action. */
                    adminPin: t.String({ minLength: 1 }),
                }),
                t.Partial(
                    t.Object({
                        name: t.String(),
                        ruc: t.String(),
                        razonSocial: t.String(),
                        nombreComercial: t.String(),
                        direccion: t.String(),
                        ubigeo: t.String(),
                        departamento: t.String(),
                        provincia: t.String(),
                        distrito: t.String(),
                        receiptFooter: t.String({ maxLength: 300 }),
                        apisperuToken: t.String(),
                        apisperuUrl: t.String(),
                        igvRate: t.Numeric(),
                        defaultIgvRegime: t.String({ pattern: "^(GRAVADO|GRAVADO_10_5|EXONERADO|INAFECTO|ICBPER)$" }),
                        pricesIncludeIgv: t.Boolean(),
                        electronicInvoicingEnabled: t.Boolean(),
                        serieBoleta: t.String(),
                        serieFactura: t.String(),
                        serieNotaCredito: t.String(),
                        serieNotaDebito: t.String(),
                        lastBoletaNumber: t.Integer({ minimum: 0 }),
                        lastFacturaNumber: t.Integer({ minimum: 0 }),
                        lastNotaCredito: t.Integer({ minimum: 0 }),
                        lastNotaDebito: t.Integer({ minimum: 0 }),
                    })
                ),
            ]),
            detail: { summary: "Update tenant fiscal configuration (requires admin PIN)" },
        }
    );
