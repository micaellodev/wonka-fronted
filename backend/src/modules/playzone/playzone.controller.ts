import Elysia, { t } from "elysia";
import {
    lookupGuardian,
    listGuardians,
    createGuardian,
    addChild,
    createPlaySession,
    lookupSessionByCode,
    listActiveSessions,
    completeSession,
    cancelPendingSession,
    getPlayzoneReportSummary,
    getPlayzoneRates,
    updatePlayzoneRates,
} from "./playzone.service.ts";
import {
    GuardianLookupQuery,
    GuardianListQuery,
    CreateGuardianBody,
    AddChildBody,
    CreatePlaySessionBody,
    PlaySessionLookupQuery,
    PlaySessionListQuery,
    PlayzoneReportQuery,
    PlayzoneRatesQuery,
    UpdatePlayzoneRatesBody,
} from "../../types/schemas.ts";

// ============================================================
//  Play Zone Controller — Prefix: /playzone
// ============================================================

export const playzoneController = new Elysia({ prefix: "/playzone", tags: ["PlayZone"] })

    // ── GET /playzone/guardians/lookup ───────────────────────
    .get(
        "/guardians/lookup",
        async ({ query, set }) => {
            const guardian = await lookupGuardian(query.tenantId, query.q);
            if (!guardian) {
                set.status = 404;
                return { data: null, found: false };
            }
            return { data: guardian, found: true };
        },
        {
            query: GuardianLookupQuery,
            detail: { summary: "Lookup a guardian by DNI or phone number" },
        }
    )

    // ── GET /playzone/guardians ───────────────────────────────
    .get(
        "/guardians",
        async ({ query }) => {
            const result = await listGuardians({
                tenantId: query.tenantId,
                ...(query.search !== undefined ? { search: query.search } : {}),
                page: query.page ?? 1,
                limit: query.limit ?? 20,
            });
            return result;
        },
        {
            query: GuardianListQuery,
            detail: {
                summary: "List/search guardians for a tenant (paginated client roster)",
                description: "Optional `search` matches guardian full name or DNI (substring).",
            },
        }
    )

    // ── POST /playzone/guardians ─────────────────────────────
    .post(
        "/guardians",
        async ({ body, set }) => {
            try {
                const guardian = await createGuardian({
                    tenantId: body.tenantId,
                    dni: body.dni,
                    ...(body.phone !== undefined ? { phone: body.phone } : {}),
                    fullName: body.fullName,
                    childName: body.childName,
                    ...(body.childDni !== undefined ? { childDni: body.childDni } : {}),
                    ...(body.childAge !== undefined ? { childAge: body.childAge } : {}),
                    ...(body.childGender !== undefined ? { childGender: body.childGender } : {}),
                });
                set.status = 201;
                return { data: guardian };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = message.toLowerCase().includes("ya existe") ? 409 : 422;
                return { message };
            }
        },
        {
            body: CreateGuardianBody,
            detail: { summary: "Register a new guardian and their first child" },
        }
    )

    // ── POST /playzone/guardians/:id/children ────────────────
    .post(
        "/guardians/:id/children",
        async ({ params, body, set }) => {
            try {
                const child = await addChild({
                    tenantId: body.tenantId,
                    guardianId: params.id,
                    fullName: body.fullName,
                    ...(body.dni !== undefined ? { dni: body.dni } : {}),
                    ...(body.age !== undefined ? { age: body.age } : {}),
                    ...(body.gender !== undefined ? { gender: body.gender } : {}),
                });
                set.status = 201;
                return { data: child };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = 422;
                return { message };
            }
        },
        {
            params: t.Object({ id: t.String() }),
            body: AddChildBody,
            detail: { summary: "Add a child to an existing guardian" },
        }
    )

    // ── GET /playzone/sessions ───────────────────────────────
    .get(
        "/sessions",
        async ({ query }) => {
            const sessions = await listActiveSessions(query.tenantId);
            return { data: sessions };
        },
        {
            query: PlaySessionListQuery,
            detail: { summary: "List all active play sessions for a tenant" },
        }
    )

    // ── GET /playzone/sessions/lookup ────────────────────────
    .get(
        "/sessions/lookup",
        async ({ query, set }) => {
            const session = await lookupSessionByCode(query.tenantId, query.code);
            if (!session) {
                set.status = 404;
                return { message: `No hay sesión activa con código ${query.code}` };
            }
            return { data: session };
        },
        {
            query: PlaySessionLookupQuery,
            detail: { summary: "Find an active session by 3-digit wristband code" },
        }
    )

    // ── POST /playzone/sessions ──────────────────────────────
    .post(
        "/sessions",
        async ({ body, set }) => {
            try {
                const session = await createPlaySession({
                    tenantId: body.tenantId,
                    childId: body.childId,
                    ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
                    ...(body.companions !== undefined ? { companions: body.companions } : {}),
                    ...(body.notes !== undefined ? { notes: body.notes } : {}),
                });
                set.status = 201;
                return {
                    data: session,
                    meta: { message: `Sesión iniciada. Código: ${session.wristbandCode}` },
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = 422;
                return { message };
            }
        },
        {
            body: CreatePlaySessionBody,
            detail: { summary: "Start a play session for a registered child" },
        }
    )

    // ── PATCH /playzone/sessions/:id/complete ────────────────
    .patch(
        "/sessions/:id/complete",
        async ({ params, query, set }) => {
            try {
                const session = await completeSession(query.tenantId, params.id);
                return { data: session, meta: { message: "Sesión finalizada." } };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = message.includes("no encontrada") ? 404 : 422;
                return { message };
            }
        },
        {
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            params: t.Object({ id: t.String() }),
            detail: { summary: "Complete (check out) an active play session" },
        }
    )

    // ── DELETE /playzone/sessions/:id/cancel ─────────────────
    .delete(
        "/sessions/:id/cancel",
        async ({ params, query, set }) => {
            try {
                await cancelPendingSession(query.tenantId, params.id);
                return { meta: { message: "Sesión cancelada." } };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = message.includes("no encontrada") ? 404 : 422;
                return { message };
            }
        },
        {
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            params: t.Object({ id: t.String() }),
            detail: { summary: "Cancel a play session still pending payment (removed from the cart)" },
        }
    )

    // ── GET /playzone/rates ──────────────────────────────────
    .get(
        "/rates",
        async ({ query, set }) => {
            try {
                return { data: await getPlayzoneRates(query.tenantId) };
            } catch (err) {
                set.status = 404;
                return { message: err instanceof Error ? err.message : "Error inesperado." };
            }
        },
        {
            query: PlayzoneRatesQuery,
            detail: { summary: "Tarifas de zona de juegos del tenant (defaults si no hay configuración)" },
        }
    )

    // ── PUT /playzone/rates (admin) ──────────────────────────
    .put(
        "/rates",
        async ({ body, set }) => {
            try {
                const { tenantId, ...rates } = body;
                return { data: await updatePlayzoneRates(tenantId, rates) };
            } catch (err) {
                set.status = 422;
                return { message: err instanceof Error ? err.message : "Error inesperado." };
            }
        },
        {
            body: UpdatePlayzoneRatesBody,
            detail: { summary: "Configurar tarifas de zona de juegos (admin)" },
        }
    )

    // ── GET /playzone/reports/summary ────────────────────────
    .get(
        "/reports/summary",
        async ({ query }) => {
            const summary = await getPlayzoneReportSummary(
                query.tenantId,
                query.days ?? 30
            );
            return { data: summary };
        },
        {
            query: PlayzoneReportQuery,
            detail: { summary: "PlayZone dashboard metrics and averages" },
        }
    )


