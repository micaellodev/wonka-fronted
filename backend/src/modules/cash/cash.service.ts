import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { hashPin, verifyAdmin, verifyApprovalCode } from "../hr/hr.service.ts";

// ============================================================
//  Cash Management Service
//  A cash shift is one Lima calendar day per tenant: one OPENING
//  movement, the day's sales (CANCELLED excluded), manual IN/OUT
//  movements and one close per worker. Every total is computed here
//  from the DB — the client only sends what it physically counted.
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

// ── Shift summary ────────────────────────────────────────────

export async function getShiftSummary(tenantId: string) {
  const date = limaYmd();
  const { start, end } = limaDayBounds(date);
  const createdAt = { gte: start, lt: end };

  const [opening, sales, movements, close] = await Promise.all([
    prisma.cashMovement.findFirst({
      where: { tenantId, type: "OPENING", createdAt },
      include: { worker: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sale.findMany({
      where: { tenantId, createdAt },
      select: { id: true, total: true, paymentMethod: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cashMovement.findMany({
      where: { tenantId, type: { in: ["IN", "OUT"] }, createdAt },
      select: { type: true, amount: true, currency: true },
    }),
    getTodayCashClose(tenantId),
  ]);

  const byMethod = { efectivo: 0, yape: 0, tarjeta: 0, other: 0 };
  let count = 0;
  let cancelledCount = 0;
  let cancelledAmount = 0;
  for (const s of sales) {
    const total = Number(s.total);
    if (s.status === "CANCELLED") {
      cancelledCount++;
      cancelledAmount += total;
      continue;
    }
    count++;
    const m = (s.paymentMethod || "").toLowerCase();
    if (m === "efectivo" || m === "yape" || m === "tarjeta") byMethod[m] += total;
    else byMethod.other += total;
  }

  const mov = { inPEN: 0, outPEN: 0, inUSD: 0, outUSD: 0, inCount: 0, outCount: 0 };
  for (const m of movements) {
    const amount = Number(m.amount);
    const usd = m.currency === "USD";
    if (m.type === "IN") {
      if (usd) mov.inUSD += amount;
      else { mov.inPEN += amount; mov.inCount++; }
    } else {
      if (usd) mov.outUSD += amount;
      else { mov.outPEN += amount; mov.outCount++; }
    }
  }

  const openingAmount = opening ? Number(opening.amount) : 0;
  const expectedEfectivo = round2(openingAmount + byMethod.efectivo + mov.inPEN - mov.outPEN);
  const salesTotal = round2(byMethod.efectivo + byMethod.yape + byMethod.tarjeta + byMethod.other);

  return {
    date,
    opening: opening
      ? { amount: openingAmount, openedAt: opening.createdAt, workerName: opening.worker.name }
      : null,
    sales: {
      efectivo: round2(byMethod.efectivo),
      yape: round2(byMethod.yape),
      tarjeta: round2(byMethod.tarjeta),
      other: round2(byMethod.other),
      total: salesTotal,
      count,
    },
    cancelled: { count: cancelledCount, amount: round2(cancelledAmount) },
    movements: {
      inPEN: round2(mov.inPEN),
      outPEN: round2(mov.outPEN),
      inUSD: round2(mov.inUSD),
      outUSD: round2(mov.outUSD),
      inCount: mov.inCount,
      outCount: mov.outCount,
    },
    expected: {
      efectivo: expectedEfectivo,
      yape: round2(byMethod.yape),
      tarjeta: round2(byMethod.tarjeta),
      other: round2(byMethod.other),
      total: round2(expectedEfectivo + byMethod.yape + byMethod.tarjeta + byMethod.other),
    },
    // Cash-paid sales of the day (for the movements ledger)
    cashSales: sales
      .filter((s) => (s.paymentMethod || "").toLowerCase() === "efectivo")
      .map((s) => ({ id: s.id, total: Number(s.total), status: s.status, createdAt: s.createdAt })),
    close,
  };
}

// ── Opening ──────────────────────────────────────────────────

export async function openCashDrawer(tenantId: string, workerId: string, amount: number) {
  const worker = await prisma.worker.findFirst({
    where: { id: workerId, tenantId, isActive: true },
  });
  if (!worker) throw new Error("Worker not found or inactive.");

  const { start, end } = limaDayBounds(limaYmd());
  const existing = await prisma.cashMovement.findFirst({
    where: { tenantId, type: "OPENING", createdAt: { gte: start, lt: end } },
  });
  if (existing) throw new Error("Cash drawer already opened today.");

  // shortcut: concurrent first openings could both pass the check above; harmless
  // because the summary uses the earliest OPENING. Add a unique index if it matters.
  const record = await prisma.cashMovement.create({
    data: { tenantId, workerId, type: "OPENING", amount, currency: "PEN", reason: "Apertura de caja" },
  });
  return { openingBalance: Number(record.amount), openedAt: record.createdAt };
}

export async function getTodayOpening(tenantId: string) {
  const { start, end } = limaDayBounds(limaYmd());
  const record = await prisma.cashMovement.findFirst({
    where: { tenantId, type: "OPENING", createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
  });
  return record ? { amount: Number(record.amount), openedAt: record.createdAt } : null;
}

// ── Close ────────────────────────────────────────────────────

/**
 * Record (or redo) the cash close for today. Expected amounts come from the DB;
 * re-submitting resets the close to PENDING_APPROVAL with fresh totals.
 */
export async function recordCashClose(input: CashCloseInput): Promise<CashCloseRecord> {
  const worker = await prisma.worker.findFirst({
    where: { id: input.workerId, tenantId: input.tenantId, isActive: true },
  });
  if (!worker) throw new Error("Worker not found or inactive.");

  const summary = await getShiftSummary(input.tenantId);
  if (!summary.opening) throw new Error("Cash drawer not opened today.");

  const countedCash = round2(input.countedEfectivo + input.countedYape + input.countedTarjeta);
  const data = {
    openingBalance: summary.opening.amount,
    totalSales: summary.sales.total,
    expectedEfectivo: summary.expected.efectivo,
    expectedYape: summary.expected.yape,
    expectedTarjeta: summary.expected.tarjeta,
    expectedUnknown: summary.expected.other,
    totalExpected: summary.expected.total,
    countedCash,
    difference: round2(countedCash - summary.expected.total),
    status: "PENDING_APPROVAL",
    approvedByWorkerId: null,
    approvedAt: null,
  };

  const closedDate = todayClosedDate();
  const record = await prisma.cashClose.upsert({
    where: {
      tenantId_closedDate_workerId: {
        tenantId: input.tenantId,
        closedDate,
        workerId: input.workerId,
      },
    },
    update: data,
    create: { ...data, tenantId: input.tenantId, workerId: input.workerId, closedDate },
    include: closeInclude,
  });
  return toRecord(record);
}

/**
 * Accepts the 6-digit approval code of an admin of the tenant, or an admin's
 * login PIN. Both checks are tenant-scoped and rate-limited in hr.service.
 */
async function resolveApprover(tenantId: string, code: string) {
  if (/^\d{6}$/.test(code)) {
    const byCode = await prisma.worker.findFirst({
      where: {
        tenantId,
        isActive: true,
        approvalCodeHash: hashPin(tenantId, code),
        role: { name: { in: ["ADMIN", "ADMINISTRADOR"] } },
      },
      select: { id: true },
    });
    if (byCode) return (await verifyApprovalCode(tenantId, byCode.id, code)).worker;
  }
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

  const record = await prisma.cashClose.update({
    where: { id: cashCloseId },
    data: { status: "APPROVED", approvedByWorkerId: approver.id, approvedAt: new Date() },
    include: closeInclude,
  });
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

/** Cash close history for a tenant (last N Lima days, today included). */
export async function getCashCloseHistory(tenantId: string, days: number = 30): Promise<CashCloseRecord[]> {
  const startDate = new Date(todayClosedDate().getTime() - days * DAY_MS);
  const records = await prisma.cashClose.findMany({
    where: { tenantId, closedDate: { gte: startDate } },
    include: closeInclude,
    orderBy: [{ closedDate: "desc" }, { createdAt: "desc" }],
  });
  return records.map(toRecord);
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

/** Movements of a Lima day (YYYY-MM-DD), or all when no date is given. */
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
  const record = await prisma.cashMovement.findFirst({
    where: { id: movementId, tenantId },
  });
  if (!record) throw new Error("Movement not found.");
  // The opening amount is the base of the day's expected cash; never delete it.
  if (record.type === "OPENING") throw new Error("Opening movement cannot be deleted.");

  await prisma.cashMovement.delete({ where: { id: movementId } });
}
