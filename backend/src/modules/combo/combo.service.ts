import { prisma } from "../../lib/prisma.ts";
import { getPlayzoneRates } from "../playzone/playzone.service.ts";

// ============================================================
//  Combos / promociones: "2 galletas a S/3" o "1 hora + 1 galleta a S/X".
//  El precio normal de los componentes menos el precio del combo es un descuento
//  que se reparte entre las líneas de la venta (el servidor lo calcula siempre).
// ============================================================

export type ComboItem = { productId?: string; minutes?: number; qty: number };
export type ComboInput = { name: string; price: number; isActive?: boolean; items: ComboItem[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reparte `total` entre `weights` en proporción, en centavos exactos (el último absorbe el redondeo). */
export function splitProportional(weights: number[], total: number): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = weights.map((w) => (sum > 0 ? round2((total * w) / sum) : 0));
    const diff = round2(total - out.reduce((a, b) => a + b, 0));
    if (out.length > 0) out[out.length - 1] = round2(out[out.length - 1]! + diff);
    return out;
}

type ComboRow = { id: string; name: string; price: number; items: ComboItem[] };
export type ComboRequest = { comboId: string; times: number };

/**
 * Aplica combos a una venta: valida que estén los componentes y calcula el descuento por línea.
 * `products`: productos de la venta (cantidad y precio de lista). `timeLines`: cargos de tiempo base elegibles.
 */
export function allocateCombos(
    combos: ComboRow[],
    requests: ComboRequest[],
    products: Map<string, { qty: number; price: number }>,
    timeLines: Array<{ sku: string; minutes: number; amount: number }>
) {
    const remaining = new Map([...products].map(([id, p]) => [id, p.qty]));
    const pool = [...timeLines];
    const productDiscount = new Map<string, number>();
    const timeDiscount = new Map<string, number>();
    const applied: Array<{ comboId: string; name: string; times: number; discount: number }> = [];

    for (const req of requests) {
        const combo = combos.find((c) => c.id === req.comboId);
        if (!combo) throw new Error("Combo no encontrado o desactivado.");
        if (!Number.isInteger(req.times) || req.times < 1) throw new Error(`Cantidad inválida para el combo "${combo.name}".`);
        let comboTotal = 0;
        for (let rep = 0; rep < req.times; rep++) {
            const picks: Array<{ kind: "p" | "t"; key: string; amount: number }> = [];
            for (const comp of combo.items) {
                if (comp.productId) {
                    const have = remaining.get(comp.productId) ?? 0;
                    if (have < comp.qty) throw new Error(`El combo "${combo.name}" no aplica: faltan productos en la venta.`);
                    remaining.set(comp.productId, have - comp.qty);
                    picks.push({ kind: "p", key: comp.productId, amount: round2(products.get(comp.productId)!.price * comp.qty) });
                } else {
                    for (let q = 0; q < comp.qty; q++) {
                        const idx = pool.findIndex((t) => t.minutes === comp.minutes);
                        if (idx < 0) throw new Error(`El combo "${combo.name}" no aplica: falta el tiempo de ${comp.minutes} min en la venta.`);
                        const [t] = pool.splice(idx, 1);
                        picks.push({ kind: "t", key: t!.sku, amount: t!.amount });
                    }
                }
            }
            const regular = round2(picks.reduce((s, p) => s + p.amount, 0));
            const disc = round2(regular - combo.price);
            if (disc <= 0) throw new Error(`El combo "${combo.name}" ya no da descuento con los precios actuales.`);
            const shares = splitProportional(picks.map((p) => p.amount), disc);
            picks.forEach((p, i) => {
                const m = p.kind === "p" ? productDiscount : timeDiscount;
                m.set(p.key, round2((m.get(p.key) ?? 0) + shares[i]!));
            });
            comboTotal += disc;
        }
        applied.push({ comboId: combo.id, name: combo.name, times: req.times, discount: round2(comboTotal) });
    }
    return { productDiscount, timeDiscount, applied };
}

// ── CRUD ─────────────────────────────────────────────────────

const parseItems = (v: unknown): ComboItem[] => (Array.isArray(v) ? (v as ComboItem[]) : []);

export async function listCombos(tenantId: string, onlyActive = false) {
    const rows = await prisma.combo.findMany({
        where: { tenantId, ...(onlyActive ? { isActive: true } : {}) },
        orderBy: { name: "asc" },
        take: 200,
    });
    return rows.map((c) => ({ ...c, price: Number(c.price), items: parseItems(c.items) }));
}

async function validateCombo(tenantId: string, input: ComboInput) {
    const name = input.name.trim();
    if (!name) throw new Error("El combo necesita un nombre.");
    if (!Number.isFinite(input.price) || input.price < 0) throw new Error("Precio inválido.");
    if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("El combo necesita al menos un componente.");
    const rates = input.items.some((i) => i.minutes) ? await getPlayzoneRates(tenantId) : null;
    let regular = 0;
    for (const it of input.items) {
        if (!Number.isInteger(it.qty) || it.qty < 1) throw new Error("La cantidad de cada componente debe ser un entero mayor a 0.");
        if (!!it.productId === !!it.minutes) throw new Error("Cada componente es un producto o un tiempo de juego, no ambos.");
        if (it.productId) {
            const p = await prisma.product.findFirst({ where: { id: it.productId, tenantId, isActive: true }, select: { price: true } });
            if (!p) throw new Error("Hay un producto del combo que no existe o está inactivo.");
            regular += Number(p.price) * it.qty;
        } else {
            const d = rates!.durations.find((x) => x.minutes === it.minutes);
            if (!d) throw new Error(`No hay tarifa de ${it.minutes} min para usar en el combo.`);
            regular += d.price * it.qty;
        }
    }
    if (input.price >= round2(regular)) throw new Error(`El precio del combo (S/ ${input.price.toFixed(2)}) debe ser menor al precio normal (S/ ${round2(regular).toFixed(2)}).`);
    return { name, regular: round2(regular) };
}

export async function createCombo(tenantId: string, input: ComboInput) {
    const { name } = await validateCombo(tenantId, input);
    return prisma.combo.create({ data: { tenantId, name, price: input.price, isActive: input.isActive ?? true, items: input.items as object } });
}

export async function updateCombo(tenantId: string, id: string, input: ComboInput) {
    const { name } = await validateCombo(tenantId, input);
    const { count } = await prisma.combo.updateMany({ where: { id, tenantId }, data: { name, price: input.price, isActive: input.isActive ?? true, items: input.items as object } });
    if (count === 0) throw new Error("Combo no encontrado.");
    return prisma.combo.findUniqueOrThrow({ where: { id } });
}

export async function deleteCombo(tenantId: string, id: string) {
    const { count } = await prisma.combo.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new Error("Combo no encontrado.");
}
