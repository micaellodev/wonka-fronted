import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { aggregateSales, closeFigures, currentShift, getDaySummary } from "./summary.ts";
import { verifyAdmin } from "../hr/hr.service.ts";

// ============================================================
//  Cash Management Service
//  A cash shift (turno) runs from an OPENING movement to the close that
//  follows it: its sales (CANCELLED excluded), manual IN/OUT movements and
//  one close. A Lima day can hold several shifts: a new one opens only after
//  the previous close is APPROVED. Every total is computed here from the DB —
//  the client only sends what it physically counted.
// ============================================================

export interface CashCloseInput {
  tenantId: string;
  workerId: string;
  countedEfectivo: number;
  countedYape: number;
  countedTarjeta: number;
}

export interface CashCloseRecord {
  id: string;
  openingBalance: number;
  totalSales: number;
  expectedEfectivo: number;
  expectedYape: number;
  expectedTarjeta: number;
  expectedUnknown: number;
  totalExpected: number;
  countedCash: number;
  difference: number;
  status: string;
  approvedByWorkerId: string | null;
  approvedAt: Date | null;
  closedDate: string;
  createdAt: Date;
  worker: {
    id: string;
    name: string;
  };
}

// Peru (Lima) has no DST and is always UTC-5, same offset used by
// apisperu.service.ts's formatSunatDate. Day-boundary math must use
// Lima-local days regardless of the server's system timezone.
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of `reference` in Lima. */
export function limaYmd(reference: Date = new Date()): string {
  return new Date(reference.getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** [start, end) instants of a Lima calendar day given as YYYY-MM-DD. */
export function limaDayBounds(ymd: string): { start: Date; end: Date } {
  const start = new Date(`${ymd}T00:00:00-05:00`);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid date.");
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Value for the @db.Date `closedDate` column of today's Lima day. */
function todayClosedDate(): Date {
  return new Date(`${limaYmd()}T00:00:00Z`);
}

/** Advisory-lock key of the current cash day: sales take it shared, the close takes it exclusive. */
export const cashDayLockKey = (tenantId: string) => `close:${tenantId}:${todayClosedDate().toISOString()}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

const closeInclude = { worker: { select: { id: true, name: true } } } as const;

type CloseRow = Prisma.CashCloseGetPayload<{ include: typeof closeInclude }>;

function toRecord(record: CloseRow): CashCloseRecord {
  return {
    ...record,
    openingBalance: Number(record.openingBalance),
    totalSales: Number(record.totalSales),
    expectedEfectivo: Number(record.expectedEfectivo),
    expectedYape: Number(record.expectedYape),
    expectedTarjeta: Number(record.expectedTarjeta),
    expectedUnknown: Number(record.expectedUnknown),
    totalExpected: Number(record.totalExpected),
    countedCash: Number(record.countedCash),
    difference: Number(record.difference),
    closedDate: record.closedDate.toISOString().slice(0, 10),
  };
}

// ── Opening ──────────────────────────────────────────────────

export async function openCashDrawer(tenantId: string, workerId: string, amount: number) {
  const worker = await prisma.worker.findFirst({
    where: { id: workerId, tenantId, isActive: true },
  });
  if (!worker) throw new Error("Worker not found or inactive.");

  // Same lock as recordCashClose (sales share it, close is exclusive): serializes check+create.
  const record = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cashDayLockKey(tenantId)}))`;
    const { opening, close } = await currentShift(tx, tenantId, limaYmd());
    // First shift of the day, or a new one once the previous shift's close is approved.
    if (opening && !close) throw new Error("Cash drawer already opened today.");
    if (opening && close && close.status !== "APPROVED") {
      throw new Error("Cash drawer already opened: the previous shift close is pending approval.");
    }
    return tx.cashMovement.create({
      data: { tenantId, workerId, type: "OPENING", amount, currency: "PEN", reason: "Apertura de caja" },
    });
  });
  return { openingBalance: Number(record.amount), openedAt: record.createdAt };
}

/** Opening of the current shift (the latest of the Lima day). */
export async function getTodayOpening(tenantId: string) {
  const { opening } = await currentShift(prisma, tenantId, limaYmd());
  return opening ? { amount: Number(opening.amount), openedAt: opening.createdAt } : null;
}

// ── Close ────────────────────────────────────────────────────

/**
 * Record the cash close of the current shift. Expected amounts come from the DB;
 * a second close of the same shift is rejected (409).
 */
export async function recordCashClose(input: CashCloseInput): Promise<CashCloseRecord> {
  const worker = await prisma.worker.findFirst({
    where: { id: input.workerId, tenantId: input.tenantId, isActive: true },
  });
  if (!worker) throw new Error("Worker not found or inactive.");

  const closedDate = todayClosedDate();
  // One close per shift: the exclusive advisory lock serializes concurrent closes and
  // waits for in-flight sales (shared lock). Figures are computed AFTER taking it, so every sale
  // committed before the close is counted and later ones are rejected (CASH_NOT_OPEN).
  const record = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cashDayLockKey(input.tenantId)}))`;
    const summary = await getDaySummary(input.tenantId);
    if (summary.opening && summary.close) throw new Error("Cash close already recorded today.");
    if (!summary.opening) throw new Error("Cash drawer not opened today.");
    const figures = closeFigures(summary);
    const countedCash = round2(input.countedEfectivo + input.countedYape + input.countedTarjeta);
    const data = {
      ...figures,
      countedCash,
      difference: round2(countedCash - figures.totalExpected),
      status: "PENDING_APPROVAL",
      approvedByWorkerId: null,
      approvedAt: null,
    };
    return tx.cashClose.create({
      data: { ...data, tenantId: input.tenantId, workerId: input.workerId, closedDate },
      include: closeInclude,
    });
  });
  return toRecord(record);
}

/** The approver is an admin of the tenant identified by their login PIN (tenant-scoped, rate-limited in hr.service). */
async function resolveApprover(tenantId: string, code: string) {
  return (await verifyAdmin(tenantId, code)).worker;
}

export async function approveCashClose(
  cashCloseId: string,
  tenantId: string,
  approverCode: string
): Promise<CashCloseRecord> {
  const cashClose = await prisma.cashClose.findFirst({
    where: { id: cashCloseId, tenantId },
    select: { status: true },
  });
  if (!cashClose) throw new Error("Cash close not found.");
  if (cashClose.status !== "PENDING_APPROVAL") {
    throw new Error(`Cash close is already ${cashClose.status}.`);
  }

  const approver = await resolveApprover(tenantId, approverCode);

  // Conditional update: of N concurrent approvals exactly one flips the status.
  const { count } = await prisma.cashClose.updateMany({
    where: { id: cashCloseId, tenantId, status: "PENDING_APPROVAL" },
    data: { status: "APPROVED", approvedByWorkerId: approver.id, approvedAt: new Date() },
  });
  if (count !== 1) throw new Error("Cash close is already APPROVED.");
  const record = await prisma.cashClose.findFirstOrThrow({ where: { id: cashCloseId, tenantId }, include: closeInclude });
  return toRecord(record);
}

/** Today's (Lima) cash close, most recently updated first. */
export async function getTodayCashClose(tenantId: string): Promise<CashCloseRecord | null> {
  const record = await prisma.cashClose.findFirst({
    where: { tenantId, closedDate: todayClosedDate() },
    include: closeInclude,
    orderBy: { updatedAt: "desc" },
  });
  return record ? toRecord(record) : null;
}

type HistoryDay = {
  cashStatus: string;
  sales: ReturnType<typeof aggregateSales>["sales"];
  voided: ReturnType<typeof aggregateSales>["voided"];
  movements: { in: number; out: number; inUSD: number; outUSD: number; inCount: number; outCount: number; count: number };
  expectedCash: number;
};

/** Per-date day figures for a set of closes using 3 range queries (same rules as getDaySummary), not 7 per date. */
async function historyDaySummaries(tenantId: string, records: { closedDate: string; status: string; createdAt: Date }[]) {
  const dates = [...new Set(records.map((r) => r.closedDate))].sort();
  const out = new Map<string, HistoryDay>();
  if (!dates.length) return out;
  const createdAt = { gte: limaDayBounds(dates[0]!).start, lt: limaDayBounds(dates[dates.length - 1]!).end };
  const [openings, sales, movs] = await Promise.all([
    prisma.cashMovement.findMany({ where: { tenantId, type: "OPENING", createdAt }, select: { amount: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.sale.findMany({
      where: { tenantId, createdAt },
      select: { total: true, paymentMethod: true, status: true, createdAt: true, items: { select: { productId: true, isVirtual: true, virtualSku: true, unitPrice: true, discount: true, qty: true } } },
    }),
    prisma.cashMovement.findMany({ where: { tenantId, type: { in: ["IN", "OUT"] }, createdAt }, select: { type: true, amount: true, currency: true, createdAt: true } }),
  ]);
  const group = <T extends { createdAt: Date }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const d = limaYmd(r.createdAt); m.set(d, [...(m.get(d) ?? []), r]); }
    return m;
  };
  const opByDay = group(openings), saleByDay = group(sales), movByDay = group(movs);
  for (const d of dates) {
    const agg = aggregateSales(saleByDay.get(d) ?? []);
    const mv = { in: 0, out: 0, inUSD: 0, outUSD: 0, inCount: 0, outCount: 0 };
    const ms = movByDay.get(d) ?? [];
    for (const m of ms) {
      const k = m.type === "IN" ? "in" : "out";
      mv[`${k}Count`]++;
      mv[m.currency === "USD" ? (`${k}USD` as "inUSD" | "outUSD") : k] += Number(m.amount);
    }
    const dayOpenings = opByDay.get(d) ?? [];
    const lastOpening = dayOpenings[dayOpenings.length - 1];
    const latest = records.find((r) => r.closedDate === d); // records come newest first
    // Status of the day's LAST shift: its close if it has one, otherwise open.
    const lastClosed = latest && (!lastOpening || latest.createdAt >= lastOpening.createdAt);
    out.set(d, {
      cashStatus: lastClosed ? (latest.status === "APPROVED" ? "CERRADA" : "PENDIENTE") : lastOpening ? "ABIERTA" : "NO_ABIERTA",
      sales: agg.sales,
      voided: agg.voided,
      movements: { in: round2(mv.in), out: round2(mv.out), inUSD: round2(mv.inUSD), outUSD: round2(mv.outUSD), inCount: mv.inCount, outCount: mv.outCount, count: ms.length },
      expectedCash: round2(dayOpenings.reduce((a, o) => a + Number(o.amount), 0) + agg.sales.byMethod.efectivo + mv.in - mv.out),
    });
  }
  return out;
}

/** Cash close history (last N Lima days). Each record carries `day`: the live DaySummary figures of its date. */
export async function getCashCloseHistory(tenantId: string, days: number = 30, from?: string, to?: string) {
  const startDate = new Date(todayClosedDate().getTime() - days * DAY_MS);
  const records = (await prisma.cashClose.findMany({
    where: { tenantId, closedDate: from && to ? { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } : { gte: startDate } },
    include: closeInclude,
    orderBy: [{ closedDate: "desc" }, { createdAt: "desc" }],
  })).map(toRecord);
  const summaries = await historyDaySummaries(tenantId, records);
  const sum = (k: "totalSales" | "totalExpected" | "countedCash" | "difference") => round2(records.reduce((a, r) => a + r[k], 0));
  const usdOf = (r: (typeof records)[number]) => { const m = summaries.get(r.closedDate)!.movements; return round2(m.inUSD - m.outUSD); };
  const usdDays = [...new Set(records.map((r) => r.closedDate))].reduce((a, d) => { const m = summaries.get(d)!.movements; return a + m.inUSD - m.outUSD; }, 0);
  const totals = { totalSales: sum("totalSales"), totalExpected: sum("totalExpected"), countedCash: sum("countedCash"), difference: sum("difference"), usd: round2(usdDays) };
  return {
    totals,
    records: records.map((r) => {
      const s = summaries.get(r.closedDate)!;
      return { ...r, usd: usdOf(r), day: { cashStatus: s.cashStatus, sales: s.sales, voided: s.voided, movements: s.movements, expectedCash: s.expectedCash } };
    }),
  };
}

// ============================================================
//  Cash Movements — CRUD
// ============================================================

export interface CashMovementRecord {
  id: string;
  tenantId: string;
  workerId: string;
  type: string;
  amount: number;
  currency: string;
  reason: string;
  createdAt: Date;
  worker: { id: string; name: string };
}

export interface CreateCashMovementInput {
  tenantId: string;
  workerId: string;
  type: "IN" | "OUT";
  amount: number;
  currency: "PEN" | "USD";
  reason: string;
}

export async function createCashMovement(
  input: CreateCashMovementInput
): Promise<CashMovementRecord> {
  const worker = await prisma.worker.findFirst({
    where: { id: input.workerId, tenantId: input.tenantId, isActive: true },
  });
  if (!worker) throw new Error("Worker not found or inactive.");

  const record = await prisma.cashMovement.create({
    data: {
      tenantId: input.tenantId,
      workerId: input.workerId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      reason: input.reason,
    },
    include: {
      worker: { select: { id: true, name: true } },
    },
  });

  return {
    ...record,
    amount: Number(record.amount),
  };
}

const MAX_MOVEMENTS_NO_DATE = 500;

/** Movements of a Lima day (YYYY-MM-DD); with no date, the latest MAX_MOVEMENTS_NO_DATE. */
export async function listCashMovements(
  tenantId: string,
  date?: string
): Promise<CashMovementRecord[]> {
  const range = date ? limaDayBounds(date) : null;
  const records = await prisma.cashMovement.findMany({
    where: {
      tenantId,
      ...(range && { createdAt: { gte: range.start, lt: range.end } }),
    },
    include: {
      worker: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(!range && { take: MAX_MOVEMENTS_NO_DATE }),
  });

  return records.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}

export async function deleteCashMovement(
  movementId: string,
  tenantId: string
): Promise<void> {
  const record = await prisma.cashMovement.findFirst({ where: { id: movementId, tenantId }, select: { type: true } });
  if (!record) throw new Error("Movement not found.");
  // The opening amount is the base of the day's expected cash; never delete it.
  if (record.type === "OPENING") throw new Error("Opening movement cannot be deleted.");
  const { count } = await prisma.cashMovement.deleteMany({ where: { id: movementId, tenantId, type: { not: "OPENING" } } });
  if (count !== 1) throw new Error("Movement not found.");
}
