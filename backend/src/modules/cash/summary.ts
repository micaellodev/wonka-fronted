import { prisma } from "../../lib/prisma.ts";
import { limaDayBounds, limaYmd } from "./cash.service.ts";
import { inventoryStats } from "../inventory/inventory.service.ts";

// ============================================================
//  Single source of truth for every cash / sales figure.
//  Used by /cash/*, /dashboard/* and the shift report (see
//  docs/equipo/integracion-contrato.md). Do not recompute elsewhere.
// ============================================================

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type CashStatus = "NO_ABIERTA" | "ABIERTA" | "PENDIENTE" | "CERRADA";

interface SaleLike {
  total: unknown;
  paymentMethod: string | null;
  status: string;
  items: { productId: string | null; isVirtual: boolean; virtualSku: string | null; unitPrice: unknown; qty: number }[];
}

/** Aggregates any set of sales (a day or a range). The only place that adds up sales. */
export function aggregateSales(sales: SaleLike[]) {
  const by = { efectivo: 0, yape: 0, tarjeta: 0, other: 0 };
  const kind = { productos: 0, zonaJuegos: 0, ventaLibre: 0 };
  let count = 0, total = 0, voidedCount = 0, voidedTotal = 0;
  for (const s of sales) {
    const t = Number(s.total);
    if (s.status === "CANCELLED") { voidedCount++; voidedTotal += t; continue; }
    count++;
    total += t;
    const m = (s.paymentMethod || "").toLowerCase();
    if (m === "efectivo" || m === "yape" || m === "tarjeta") by[m] += t; else by.other += t;
    for (const i of s.items) {
      const line = Number(i.unitPrice) * i.qty;
      if (i.virtualSku?.startsWith("pz-")) kind.zonaJuegos += line;
      else if (i.virtualSku?.startsWith("free-sale-")) kind.ventaLibre += line;
      else kind.productos += line;
    }
  }
  return {
    sales: {
      count,
      total: round2(total),
      byMethod: { efectivo: round2(by.efectivo), yape: round2(by.yape), tarjeta: round2(by.tarjeta), other: round2(by.other) },
      byKind: { productos: round2(kind.productos), zonaJuegos: round2(kind.zonaJuegos), ventaLibre: round2(kind.ventaLibre) },
    },
    voided: { count: voidedCount, total: round2(voidedTotal) },
  };
}

export async function getDaySummary(tenantId: string, date: string = limaYmd()) {
  const { start, end } = limaDayBounds(date);
  const createdAt = { gte: start, lt: end };

  const [opening, sales, movs, close, pendingVoids, pendingCloses, stock] = await Promise.all([
    prisma.cashMovement.findFirst({
      where: { tenantId, type: "OPENING", createdAt },
      include: { worker: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sale.findMany({
      where: { tenantId, createdAt },
      select: {
        total: true, paymentMethod: true, status: true,
        items: { select: { productId: true, isVirtual: true, virtualSku: true, unitPrice: true, qty: true } },
      },
    }),
    prisma.cashMovement.findMany({
      where: { tenantId, type: { in: ["IN", "OUT"] }, createdAt },
      select: { type: true, amount: true, currency: true },
    }),
    prisma.cashClose.findFirst({
      where: { tenantId, closedDate: new Date(`${date}T00:00:00Z`) },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.voidRequest.count({ where: { tenantId, status: "PENDING" } }),
    prisma.cashClose.count({ where: { tenantId, status: "PENDING_APPROVAL" } }),
    inventoryStats(tenantId),
  ]);

  const agg = aggregateSales(sales);
  const mv = { in: 0, out: 0, inUSD: 0, outUSD: 0, inCount: 0, outCount: 0 };
  for (const m of movs) {
    const k = m.type === "IN" ? "in" : "out";
    mv[`${k}Count`]++;
    mv[m.currency === "USD" ? (`${k}USD` as "inUSD" | "outUSD") : k] += Number(m.amount);
  }
  const openingAmount = opening ? Number(opening.amount) : 0;
  const expectedCash = round2(openingAmount + agg.sales.byMethod.efectivo + mv.in - mv.out);
  const cashStatus: CashStatus = close
    ? close.status === "APPROVED" ? "CERRADA" : "PENDIENTE"
    : opening ? "ABIERTA" : "NO_ABIERTA";

  return {
    date,
    cashStatus,
    opening: opening ? { amount: openingAmount, at: opening.createdAt, workerName: opening.worker.name } : null,
    close: close
      ? {
          id: close.id,
          status: close.status,
          countedCash: Number(close.countedCash),
          difference: Number(close.difference),
          at: close.updatedAt,
          workerName: close.worker.name,
          totalExpected: Number(close.totalExpected),
        }
      : null,
    ...agg,
    movements: {
      in: round2(mv.in), out: round2(mv.out), inUSD: round2(mv.inUSD), outUSD: round2(mv.outUSD), inCount: mv.inCount, outCount: mv.outCount, count: movs.length,
    },
    expectedCash,
    cashInflow: round2(openingAmount + agg.sales.byMethod.efectivo + mv.in),
    expectedTotal: round2(expectedCash + agg.sales.byMethod.yape + agg.sales.byMethod.tarjeta + agg.sales.byMethod.other),
    pending: { voids: pendingVoids, closes: pendingCloses },
    stock: { lowStock: stock.lowStock, outOfStock: stock.outOfStock },
  };
}

export type DaySummary = Awaited<ReturnType<typeof getDaySummary>>;

/** Values frozen into CashClose when closing: derived only from a DaySummary. */
export function closeFigures(s: DaySummary) {
  const { yape, tarjeta, other } = s.sales.byMethod;
  return {
    openingBalance: s.opening?.amount ?? 0,
    totalSales: s.sales.total,
    expectedEfectivo: s.expectedCash,
    expectedYape: yape,
    expectedTarjeta: tarjeta,
    expectedUnknown: other,
    totalExpected: round2(s.expectedCash + yape + tarjeta + other),
  };
}
