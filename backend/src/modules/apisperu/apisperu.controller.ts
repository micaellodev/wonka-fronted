import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma.ts";
import { consultaDNI, consultaRUC } from "./apisperu.service.ts";

// ============================================================
//  APISPeru Controller — DNI/RUC queries only
//  Invoice/credit-note emission is handled internally by POS.
// ============================================================

export const apisperuController = new Elysia({ prefix: "/apisperu" })
    .get(
        "/dni/:dni",
        async ({ params, query }) => {
            const tenantId = query.tenantId as string;
            if (!tenantId) {
                throw new Error("tenantId is required");
            }

            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            const token = process.env["APISPERU_TOKEN"] || tenant?.apisperuToken;
            if (!token) {
                throw new Error("El token de APISPeru no está configurado. Configúralo en Ajustes de Empresa o mediante la variable de entorno APISPERU_TOKEN.");
            }

            const result = await consultaDNI(
                params.dni,
                token
            );

            return {
                success: true,
                data: result,
            };
        },
        {
            params: t.Object({
                dni: t.String({ minLength: 8, maxLength: 8 }),
            }),
            query: t.Object({
                tenantId: t.String(),
            }),
            detail: {
                summary: "Consult DNI via APISPeru",
                tags: ["APISPeru"],
            },
        }
    )
    .get(
        "/ruc/:ruc",
        async ({ params, query }) => {
            const tenantId = query.tenantId as string;
            if (!tenantId) {
                throw new Error("tenantId is required");
            }

            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            const token = process.env["APISPERU_TOKEN"] || tenant?.apisperuToken;
            if (!token) {
                throw new Error("El token de APISPeru no está configurado. Configúralo en Ajustes de Empresa o mediante la variable de entorno APISPERU_TOKEN.");
            }

            const result = await consultaRUC(
                params.ruc,
                token
            );

            return {
                success: true,
                data: result,
            };
        },
        {
            params: t.Object({
                ruc: t.String({ minLength: 11, maxLength: 11 }),
            }),
            query: t.Object({
                tenantId: t.String(),
            }),
            detail: {
                summary: "Consult RUC via APISPeru",
                tags: ["APISPeru"],
            },
        }
    );
