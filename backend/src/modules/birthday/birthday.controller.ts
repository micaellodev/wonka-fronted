import Elysia, { t } from "elysia";
import {
    createBirthdayReservation,
    listBirthdayReservations,
    getBirthdayDetails,
    updateBirthdayGuest,
} from "./birthday.service.ts";
import {
    CreateBirthdayBody,
    BirthdayListQuery,
    UpdateBirthdayGuestBody,
} from "../../types/schemas.ts";

// ============================================================
//  Birthday Controller — Prefix: /birthdays
// ============================================================

export const birthdayController = new Elysia({ prefix: "/birthdays", tags: ["Birthdays"] })

    // ── POST /birthdays ──────────────────────────────────────
    .post(
        "/",
        async ({ body, set }) => {
            try {
                const reservation = await createBirthdayReservation({
                    tenantId: body.tenantId,
                    guardianId: body.guardianId,
                    date: new Date(body.date),
                    guestCount: body.guestCount,
                    notes: body.notes,
                });
                set.status = 201;
                return { data: reservation, meta: { message: "Reserva de cumpleaños creada." } };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = 422;
                return { message };
            }
        },
        {
            body: CreateBirthdayBody,
            detail: { summary: "Create a birthday reservation" },
        }
    )

    // ── GET /birthdays ───────────────────────────────────────
    .get(
        "/",
        async ({ query }) => {
            const reservations = await listBirthdayReservations(query.tenantId);
            return { data: reservations };
        },
        {
            query: BirthdayListQuery,
            detail: { summary: "List birthday reservations" },
        }
    )

    // ── GET /birthdays/:id ───────────────────────────────────
    .get(
        "/:id",
        async ({ params, query, set }) => {
            try {
                const reservation = await getBirthdayDetails(query.tenantId, params.id);
                return { data: reservation };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = 404;
                return { message };
            }
        },
        {
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            params: t.Object({ id: t.String() }),
            detail: { summary: "Get birthday reservation details and guests" },
        }
    )

    // ── PATCH /birthdays/:id/guests/:guestId ─────────────────
    .patch(
        "/:id/guests/:guestId",
        async ({ params, query, body, set }) => {
            try {
                const guest = await updateBirthdayGuest(query.tenantId, params.guestId, body);
                return { data: guest, meta: { message: "Invitado actualizado." } };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error inesperado.";
                set.status = 422;
                return { message };
            }
        },
        {
            query: t.Object({ tenantId: t.String({ minLength: 1 }) }),
            params: t.Object({ id: t.String(), guestId: t.String() }),
            body: UpdateBirthdayGuestBody,
            detail: { summary: "Update a birthday guest's info or attendance" },
        }
    );
