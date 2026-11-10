import { Elysia, t } from "elysia";
import { createCombo, deleteCombo, listCombos, updateCombo } from "./combo.service.ts";

// ============================================================
//  Combos — Prefix: /combos (las escrituras exigen permiso de inventario, ver lib/permissions.ts)
// ============================================================

const ComboBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1, maxLength: 80 }),
    price: t.Number({ minimum: 0 }),
    isActive: t.Optional(t.Boolean()),
    items: t.Array(
        t.Object({
            productId: t.Optional(t.String({ minLength: 1 })),
            minutes: t.Optional(t.Integer({ minimum: 1 })),
            qty: t.Integer({ minimum: 1, maximum: 50 }),
        }),
        { minItems: 1, maxItems: 20 }
    ),
});

const fail = (set: { status?: number | string }, err: unknown) => {
    set.status = 422;
    return { message: err instanceof Error ? err.message : "Unexpected error." };
};

export const comboController = new Elysia({ prefix: "/combos", tags: ["Combos"] })
    .get(
        "/",
        async ({ query }) => ({ data: await listCombos(query.tenantId, query.active === "true") }),
        { query: t.Object({ tenantId: t.String({ minLength: 1 }), active: t.Optional(t.String()) }), detail: { summary: "List combos (active=true for the POS)" } }
    )
    .post(
        "/",
        async ({ body, set }) => {
            try {
                const { tenantId, ...input } = body;
                set.status = 201;
                return { data: await createCombo(tenantId, input) };
            } catch (err) { return fail(set, err); }
        },
        { body: ComboBody, detail: { summary: "Create a combo" } }
    )
    .patch(
        "/:id",
        async ({ params, body, set }) => {
            try {
                const { tenantId, ...input } = body;
                return { data: await updateCombo(tenantId, params.id, input) };
            } catch (err) { return fail(set, err); }
        },
        { params: t.Object({ id: t.String({ minLength: 1 }) }), body: ComboBody, detail: { summary: "Update a combo" } }
    )
    .delete(
        "/:id",
        async ({ params, query, set }) => {
            try {
                await deleteCombo(query.tenantId, params.id);
                return { success: true };
            } catch (err) { return fail(set, err); }
        },
        { params: t.Object({ id: t.String({ minLength: 1 }) }), query: t.Object({ tenantId: t.String({ minLength: 1 }) }), detail: { summary: "Delete a combo" } }
    );
