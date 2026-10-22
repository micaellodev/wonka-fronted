// Precio del acompañante configurable por local (playzoneRates.companionPrice), con 5 por defecto.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { call, createTenant, dropTenant, type Ctx } from "./helpers.ts";

let c: Ctx;
let childId = "";
beforeAll(async () => {
    c = await createTenant("qacomp");
    const g = await call("POST", "/playzone/guardians", { token: c.cashierToken, body: { tenantId: c.tid, dni: "70000077", fullName: "Apoderado QA", childName: "Niño QA", childAge: 6 } });
    childId = g.json.data.children[0].id;
});
afterAll(() => dropTenant(c.tid));

const rates = (companionPrice?: number) => ({
    tenantId: c.tid,
    durations: [{ minutes: 30, price: 10, label: "30 Min" }],
    extraPerMinute: 1,
    freePerMinute: 0.5,
    ...(companionPrice === undefined ? {} : { companionPrice }),
});
const getRates = async () => (await call("GET", "/playzone/rates", { token: c.cashierToken, query: { tenantId: c.tid } })).json.data;
const startWithCompanion = async () => (await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId, durationMinutes: 30, companions: 1 } })).json.data;

describe("precio del acompañante", () => {
    test("sin configurar: GET devuelve 5 y el cargo es 5", async () => {
        expect((await getRates()).companionPrice).toBe(5);
        expect((await startWithCompanion()).companionsCharge.amount).toBe(5);
    });
    test("tarifas guardadas sin el campo (formato anterior) siguen valiendo 5", async () => {
        expect((await call("PUT", "/playzone/rates", { token: c.adminToken, body: rates() })).status).toBe(200);
        expect((await getRates()).companionPrice).toBe(5);
    });
    test("admin lo cambia a 7: el cargo usa 7; cajero no puede (403); negativo se rechaza", async () => {
        expect((await call("PUT", "/playzone/rates", { token: c.cashierToken, body: rates(7) })).status).toBe(403);
        expect((await call("PUT", "/playzone/rates", { token: c.adminToken, body: rates(-1) })).status).toBe(422);
        expect((await call("PUT", "/playzone/rates", { token: c.adminToken, body: rates(7) })).status).toBe(200);
        expect((await getRates()).companionPrice).toBe(7);
        expect((await startWithCompanion()).companionsCharge.amount).toBe(7);
    });
});
