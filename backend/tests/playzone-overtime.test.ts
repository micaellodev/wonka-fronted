import { describe, expect, test } from "bun:test";
import { computePlayzoneCharge, DEFAULT_PLAYZONE_RATES, overtimeBlocks } from "../src/modules/playzone/playzone.service.ts";

const rates = { ...DEFAULT_PLAYZONE_RATES }; // 30 min = S/10, tolerancia 5, bloque 30

describe("tiempo extra por bloques", () => {
    test("hasta la tolerancia no se cobra", () => {
        expect(overtimeBlocks(0, rates)).toBe(0);
        expect(overtimeBlocks(5, rates)).toBe(0);
    });
    test("pasada la tolerancia se suma un bloque de 30 min de frente", () => {
        expect(overtimeBlocks(6, rates)).toBe(1);
        expect(overtimeBlocks(30, rates)).toBe(1);
    });
    test("si se agota ese bloque sin finalizar, se genera otro", () => {
        expect(overtimeBlocks(31, rates)).toBe(2);
        expect(overtimeBlocks(60, rates)).toBe(2);
        expect(overtimeBlocks(61, rates)).toBe(3);
    });
    test("tolerancia y bloque configurables", () => {
        expect(overtimeBlocks(10, { ...rates, toleranceMinutes: 10 })).toBe(0);
        expect(overtimeBlocks(11, { ...rates, toleranceMinutes: 10 })).toBe(1);
    });
    test("el cargo extra es bloques x precio de la tarifa de 30 min", () => {
        const start = new Date("2026-01-01T10:00:00Z");
        const session = { id: "s1", durationMinutes: 30, companions: 0, startTime: start, wristbandCode: "001", child: { fullName: "NINO", age: 5 },
            endTime: new Date(start.getTime() + (30 + 40) * 60_000) }; // 40 min pasados => 2 bloques
        expect(computePlayzoneCharge(session, "extra", rates).amount).toBe(20);
        const inTolerance = { ...session, endTime: new Date(start.getTime() + 34 * 60_000) };
        expect(() => computePlayzoneCharge(inTolerance, "extra", rates)).toThrow();
    });
});
