import { describe, expect, test } from "bun:test";
import { dayKindOf, quoteBirthday, type PricingPlan } from "../src/modules/birthday/birthday.pricing.ts";

const plan: PricingPlan = {
    priceWeekday: 200, priceSaturday: 300, priceSunday: 350, includedGuests: 10, extraGuestPrice: 15,
    extras: [{ name: "Piñata", price: 30 }, { name: "Show", price: 80 }],
};
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const noHolidays = new Set<string>();

describe("precio de cumpleaños según la fecha", () => {
    test("lunes a viernes, sábado y domingo tienen su precio", () => {
        expect(quoteBirthday(plan, d("2026-11-11"), 10, [], noHolidays).total).toBe(200); // miércoles
        expect(quoteBirthday(plan, d("2026-11-14"), 10, [], noHolidays).total).toBe(300); // sábado
        expect(quoteBirthday(plan, d("2026-11-15"), 10, [], noHolidays).total).toBe(350); // domingo
    });
    test("un feriado cobra como domingo", () => {
        expect(dayKindOf(d("2026-12-25"), new Set(["2026-12-25"]))).toBe("sunday");
        expect(quoteBirthday(plan, d("2026-12-25"), 10, [], new Set(["2026-12-25"])).total).toBe(350);
    });
    test("niños adicionales y extras suman", () => {
        const q = quoteBirthday(plan, d("2026-11-14"), 13, [{ name: "Piñata", qty: 1 }, { name: "Show", qty: 2 }], noHolidays);
        expect(q.extraGuests).toBe(3);
        expect(q.total).toBe(300 + 45 + 30 + 160);
    });
    test("cambiar la fecha cambia el precio", () => {
        const weekday = quoteBirthday(plan, d("2026-11-11"), 12, [], noHolidays).total;
        const weekend = quoteBirthday(plan, d("2026-11-15"), 12, [], noHolidays).total;
        expect(weekend - weekday).toBe(150);
    });
    test("un extra que no existe en el plan se rechaza", () => {
        expect(() => quoteBirthday(plan, d("2026-11-11"), 10, [{ name: "Globo gigante", qty: 1 }], noHolidays)).toThrow();
    });
});
