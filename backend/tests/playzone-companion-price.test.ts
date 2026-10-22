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

describe("mismos precios para cualquier edad", () => {
    let babyId = "";
    beforeAll(async () => {
        await call("PUT", "/playzone/rates", { token: c.adminToken, body: { tenantId: c.tid, durations: [{ minutes: 30, price: 10, label: "30 Min" }, { minutes: 60, price: 15, label: "1 Hora" }], extraPerMinute: 1, freePerMinute: 0.5, companionPrice: 5 } });
        const g = await call("POST", "/playzone/guardians", { token: c.cashierToken, body: { tenantId: c.tid, dni: "70000088", fullName: "Apoderado Bebé", childName: "Bebé QA", childAge: 2 } });
        babyId = g.json.data.children[0].id;
    });
    const start = async (childId: string, durationMinutes: number, companions = 0) =>
        (await call("POST", "/playzone/sessions", { token: c.cashierToken, body: { tenantId: c.tid, childId, durationMinutes, companions } })).json.data;

    test("menor de 3 años: 30 min = 10 y 1 hora = 15, y la sesión queda pendiente de cobro", async () => {
        const a = await start(babyId, 30);
        expect(a.charge.amount).toBe(10);
        expect(a.status).toBe("PENDING");
        expect((await start(babyId, 60)).charge.amount).toBe(15);
    });
    test("mayor de 3 años paga lo mismo", async () => {
        expect((await start(childId, 30)).charge.amount).toBe(10);
        expect((await start(childId, 60)).charge.amount).toBe(15);
    });
    test("acompañante: 5 c/u, también para menores de 3 años (ninguno incluido)", async () => {
        const baby = await start(babyId, 30, 2);
        expect(baby.charge.amount).toBe(10);
        expect(baby.companionsCharge.amount).toBe(10);
        expect((await start(childId, 30, 1)).companionsCharge.amount).toBe(5);
    });
});
