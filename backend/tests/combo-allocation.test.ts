import { describe, expect, test } from "bun:test";
import { allocateCombos, splitProportional } from "../src/modules/combo/combo.service.ts";

const galleta = { id: "c1", name: "2 galletas", price: 3, items: [{ productId: "p-galleta", qty: 2 }] };
const prods = (qty: number) => new Map([["p-galleta", { qty, price: 2 }]]);

describe("combos", () => {
    test("2 galletas a S/3: descuento de S/1", () => {
        const r = allocateCombos([galleta], [{ comboId: "c1", times: 1 }], prods(2), []);
        expect(r.productDiscount.get("p-galleta")).toBe(1);
        expect(r.applied[0]!.discount).toBe(1);
    });
    test("4 galletas = el combo 2 veces: S/2 de descuento", () => {
        expect(allocateCombos([galleta], [{ comboId: "c1", times: 2 }], prods(4), []).productDiscount.get("p-galleta")).toBe(2);
    });
    test("con 3 galletas solo se puede aplicar una vez", () => {
        expect(() => allocateCombos([galleta], [{ comboId: "c1", times: 2 }], prods(3), [])).toThrow();
    });
    test("combo con tiempo: 1 hora + 1 galleta, el descuento se reparte entre ambas líneas", () => {
        const combo = { id: "c2", name: "hora+galleta", price: 14, items: [{ minutes: 60, qty: 1 }, { productId: "p-galleta", qty: 1 }] };
        const r = allocateCombos([combo], [{ comboId: "c2", times: 1 }], prods(1), [{ sku: "pz-base-s1", minutes: 60, amount: 15 }]);
        const total = (r.productDiscount.get("p-galleta") ?? 0) + (r.timeDiscount.get("pz-base-s1") ?? 0);
        expect(total).toBe(3);
        expect(r.timeDiscount.get("pz-base-s1")).toBeGreaterThan(r.productDiscount.get("p-galleta")!);
    });
    test("sin el tiempo en la venta, el combo no aplica", () => {
        const combo = { id: "c2", name: "hora+galleta", price: 14, items: [{ minutes: 60, qty: 1 }, { productId: "p-galleta", qty: 1 }] };
        expect(() => allocateCombos([combo], [{ comboId: "c2", times: 1 }], prods(1), [])).toThrow();
    });
    test("el reparto en centavos siempre suma el descuento", () => {
        expect(splitProportional([1, 1, 1], 1).reduce((a, b) => Math.round((a + b) * 100) / 100, 0)).toBe(1);
        expect(splitProportional([2, 5, 3], 0.97).reduce((a, b) => Math.round((a + b) * 100) / 100, 0)).toBe(0.97);
    });
});
