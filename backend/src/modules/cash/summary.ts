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
  items: { productId: string | null; isVirtual: boolean; virtualSku: string | null; unitPrice: unknown; discount?: unknown; qty: number }[];
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
      const line = Number(i.unitPrice) * i.qty - Number(i.discount ?? 0);
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

function deriveCashStatus(hasOpening: boolean, closeStatus?: string): CashStatus {
  if (closeStatus) return closeStatus === "APPROVED" ? "CERRADA" : "PENDIENTE";
  return hasOpening ? "ABIERTA" : "NO_ABIERTA";
}

/**
 * Turnos: un día de Lima puede tener varios (apertura → cierre → nueva apertura tras aprobar el cierre).
 * El turno actual es el de la ÚLTIMA apertura del día; su cierre es el más reciente creado desde esa apertura.
 */
export async function currentShift(db: Pick<typeof prisma, "cashMovement" | "cashClose">, tenantId: string, date: string) {
  const { start, end } = limaDayBounds(date);
  const opening = await db.cashMovement.findFirst({
    where: { tenantId, type: "OPENING", createdAt: { gte: start, lt: end } },
    include: { worker: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const close = await db.cashClose.findFirst({
    where: { tenantId, closedDate: new Date(`${date}T00:00:00Z`), ...(opening ? { createdAt: { gte: opening.createdAt } } : {}) },
    include: { worker: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return { start, end, opening, close };
}

/** Lightweight today's status (same rule as getDaySummary) for guards such as the POS. */
export async function getTodayCashStatus(tenantId: string, db: Pick<typeof prisma, "cashMovement" | "cashClose"> = prisma): Promise<CashStatus> {
  const { opening, close } = await currentShift(db, tenantId, limaYmd());
  return deriveCashStatus(!!opening, close?.status);
}

export async function getDaySummary(tenantId: string, date: string = limaYmd()) {
  const { start, end } = limaDayBounds(date);
  const createdAt = { gte: start, lt: end };

  const [shift, openings, sales, movs, pendingVoids, pendingCloses, stock] = await Promise.all([
    currentShift(prisma, tenantId, date),
    prisma.cashMovement.count({ where: { tenantId, type: "OPENING", createdAt } }),
    prisma.sale.findMany({
      where: { tenantId, createdAt },
      select: {
        total: true, paymentMethod: true, status: true, createdAt: true,
        items: { select: { productId: true, isVirtual: true, virtualSku: true, unitPrice: true, discount: true, qty: true } },
      },
    }),
    prisma.cashMovement.findMany({
      where: { tenantId, type: { in: ["IN", "OUT"] }, createdAt },
      select: { type: true, amount: true, currency: true, createdAt: true },
    }),
    prisma.voidRequest.count({ where: { tenantId, status: "PENDING" } }),
    prisma.cashClose.count({ where: { tenantId, status: "PENDING_APPROVAL" } }),
    inventoryStats(tenantId),
  ]);
  const { opening, close } = shift;

  // Con una sola apertura (o ninguna) el turno es el día completo, igual que siempre; con varias, el turno actual
  // son las ventas y movimientos desde su apertura. `sales`/`voided` siguen siendo del DÍA (panel "ventas hoy").
  const since = openings > 1 && opening ? opening.createdAt : start;
  const shiftSales = sales.filter((x) => x.createdAt >= since);
  const shiftMovs = movs.filter((m) => m.createdAt >= since);

  const day = aggregateSales(sales);
  const agg = aggregateSales(shiftSales);
  const sumMovs = (list: typeof movs) => {
    const mv = { in: 0, out: 0, inUSD: 0, outUSD: 0, inCount: 0, outCount: 0 };
    for (const m of list) {
      const k = m.type === "IN" ? "in" : "out";
      mv[`${k}Count`]++;
      mv[m.currency === "USD" ? (`${k}USD` as "inUSD" | "outUSD") : k] += Number(m.amount);
    }
    return mv;
  };
  const dayMv = sumMovs(movs);
  const mv = sumMovs(shiftMovs);
  const openingAmount = opening ? Number(opening.amount) : 0;
  const expectedCash = round2(openingAmount + agg.sales.byMethod.efectivo + mv.in - mv.out);
  const cashStatus = deriveCashStatus(!!opening, close?.status);
  const fmtMv = (m: typeof mv, count: number) => ({
    in: round2(m.in), out: round2(m.out), inUSD: round2(m.inUSD), outUSD: round2(m.outUSD), inCount: m.inCount, outCount: m.outCount, count,
  });

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
    ...day,
    movements: fmtMv(dayMv, movs.length),
    /** Cifras del turno actual (= las del día cuando hay una sola apertura). Lo que se cuadra y cierra. */
    shift: { number: openings, sales: agg.sales, voided: agg.voided, movements: fmtMv(mv, shiftMovs.length) },
    expectedCash,
    cashInflow: round2(openingAmount + agg.sales.byMethod.efectivo + mv.in),
    expectedTotal: round2(expectedCash + agg.sales.byMethod.yape + agg.sales.byMethod.tarjeta + agg.sales.byMethod.other),
    pending: { voids: pendingVoids, closes: pendingCloses },
    stock: { lowStock: stock.lowStock, outOfStock: stock.outOfStock },
  };
}

export type DaySummary = Awaited<ReturnType<typeof getDaySummary>>;

/** Values frozen into CashClose when closing: derived only from a DaySummary, from the CURRENT SHIFT. */
export function closeFigures(s: DaySummary) {
  const { yape, tarjeta, other } = s.shift.sales.byMethod;
  return {
    openingBalance: s.opening?.amount ?? 0,
    totalSales: s.shift.sales.total,
    expectedEfectivo: s.expectedCash,
    expectedYape: yape,
    expectedTarjeta: tarjeta,
    expectedUnknown: other,
    totalExpected: round2(s.expectedCash + yape + tarjeta + other),
  };
}
