import Elysia, { t } from "elysia";
import { RateLimitError } from "../../lib/rateLimiter.ts";
import { getAuth } from "../../lib/auth.ts";
import {
  recordCashClose,
  getTodayCashClose,
  getCashCloseHistory,
  getTodayOpening,
  openCashDrawer,
  approveCashClose,
  createCashMovement,
  listCashMovements,
  deleteCashMovement,
} from "./cash.service.ts";
import { getDaySummary, getTodayCashStatus } from "./summary.ts";

// ============================================================
//  Cash Management Controller — Prefix: /cash
// ============================================================

export const cashController = new Elysia({ prefix: "/cash", tags: ["Cash Management"] })

  // ── POST /cash/close ────────────────────────────────────────
  /**
   * Record the end-of-day cash close
   */
  .post(
    "/close",
    async ({ body, set, request }) => {
      try {
        const result = await recordCashClose({
          tenantId: body.tenantId,
          workerId: getAuth(request)!.workerId,
          countedEfectivo: body.countedEfectivo,
          countedYape: body.countedYape,
          countedTarjeta: body.countedTarjeta,
        });

        set.status = 201;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        const message = (error as Error).message;
        if (message.toLowerCase().includes("not opened") || message.includes("already recorded")) {
          set.status = 409;
        } else if (message.toLowerCase().includes("worker not found")) {
          set.status = 404;
        } else {
          set.status = 500;
        }
        return {
          success: false,
          error: message,
        };
      }
    },
    {
      body: t.Object({
        tenantId: t.String({ minLength: 1 }),
        workerId: t.Optional(t.String()),
        countedEfectivo: t.Number({ minimum: 0 }),
        countedYape: t.Number({ minimum: 0 }),
        countedTarjeta: t.Number({ minimum: 0 }),
      }),
      detail: { summary: "Record end-of-day cash close (expected totals computed server-side)" },
    }
  )

  // ── GET /cash/today ────────────────────────────────────────
  /**
   * Get today's cash close if it exists
   */
  .get(
    "/today",
    async ({ query }) => {
      const result = await getTodayCashClose(query.tenantId);
      return {
        success: true,
        data: result,
      };
    },
    {
      query: t.Object({
        tenantId: t.String({ minLength: 1 }),
      }),
      detail: { summary: "Get today's cash close" },
    }
  )

  // ── GET /cash/history ──────────────────────────────────────
  /**
   * Get cash close history for a tenant (last N days)
   */
  .get(
    "/history",
    async ({ query, set }) => {
      if (query.from && query.to) {
        const span = (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000;
        if (!(span >= 0 && span <= 365)) {
          set.status = 422;
          return { success: false, error: "Range must be 0-366 days." };
        }
      }
      const { records: results, totals } = await getCashCloseHistory(query.tenantId, query.days ?? 30, query.from, query.to);
      return {
        success: true,
        data: results,
        total: results.length,
        totals,
      };
    },
    {
      query: t.Object({
        tenantId: t.String({ minLength: 1 }),
        days: t.Optional(t.Numeric({ minimum: 1, maximum: 365, default: 30 })),
        from: t.Optional(t.String({ format: "date" })),
        to: t.Optional(t.String({ format: "date" })),
      }),
      detail: { summary: "Get cash close history" },
    }
  )

  // ── GET /cash/opening-today ────────────────────────────────
  .get(
    "/opening-today",
    async ({ query }) => {
      const [opening, cashStatus] = await Promise.all([getTodayOpening(query.tenantId), getTodayCashStatus(query.tenantId)]);
      return {
        success: true,
        data: {
          // Same rule as /cash/summary: after a close the drawer is no longer "opened".
          isOpened: cashStatus === "ABIERTA",
          cashStatus,
          openingBalance: opening?.amount ?? null,
          openedAt: opening?.openedAt ?? null,
        },
      };
    },
    {
      query: t.Object({
        tenantId: t.String({ minLength: 1 }),
      }),
      detail: { summary: "Check if cash drawer is opened today (Lima)" },
    }
  )

  // ── POST /cash/opening ─────────────────────────────────────
  .post(
    "/opening",
    async ({ body, set, request }) => {
      try {
        const data = await openCashDrawer(body.tenantId, getAuth(request)!.workerId, body.amount);
        set.status = 201;
        return { success: true, data };
      } catch (error) {
        const message = (error as Error).message;
        set.status = message.includes("already opened") ? 409 : message.includes("not found") ? 404 : 422;
        return { success: false, error: message };
      }
    },
    {
      body: t.Object({
        tenantId: t.String({ minLength: 1 }),
        workerId: t.Optional(t.String()),
        amount: t.Number({ minimum: 0, maximum: 1_000_000 }),
      }),
      detail: { summary: "Open today's cash drawer with the initial cash amount" },
    }
  )

  // ── GET /cash/summary ──────────────────────────────────────
  .get(
    "/summary",
    async ({ query }) => ({ success: true, data: await getDaySummary(query.tenantId, query.date) }),
    {
      query: t.Object({
        tenantId: t.String({ minLength: 1 }),
        date: t.Optional(t.String({ format: "date" })),
      }),
      detail: { summary: "Today's shift totals (opening, sales by method, movements, expected)" },
    }
  )

  // ── POST /cash/close/:id/approve ───────────────────────────
  /**
   * Approve a pending cash close with owner/admin approval code
   */
  .post(
    "/close/:id/approve",
    async ({ params, body, set, request }) => {
      try {
        if (getAuth(request)!.tenantId !== body.tenantId) throw new Error("Cash close not found.");
        const result = await approveCashClose(params.id, body.tenantId, body.approverCode);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        const message = (error as Error).message;
        const lower = message.toLowerCase();
        if (error instanceof RateLimitError) {
          set.status = 429;
        } else if (
          lower.includes("pin") ||
          lower.includes("approval code") ||
          lower.includes("admin")
        ) {
          set.status = 403;
        } else if (lower.includes("not found")) {
          set.status = 404;
        } else if (lower.includes("already")) {
          set.status = 409;
        } else {
          set.status = 422;
        }
        return {
          success: false,
          error: message,
        };
      }
    },
    {
      params: t.Object({
        id: t.String({ minLength: 1 }),
      }),
      body: t.Object({
        tenantId: t.String({ minLength: 1 }),
        /** 6-digit approval code of an admin, or an admin's login PIN */
        approverCode: t.String({ pattern: "^[0-9]{5,6}$" }),
        /** Ignored (kept for older clients); the approver is resolved from the code */
        approverWorkerId: t.Optional(t.String()),
      }),
      detail: { summary: "Approve cash close with admin approval code or admin PIN" },
    }
  )

  // ── POST /cash/movements ─────────────────────────────────
  .post(
    "/movements",
    async ({ body, set, request }) => {
      try {
        const result = await createCashMovement({
          tenantId: body.tenantId,
          workerId: getAuth(request)!.workerId,
          type: body.type,
          amount: body.amount,
          currency: body.currency,
          reason: body.reason,
        });
        set.status = 201;
        return { success: true, data: result };
      } catch (error) {
        set.status = 422;
        return { success: false, error: (error as Error).message };
      }
    },
    {
      body: t.Object({
        tenantId: t.String({ minLength: 1 }),
        workerId: t.Optional(t.String()),
        type: t.Union([t.Literal("IN"), t.Literal("OUT")]),
        amount: t.Number({ minimum: 0.01, maximum: 1_000_000 }),
        currency: t.Union([t.Literal("PEN"), t.Literal("USD")]),
        reason: t.String({ minLength: 1, maxLength: 200 }),
      }),
      detail: { summary: "Create a manual cash movement (IN/OUT); openings use POST /cash/opening" },
    }
  )

  // ── GET /cash/movements ──────────────────────────────────
  .get(
    "/movements",
    async ({ query }) => {
      const results = await listCashMovements(query.tenantId, query.date);
      return { success: true, data: results, total: results.length };
    },
    {
      query: t.Object({
        tenantId: t.String({ minLength: 1 }),
        date: t.Optional(t.String({ format: "date" })),
      }),
      detail: { summary: "List cash movements for a tenant" },
    }
  )

  // ── DELETE /cash/movements/:id ────────────────────────────
  .delete(
    "/movements/:id",
    async ({ params, query, set }) => {
      try {
        await deleteCashMovement(params.id, query.tenantId);
        return { success: true };
      } catch (error) {
        const message = (error as Error).message;
        set.status = message.includes("not found") ? 404 : 422;
        return { success: false, error: message };
      }
    },
    {
      params: t.Object({
        id: t.String({ minLength: 1 }),
      }),
      query: t.Object({
        tenantId: t.String({ minLength: 1 }),
      }),
      detail: { summary: "Delete a cash movement" },
    }
  );
