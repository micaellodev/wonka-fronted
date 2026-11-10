import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { hrController } from "./modules/hr/hr.controller.ts";
import { inventoryController } from "./modules/inventory/inventory.controller.ts";
import { posController } from "./modules/pos/pos.controller.ts";
import { uploadController } from "./modules/upload/upload.controller.ts";
import { playzoneController } from "./modules/playzone/playzone.controller.ts";
import { cashController } from "./modules/cash/cash.controller.ts";
import { billingController } from "./modules/billing/billing.controller.ts";
import { apisperuController } from "./modules/apisperu/apisperu.controller.ts";
import { dashboardController } from "./modules/dashboard/dashboard.controller.ts";
import { birthdayController } from "./modules/birthday/birthday.controller.ts";
import { comboController } from "./modules/combo/combo.controller.ts";
import { cors } from "@elysiajs/cors";
import { authGuard } from "./lib/auth.ts";

// ============================================================
//  Wonka POS — Application Entry Point
// ============================================================

const PORT = Number(process.env["PORT"] ?? 3000);

export function buildApp() {
    return new Elysia()
        // ── CORS — allow the Vite dev frontend and any future origin ──
        .use(
            cors({
                origin: [
                    'http://localhost:5173',
                    'https://wonka-fronted-production.up.railway.app',
                    'tauri://localhost',
                    'http://tauri.localhost',
                    'https://tauri.localhost',
                    'http://localhost:5174',
                    // Electron loads dist/index.html via file://, which sends Origin: null; auth is Bearer, not cookies
                    'null'
                ],
                methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization'],
                credentials: true,
            })
        )
        .use(
            swagger({
                documentation: {
                    info: {
                        title: "Wonka POS API",
                        version: "1.0.0",
                        description:
                            "Multi-tenant Point of Sale & Management System API. " +
                            "Built with Bun, ElysiaJS, Prisma, and PostgreSQL.",
                    },
                    tags: [
                        { name: "HR", description: "Workers, roles, and attendance management" },
                        { name: "Inventory", description: "Products and categories" },
                        { name: "POS", description: "Sales and transactions" },
                        { name: "PlayZone", description: "Children play sessions and wristband time tracking" },
                        { name: "Birthdays", description: "Birthday reservations and guest management" },
                        { name: "Cash Management", description: "Cash drawer opening and closing, daily reconciliation" },
                    ],
                },
            })
        )

        // ── Auth guard (token, tenant match, admin routes) — see lib/auth.ts ──
        .use(authGuard)

        // ── Health check ─────────────────────────────────────────
        .get(
            "/health",
            () => ({
                status: "ok",
                service: "wonka-pos",
                timestamp: new Date().toISOString(),
            }),
            { detail: { summary: "Health check", tags: ["System"] } }
        )

        // ── Module controllers ───────────────────────────────────
        .use(hrController)
        .use(inventoryController)
        .use(posController)
        .use(uploadController)
        .use(cashController)
        .use(playzoneController)
        .use(billingController)
        .use(apisperuController)
        .use(dashboardController)
        .use(birthdayController)
        .use(comboController)

        // ── Global error handler ─────────────────────────────────
        .onError(({ code, error }) => {
            console.error(`[${code}]`, error);
            return {
                error: true,
                code,
                message:
                    error instanceof Error ? error.message : "An unexpected error occurred.",
            };
        });
}

const app = buildApp().listen({ port: PORT, hostname: "0.0.0.0" });

console.log(
    `🍫 Wonka POS is running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(
    `📚 Swagger docs available at http://${app.server?.hostname}:${app.server?.port}/swagger`
);

export { app };
export type App = typeof app;
