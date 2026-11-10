import { describe, expect, test } from "bun:test";
import { calculateFiscalLine } from "../src/modules/apisperu/apisperu.service.ts";

describe("calculateFiscalLine con descuento", () => {
    test("exonerado: total de la línea baja por el descuento", () => {
        const l = calculateFiscalLine(10, 3, "EXONERADO", 18, false, 5);
        expect(l.mtoValorVenta).toBe(25);
        expect(l.mtoImpItem).toBe(25);
        expect(l.mtoIGV).toBe(0);
        expect(l.mtoDescuento).toBe(5);
        expect(l.mtoBaseDescuento).toBe(30);
    });
    test("gravado con precios sin IGV: IGV sobre la base ya descontada", () => {
        const l = calculateFiscalLine(100, 1, "GRAVADO", 18, false, 10);
        expect(l.mtoValorVenta).toBe(90);
        expect(l.mtoIGV).toBe(16.2);
        expect(l.mtoImpItem).toBe(106.2);
        expect(l.mtoDescuento).toBe(10);
    });
    test("gravado con precios con IGV: el descuento también incluye IGV", () => {
        const l = calculateFiscalLine(118, 1, "GRAVADO", 18, true, 11.8);
        expect(l.mtoImpItem).toBe(106.2); // 118 - 11.80
        expect(l.mtoValorVenta).toBe(90);
        expect(l.mtoDescuento).toBe(10);
    });
    test("sin descuento todo queda igual que antes", () => {
        const l = calculateFiscalLine(118, 2, "GRAVADO", 18, true);
        expect(l.mtoImpItem).toBe(236);
        expect(l.mtoDescuento).toBe(0);
    });
});
