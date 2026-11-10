import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { verifyApprovalCode } from "../hr/hr.service.ts";
import {
    buildCreditNotePayload,
    buildManualNotePayload,
    emitInvoice,
    emitNote,
    formatCorrelative,
    formatSunatDate,
    type EmissionResult,
} from "../apisperu/apisperu.service.ts";

// ============================================================
//  Billing — SUNAT emission state machine for sales and notes.
//  sunatStatus: PENDING_SUNAT → ENVIANDO → ACEPTADA | RECHAZADA
//  (back to PENDING_SUNAT on transport/service errors, retried later).
//  HTTP calls never run inside a DB transaction: a slow/failed SUNAT call
//  can't roll back a sale or hold the tenant row lock.
// ============================================================

/** Credit-note reasons (SUNAT catálogo 09) and debit-note reasons (catálogo 10). */
const CREDIT_REASONS = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"]);
const DEBIT_REASONS = new Set(["01", "02", "03", "10", "11"]);

/** An ENVIANDO claim older than this is considered abandoned (process died mid-send). */
const STALE_CLAIM_MS = 2 * Number(process.env["APISPERU_TIMEOUT_MS"] ?? 15000) + 5000;
const staleClaim = () => ({ sunatStatus: "ENVIANDO", updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } });

type Tx = Prisma.TransactionClient;
type NoteType = "CREDIT_NOTE" | "DEBIT_NOTE";

function errorResponse(error: unknown): Prisma.InputJsonValue {
    return { error: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
}

function emissionData(r: EmissionResult) {
    return {
        sunatStatus: r.sunatStatus,
        sunatXmlUrl: r.xml, // stores the signed XML content returned by APISPeru
        sunatCdrUrl: r.cdr, // stores the CDR zip (base64)
        sunatResponse: r.raw as Prisma.InputJsonValue,
    };
}

// ── Sales ───────────────────────────────────────────────────

/**
 * Sends a BOLETA/FACTURA sale to SUNAT. Never throws: on failure the sale stays
 * PENDING_SUNAT (the sale itself is already committed) and the error is stored
 * in sunatResponse. The ENVIANDO claim makes concurrent calls (POS + retry
 * button) send the document only once.
 */
export async function emitSale(saleId: string): Promise<string | null> {
    const claimed = await prisma.sale.updateMany({
        where: {
            id: saleId,
            status: "PENDING_SUNAT",
            tipoComprobante: { in: ["BOLETA", "FACTURA"] },
            OR: [{ sunatStatus: null }, { sunatStatus: "PENDING_SUNAT" }, staleClaim()],
        },
        data: { sunatStatus: "ENVIANDO" },
    });
    if (claimed.count === 0) {
        const current = await prisma.sale.findUnique({ where: { id: saleId }, select: { sunatStatus: true } });
        return current?.sunatStatus ?? null;
    }

    const { tenant, ...sale } = await prisma.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: { items: { include: { product: true } }, tenant: true },
    });
    try {
        if (!tenant.electronicInvoicingEnabled) {
            throw new Error("Facturación electrónica desactivada.");
        }
        const r = await emitInvoice({ tenant, sale });
        await prisma.$transaction([
            prisma.sale.update({ where: { id: saleId }, data: emissionData(r) }),
            // Conditional so a void approved meanwhile is never resurrected.
            prisma.sale.updateMany({ where: { id: saleId, status: "PENDING_SUNAT" }, data: { status: "ACTIVE" } }),
        ]);
        return r.sunatStatus;
    } catch (error) {
        console.error(`[SUNAT] venta ${sale.serie}-${sale.correlativo} queda pendiente:`, error instanceof Error ? error.message : error);
        await prisma.sale.update({
            where: { id: saleId },
            data: { sunatStatus: "PENDING_SUNAT", sunatResponse: errorResponse(error) },
        });
        return "PENDING_SUNAT";
    }
}

// ── Notes ───────────────────────────────────────────────────

/**
 * Next serie/correlativo for a note, gap-free and duplicate-free per serie.
 * The note serie takes its first letter from the modified document (B/F, a
 * SUNAT rule) and the rest from the tenant setting (BC01 → FC01 for facturas).
 * `FOR UPDATE` on the tenant row serializes concurrent note creation; the
 * caller inserts the note in the same transaction, so a rollback frees the number.
 */
async function reserveNoteNumber(tx: Tx, tenantId: string, type: NoteType, modifiedSerie: string) {
    const [tenant] = await tx.$queryRaw<Array<{ base: string; counter: number }>>`
        SELECT ${type === "CREDIT_NOTE" ? Prisma.sql`"serieNotaCredito"` : Prisma.sql`"serieNotaDebito"`} AS base,
               ${type === "CREDIT_NOTE" ? Prisma.sql`"lastNotaCredito"` : Prisma.sql`"lastNotaDebito"`} AS counter
        FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
    if (!tenant) throw new Error("Tenant not found.");

    const serie = modifiedSerie.charAt(0) + tenant.base.slice(1);
    const [existing] = await tx.$queryRaw<Array<{ max: number }>>`
        SELECT COALESCE(MAX(n), 0)::int AS max FROM (
            SELECT "correlative"::int AS n FROM "billing_notes"
             WHERE "tenantId" = ${tenantId} AND "serie" = ${serie} AND "correlative" ~ '^[0-9]{1,9}$'
            UNION ALL
            SELECT "creditNoteCorrelativo"::int FROM "sales"
             WHERE "tenantId" = ${tenantId} AND "creditNoteSerie" = ${serie} AND "creditNoteCorrelativo" ~ '^[0-9]{1,9}$'
        ) x`;
    // The tenant counter (editable in settings) only applies to the configured serie.
    const next = Math.max(existing?.max ?? 0, serie === tenant.base ? tenant.counter : 0) + 1;
    if (serie === tenant.base) {
        await tx.tenant.update({
            where: { id: tenantId },
            data: type === "CREDIT_NOTE" ? { lastNotaCredito: next } : { lastNotaDebito: next },
        });
    }
    return { serie, correlative: formatCorrelative(next) };
}

/**
 * Creates the credit note for an approved void, inside the caller's transaction.
 * Returns null when the sale has no SUNAT-accepted document to annul (TICKET,
 * or a BOLETA/FACTURA SUNAT never received). Call emitBillingNote(note.id)
 * after the transaction commits.
 */
export async function createVoidCreditNote(
    tx: Tx,
    input: {
        sale: { id: string; tenantId: string; tipoComprobante: string; serie: string | null; correlativo: string | null; sunatStatus: string | null; total: Prisma.Decimal; clientDocType: string | null; clientDocNumber: string | null; clientName: string | null };
        workerId: string;
        reason: string;
    }
) {
    const { sale } = input;
    if (sale.sunatStatus !== "ACEPTADA" || !sale.serie || !sale.correlativo) return null;
    // Only annul what earlier partial credit notes have not already returned.
    const credited = await tx.billingNote.aggregate({
        where: {
            tenantId: sale.tenantId, type: "CREDIT_NOTE", modifiedDocumentSerie: sale.serie,
            modifiedDocumentCorrelative: sale.correlativo, NOT: { sunatStatus: "RECHAZADA" },
        },
        _sum: { totalAmount: true },
    });
    const remaining = Math.round((Number(sale.total) - Number(credited._sum.totalAmount ?? 0)) * 100) / 100;
    if (remaining <= 0) return null;
    const { serie, correlative } = await reserveNoteNumber(tx, sale.tenantId, "CREDIT_NOTE", sale.serie);
    return tx.billingNote.create({
        data: {
            tenantId: sale.tenantId,
            workerId: input.workerId,
            type: "CREDIT_NOTE",
            serie,
            correlative,
            modifiedDocumentSerie: sale.serie,
            modifiedDocumentCorrelative: sale.correlativo,
            reasonCode: "01",
            reasonDescription: input.reason.trim() || "Anulación de la operación",
            clientDocType: sale.clientDocType ?? "-",
            clientDocNumber: sale.clientDocNumber ?? "0",
            clientName: sale.clientName ?? "CLIENTE VARIOS",
            totalAmount: remaining,
            sunatStatus: "PENDING_SUNAT",
        },
    });
}

/** Sends a note to SUNAT. Same never-throw / claim semantics as emitSale. */
export async function emitBillingNote(noteId: string) {
    const claimed = await prisma.billingNote.updateMany({
        where: { id: noteId, OR: [{ sunatStatus: "PENDING_SUNAT" }, staleClaim()] },
        data: { sunatStatus: "ENVIANDO" },
    });
    if (claimed.count === 0) return prisma.billingNote.findUnique({ where: { id: noteId } });

    const { tenant, ...note } = await prisma.billingNote.findUniqueOrThrow({
        where: { id: noteId },
        include: { tenant: true },
    });
    try {
        if (!tenant.electronicInvoicingEnabled) {
            throw new Error("Facturación electrónica desactivada.");
        }
        const sale = await prisma.sale.findFirst({
            where: { tenantId: note.tenantId, serie: note.modifiedDocumentSerie, correlativo: note.modifiedDocumentCorrelative },
            include: { items: { include: { product: true } } },
        });
        const amount = Number(note.totalAmount);
        // A credit note for the whole document reuses the sale lines; partial
        // amounts and debit notes go as a single line.
        const payload = note.type === "CREDIT_NOTE" && sale && Number(sale.total) === amount
            ? {
                ...buildCreditNotePayload(
                    { tenant, sale: { ...sale, creditNoteSerie: note.serie, creditNoteCorrelativo: note.correlative } },
                    note.reasonDescription
                ),
                codMotivo: note.reasonCode,
                fechaEmision: formatSunatDate(note.createdAt),
            }
            : buildManualNotePayload(tenant, { ...note, totalAmount: amount });
        const r = await emitNote(tenant, payload);
        return prisma.billingNote.update({ where: { id: noteId }, data: emissionData(r) });
    } catch (error) {
        console.error(`[SUNAT] nota ${note.serie}-${note.correlative} queda pendiente:`, error instanceof Error ? error.message : error);
        return prisma.billingNote.update({
            where: { id: noteId },
            data: { sunatStatus: "PENDING_SUNAT", sunatResponse: errorResponse(error) },
        });
    }
}

export type CreateBillingNoteInput = {
    tenantId: string;
    workerId: string;
    /** 6-digit owner/admin approval code, required to authorize this financial record. */
    approvalCode: string;
    type: NoteType;
    modifiedDocumentSerie: string;
    modifiedDocumentCorrelative: string;
    reasonCode: string;
    reasonDescription: string;
    totalAmount: number;
};

/**
 * Manual credit/debit note against a SUNAT-accepted BOLETA/FACTURA of this
 * tenant. Serie/correlativo are assigned here and the client is copied from
 * the modified document (SUNAT requires them to match). The note is saved
 * first and then sent; a failed send leaves it PENDING_SUNAT for retry.
 */
export async function createBillingNote(input: CreateBillingNoteInput) {
    const worker = await prisma.worker.findFirst({
        where: { id: input.workerId, tenantId: input.tenantId, isActive: true },
    });
    if (!worker) {
        throw new Error("Worker not found or inactive for this tenant.");
    }
    await verifyApprovalCode(input.tenantId, input.workerId, input.approvalCode);

    const reasons = input.type === "CREDIT_NOTE" ? CREDIT_REASONS : DEBIT_REASONS;
    if (!reasons.has(input.reasonCode)) {
        throw new Error(`Código de motivo ${input.reasonCode} no válido para ${input.type === "CREDIT_NOTE" ? "nota de crédito" : "nota de débito"}.`);
    }
    const reasonDescription = input.reasonDescription.trim();
    if (!reasonDescription) throw new Error("La descripción del motivo es obligatoria.");
    const amount = Math.round(Number(input.totalAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto debe ser mayor a 0.");

    const serie = input.modifiedDocumentSerie.trim().toUpperCase();
    const correlativo = /^\d{1,8}$/.test(input.modifiedDocumentCorrelative.trim())
        ? formatCorrelative(Number(input.modifiedDocumentCorrelative.trim()))
        : input.modifiedDocumentCorrelative.trim();

    const note = await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.findFirst({
            where: { tenantId: input.tenantId, serie, correlativo, tipoComprobante: { in: ["BOLETA", "FACTURA"] } },
        });
        if (!sale) throw new Error(`Documento ${serie}-${correlativo} no encontrado.`);
        if (sale.sunatStatus !== "ACEPTADA") {
            throw new Error(`El documento ${serie}-${correlativo} no está aceptado por SUNAT (estado: ${sale.sunatStatus ?? "sin enviar"}).`);
        }
        // Lock first (tenant row): concurrent notes on the same document then see
        // each other's amounts in the balance check below.
        const number = await reserveNoteNumber(tx, input.tenantId, input.type, serie);
        if (input.type === "CREDIT_NOTE") {
            if (sale.status === "CANCELLED") throw new Error("El documento ya fue anulado.");
            const credited = await tx.billingNote.aggregate({
                where: {
                    tenantId: input.tenantId, type: "CREDIT_NOTE", modifiedDocumentSerie: serie,
                    modifiedDocumentCorrelative: correlativo, NOT: { sunatStatus: "RECHAZADA" },
                },
                _sum: { totalAmount: true },
            });
            const available = Number(sale.total) - Number(credited._sum.totalAmount ?? 0);
            if (amount > available + 0.001) {
                throw new Error(`El monto excede el saldo del documento (disponible S/ ${available.toFixed(2)}).`);
            }
        }

        return tx.billingNote.create({
            data: {
                tenantId: input.tenantId,
                workerId: input.workerId,
                type: input.type,
                ...number,
                modifiedDocumentSerie: serie,
                modifiedDocumentCorrelative: correlativo,
                reasonCode: input.reasonCode,
                reasonDescription,
                clientDocType: sale.clientDocType ?? "-",
                clientDocNumber: sale.clientDocNumber ?? "0",
                clientName: sale.clientName ?? "CLIENTE VARIOS",
                totalAmount: amount,
                sunatStatus: "PENDING_SUNAT",
            },
        });
    });

    return emitBillingNote(note.id);
}

/** Retries every pending sale and note of the tenant (oldest first, sequentially). */
export async function retryPendingDocuments(tenantId: string, limit = 50) {
    const pendingOr = [{ sunatStatus: null }, { sunatStatus: "PENDING_SUNAT" }, staleClaim()];
    const [sales, notes] = await Promise.all([
        prisma.sale.findMany({
            where: { tenantId, status: "PENDING_SUNAT", tipoComprobante: { in: ["BOLETA", "FACTURA"] }, OR: pendingOr },
            select: { id: true },
            orderBy: { createdAt: "asc" },
            take: limit,
        }),
        prisma.billingNote.findMany({
            where: { tenantId, OR: [{ sunatStatus: "PENDING_SUNAT" }, staleClaim()] },
            select: { id: true },
            orderBy: { createdAt: "asc" },
            take: limit,
        }),
    ]);

    const tally = (statuses: Array<string | null | undefined>) =>
        statuses.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s ?? "?"]: (acc[s ?? "?"] ?? 0) + 1 }), {});
    const saleResults: Array<string | null> = [];
    for (const s of sales) saleResults.push(await emitSale(s.id));
    const noteResults: Array<string | null | undefined> = [];
    for (const n of notes) noteResults.push((await emitBillingNote(n.id))?.sunatStatus);

    return {
        sales: { processed: sales.length, ...tally(saleResults) },
        notes: { processed: notes.length, ...tally(noteResults) },
    };
}

export async function countPendingDocuments(tenantId: string) {
    const [sales, notes] = await Promise.all([
        prisma.sale.count({ where: { tenantId, status: "PENDING_SUNAT", tipoComprobante: { in: ["BOLETA", "FACTURA"] } } }),
        prisma.billingNote.count({ where: { tenantId, sunatStatus: { in: ["PENDING_SUNAT", "ENVIANDO"] } } }),
    ]);
    return { sales, notes };
}

/** Boletas/facturas del negocio con ese correlativo (puede haber una B001 y una F001 con el mismo número). */
export async function findDocumentsByCorrelativo(tenantId: string, correlativoRaw: string) {
    const raw = correlativoRaw.trim();
    if (!/^\d{1,8}$/.test(raw)) throw new Error("El correlativo debe tener solo dígitos (máx. 8).");
    const sales = await prisma.sale.findMany({
        where: { tenantId, correlativo: formatCorrelative(Number(raw)), tipoComprobante: { in: ["BOLETA", "FACTURA"] } },
        select: { serie: true, correlativo: true, tipoComprobante: true, total: true, clientName: true, clientDocNumber: true, sunatStatus: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 6,
    });
    return sales.map((s) => ({ ...s, total: Number(s.total) }));
}

/**
 * Datos del documento que una nota va a modificar: total, saldo aún no devuelto y productos.
 * Sirve para calcular descuentos (motivos 04/05) sin que el cajero haga cuentas a mano.
 */
export async function getDocumentForNote(tenantId: string, serieRaw: string, correlativoRaw: string) {
    const serie = serieRaw.trim().toUpperCase();
    const correlativo = /^\d{1,8}$/.test(correlativoRaw.trim()) ? formatCorrelative(Number(correlativoRaw.trim())) : correlativoRaw.trim();
    const sale = await prisma.sale.findFirst({
        where: { tenantId, serie, correlativo, tipoComprobante: { in: ["BOLETA", "FACTURA"] } },
        select: {
            total: true, status: true, sunatStatus: true, clientName: true,
            items: { select: { qty: true, unitPrice: true, discount: true, virtualLabel: true, product: { select: { name: true } } } },
        },
    });
    if (!sale) throw new Error(`Documento ${serie}-${correlativo} no encontrado.`);
    const credited = await prisma.billingNote.aggregate({
        where: { tenantId, type: "CREDIT_NOTE", modifiedDocumentSerie: serie, modifiedDocumentCorrelative: correlativo, NOT: { sunatStatus: "RECHAZADA" } },
        _sum: { totalAmount: true },
    });
    const total = Number(sale.total);
    const creditedAmount = Number(credited._sum.totalAmount ?? 0);
    return {
        serie, correlativo,
        status: sale.status, sunatStatus: sale.sunatStatus, clientName: sale.clientName,
        total, credited: creditedAmount,
        available: Math.max(0, Math.round((total - creditedAmount) * 100) / 100),
        items: sale.items.map((i) => ({
            name: i.product?.name ?? i.virtualLabel ?? "Venta libre",
            qty: i.qty,
            lineTotal: Math.round((Number(i.unitPrice) * i.qty - Number(i.discount)) * 100) / 100,
        })),
    };
}

export async function listBillingNotes(tenantId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notes, total, pending] = await Promise.all([
        prisma.billingNote.findMany({
            where: { tenantId },
            // xml/cdr payloads are large and not needed in the list.
            omit: { sunatXmlUrl: true, sunatCdrUrl: true },
            include: {
                worker: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.billingNote.count({ where: { tenantId } }),
        countPendingDocuments(tenantId),
    ]);

    return {
        data: notes,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            pending,
        },
    };
}
