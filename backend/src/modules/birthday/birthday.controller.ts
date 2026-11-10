import Elysia, { t } from "elysia";
import {
    addHoliday,
    createBirthdayReservation,
    createPlan,
    deletePlan,
    getBirthdayDetails,
    listBirthdayReservations,
    listHolidays,
    listPlans,
    quoteForPlan,
    removeHoliday,
    updateBirthdayGuest,
    updateBirthdayReservation,
    updatePlan,
} from "./birthday.service.ts";
import { CreateBirthdayBody, BirthdayListQuery, UpdateBirthdayGuestBody } from "../../types/schemas.ts";

// ============================================================
//  Birthday Controller — Prefix: /birthdays
//  Planes y feriados los edita el administrador (permiso playzone.rates, ver lib/permissions.ts)
// ============================================================

const fail = (set: { status?: number | string }, err: unknown, status = 422) => {
    set.status = status;
    return { message: err instanceof Error ? err.message : "Error inesperado." };
};

const Extras = t.Array(t.Object({ name: t.String({ minLength: 1 }), qty: t.Integer({ minimum: 0, maximum: 50 }) }), { maxItems: 30 });

const PlanBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1, maxLength: 80 }),
    description: t.Optional(t.String({ maxLength: 300 })),
    benefits: t.Optional(t.String({ maxLength: 2000 })),
    includedGuests: t.Integer({ minimum: 0, maximum: 300 }),
    extraGuestPrice: t.Number({ minimum: 0 }),
    priceWeekday: t.Number({ minimum: 0 }),
    priceSaturday: t.Number({ minimum: 0 }),
    priceSunday: t.Number({ minimum: 0 }),
    extras: t.Array(t.Object({ name: t.String({ minLength: 1, maxLength: 60 }), price: t.Number({ minimum: 0 }) }), { maxItems: 30 }),
    isActive: t.Optional(t.Boolean()),
});

const tenantQuery = t.Object({ tenantId: t.String({ minLength: 1 }) });

export const birthdayController = new Elysia({ prefix: "/birthdays", tags: ["Birthdays"] })

    // ── Planes ───────────────────────────────────────────────
    .get("/plans", async ({ query }) => ({ data: await listPlans(query.tenantId, query.active === "true") }), {
        query: t.Object({ tenantId: t.String({ minLength: 1 }), active: t.Optional(t.String()) }),
        detail: { summary: "List birthday plans (active=true for the reservation form)" },
    })
    .post("/plans", async ({ body, set }) => {
        try { const { tenantId, ...input } = body; set.status = 201; return { data: await createPlan(tenantId, input) }; } catch (err) { return fail(set, err); }
    }, { body: PlanBody, detail: { summary: "Create a birthday plan" } })
    .patch("/plans/:id", async ({ params, body, set }) => {
        try { const { tenantId, ...input } = body; await updatePlan(tenantId, params.id, input); return { success: true }; } catch (err) { return fail(set, err); }
    }, { params: t.Object({ id: t.String() }), body: PlanBody, detail: { summary: "Update a birthday plan" } })
    .delete("/plans/:id", async ({ params, query, set }) => {
        try { await deletePlan(query.tenantId, params.id); return { success: true }; } catch (err) { return fail(set, err); }
    }, { params: t.Object({ id: t.String() }), query: tenantQuery, detail: { summary: "Delete a birthday plan (only without reservations)" } })

    // ── Feriados ─────────────────────────────────────────────
    .get("/holidays", async ({ query }) => ({ data: await listHolidays(query.tenantId) }), { query: tenantQuery, detail: { summary: "List holidays (count as Sunday price)" } })
    .post("/holidays", async ({ body, set }) => {
        try { await addHoliday(body.tenantId, body.date, body.label ?? ""); set.status = 201; return { success: true }; } catch (err) { return fail(set, err); }
    }, { body: t.Object({ tenantId: t.String({ minLength: 1 }), date: t.String({ format: "date" }), label: t.Optional(t.String({ maxLength: 60 })) }), detail: { summary: "Add a holiday" } })
    .delete("/holidays/:id", async ({ params, query, set }) => {
        try { await removeHoliday(query.tenantId, params.id); return { success: true }; } catch (err) { return fail(set, err); }
    }, { params: t.Object({ id: t.String() }), query: tenantQuery, detail: { summary: "Remove a holiday" } })

    // ── Cotización: precio según plan, fecha, niños y extras ─
    .post("/quote", async ({ body, set }) => {
        try { return { data: await quoteForPlan(body.tenantId, body.planId, new Date(`${body.date}T00:00:00.000Z`), body.guestCount, body.extras ?? []) }; } catch (err) { return fail(set, err); }
    }, {
        body: t.Object({
            tenantId: t.String({ minLength: 1 }), planId: t.String({ minLength: 1 }), date: t.String({ format: "date" }),
            guestCount: t.Integer({ minimum: 1, maximum: 300 }), extras: t.Optional(Extras),
        }),
        detail: { summary: "Quote a birthday: price changes with the reservation date" },
    })

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
                    planId: body.planId,
                    extras: body.extras,
                });
                set.status = 201;
                return { data: reservation, meta: { message: "Reserva de cumpleaños creada." } };
            } catch (err) { return fail(set, err); }
        },
        { body: CreateBirthdayBody, detail: { summary: "Create a birthday reservation (with an optional plan; returns the cart charge)" } }
    )

    // ── GET /birthdays ───────────────────────────────────────
    .get("/", async ({ query }) => ({ data: await listBirthdayReservations(query.tenantId) }), { query: BirthdayListQuery, detail: { summary: "List birthday reservations" } })

    // ── GET /birthdays/:id ───────────────────────────────────
    .get(
        "/:id",
        async ({ params, query, set }) => {
            try { return { data: await getBirthdayDetails(query.tenantId, params.id) }; } catch (err) { return fail(set, err, 404); }
        },
        { query: tenantQuery, params: t.Object({ id: t.String() }), detail: { summary: "Get birthday reservation details and guests" } }
    )

    // ── PATCH /birthdays/:id (fecha, niños, plan, extras: recalcula el precio) ──
    .patch(
        "/:id",
        async ({ params, body, set }) => {
            try {
                return {
                    data: await updateBirthdayReservation(body.tenantId, params.id, {
                        date: body.date ? new Date(body.date) : undefined,
                        guestCount: body.guestCount, notes: body.notes, planId: body.planId, extras: body.extras,
                    }),
                };
            } catch (err) { return fail(set, err); }
        },
        {
            params: t.Object({ id: t.String() }),
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                date: t.Optional(t.String({ format: "date-time" })),
                guestCount: t.Optional(t.Integer({ minimum: 1, maximum: 300 })),
                notes: t.Optional(t.String()),
                planId: t.Optional(t.String({ minLength: 1 })),
                extras: t.Optional(Extras),
            }),
            detail: { summary: "Change a reservation; the price is recalculated with the new date (unless already paid)" },
        }
    )

    // ── PATCH /birthdays/:id/guests/:guestId ─────────────────
    .patch(
        "/:id/guests/:guestId",
        async ({ params, query, body, set }) => {
            try {
                const guest = await updateBirthdayGuest(query.tenantId, params.guestId, body);
                return { data: guest, meta: { message: "Invitado actualizado." } };
            } catch (err) { return fail(set, err); }
        },
        { query: tenantQuery, params: t.Object({ id: t.String(), guestId: t.String() }), body: UpdateBirthdayGuestBody, detail: { summary: "Update a birthday guest's info or attendance" } }
    );
