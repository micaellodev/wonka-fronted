// Clic derecho en la tarjeta: ampliar una sesión en curso con +30 min / +1 h (cargo aparte, tarifa del local).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, type Ctx } from "./helpers.ts";

let c: Ctx;
let sid = "";
let freeSid = "";
beforeAll(async () => {
    c = await createTenant("qaext");
    await call("PUT", "/playzone/rates", { token: c.adminToken, body: { tenantId: c.tid, durations: [{ minutes: 30, price: 10, label: "30 Min" }, { minutes: 60, price: 15, label: "1 Hora" }], extraPerMinute: 1, freePerMinute: 0.5 } });
    const g = await call("POST", "/playzone/guardians", { token: c.cashierToken, body: { tenantId: c.tid, dni: "70000066", fullName: "Apoderado Ext", childName: "Niño A", phone: "999999999" } });
    const b = await call("POST", `/playzone/guardians/${g.json.data.id}/children`, { token: c.cashierToken, body: { tenantId: c.tid, guardianId: g.json.data.id, fullName: "Niño B" } });
    sid = (await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId: g.json.data.children[0].id, durationMinutes: 30 } })).json.data.id;
    freeSid = (await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId: b.json.data.id } })).json.data.id;
});
afterAll(() => dropTenant(c.tid));

const extend = (id: string, minutes: number) => call("POST", `/playzone/sessions/${id}/extend`, { token: c.cashierToken, body: { tenantId: c.tid, minutes } });

describe("ampliar sesión", () => {
    test("+1 hora: duración 90 y cargo S/ 15 con sku por ampliación", async () => {
        const r = await extend(sid, 60);
        expect(r.status).toBe(200);
        expect(r.json.data.durationMinutes).toBe(90);
        expect(r.json.data.charge.amount).toBe(15);
        expect(r.json.data.charge.sku).toBe(`pz-ext-${sid}~60~90`);
    });
    test("tiempo sin tarifa → 422; sesión de tiempo libre → 422", async () => {
        expect((await extend(sid, 45)).status).toBe(422);
        expect((await extend(freeSid, 30)).status).toBe(422);
    });
    test("quitar del ticket devuelve los minutos; repetir falla", async () => {
        const del = () => call("DELETE", `/playzone/sessions/${sid}/extend`, { token: c.cashierToken, query: { tenantId: c.tid, minutes: 60 } });
        expect((await del()).status).toBe(200);
        expect((await extend(sid, 30)).json.data.durationMinutes).toBe(60);
    });
});
