import { prisma } from "../../lib/prisma.ts";
import { Prisma } from "@prisma/client";
import { cashDayLockKey, limaDayBounds, limaYmd } from "../cash/cash.service.ts";
import { getTodayCashStatus } from "../cash/summary.ts";
import {
    resolveIgvRegime,
    calculateFiscalLine,
} from "../apisperu/apisperu.service.ts";
import { emitSale, createVoidCreditNote, emitBillingNote } from "../billing/billing.service.ts";
import nodemailer from "nodemailer";
import {
    computePlayzoneCharge,
    computeExtensionCharge,
    getPlayzoneRates,
    type PlayzoneChargeKind,
} from "../playzone/playzone.service.ts";

// ============================================================
//  POS Service — Business Logic
// ============================================================

export type SaleItemInput = {
    productId: string;
    qty: number;
    unitPrice?: number;
    label?: string;
    /** Descuento en soles sobre el total de la línea (solo catálogo). */
    discount?: number;
};

export type ComprobanteType = "TICKET" | "BOLETA" | "FACTURA";

export type ProcessSaleInput = {
    tenantId: string;
    workerId: string;
    items: SaleItemInput[];
    tipoComprobante: ComprobanteType;
    paymentMethod: "efectivo" | "yape" | "tarjeta";
    clientDocType?: "1" | "6" | "-" | undefined;
    clientDocNumber?: string | undefined;
    clientName?: string | undefined;
    clientAddress?: string | undefined;
    amountReceived?: number | undefined;
};

export type ProcessSaleResult = {
    sale: {
        id: string;
        total: string;
        tipoComprobante: string;
        serie: string | null;
        correlativo: string | null;
        sunatStatus: string | null;
        tenantId: string;
        workerId: string;
        createdAt: Date;
    };
    items: Array<{
        id: string;
        productId: string | null;
        productName: string;
        qty: number;
        unitPrice: string;
        discount: string;
        lineTotal: string;
    }>;
};

// ── Virtual line items (not real products) ────────────────────
// `pz-*`     → playzone time charges (session minutes billed at checkout)
// `free-sale-*` → "Venta libre" free-form lines entered manually in the POS
function isVirtualLineItem(productId: string): boolean {
    return productId.startsWith('pz-') || productId.startsWith('free-sale-');
}

const PZ_SKU = /^pz-(base|extra|free|comp|disc|ext)-(.+)$/;

type VirtualLine = { qty: number; unitPrice: number; label: string; sku: string };

/**
 * Resuelve las líneas virtuales. Los cargos de zona de juegos se recalculan
 * desde la sesión + tarifas del tenant (el unitPrice del cliente se ignora) y
 * se rechazan si ya fueron cobrados en una venta no anulada.
 */
async function resolveVirtualLines(
    tx: TxClient,
    tenantId: string,
    items: SaleItemInput[]
): Promise<VirtualLine[]> {
    const pzSkus = items.filter((i) => i.productId.startsWith("pz-")).map((i) => i.productId);
    if (new Set(pzSkus).size !== pzSkus.length) {
        throw new Error("Cargo de zona de juegos duplicado en la venta.");
    }
    const rates = pzSkus.length > 0 ? await getPlayzoneRates(tenantId) : null;

    const lines: VirtualLine[] = [];
    for (const item of items) {
        if (item.productId.startsWith("free-sale-")) {
            if (!item.unitPrice || item.unitPrice <= 0) throw new Error("Venta libre sin monto válido.");
            lines.push({
                qty: item.qty,
                unitPrice: item.unitPrice,
                label: item.label?.trim() || "Venta libre",
                sku: item.productId,
            });
            continue;
        }

        const match = PZ_SKU.exec(item.productId);
        if (!match) throw new Error(`Cargo de zona de juegos inválido: "${item.productId}".`);
        const kind = match[1] as PlayzoneChargeKind;
        // El descuento por aliado solo vale junto al cargo base de la misma sesión (nunca suelto)
        if (kind === "disc" && !items.some((i) => i.productId === `pz-base-${match[2]}`)) {
            throw new Error("El descuento por aliado requiere cobrar el tiempo de la sesión en la misma venta.");
        }
        // pz-ext-<sesión>~<min añadidos>~<duración total resultante>
        const [sessionId, extAdd, extTotal] = kind === "ext" ? match[2]!.split("~") : [match[2]!];
        const session = await tx.playSession.findFirst({
            where: { id: sessionId!, tenantId },
            include: { child: { select: { fullName: true, age: true } } },
        });
        if (!session) throw new Error(`Play session "${match[2]}" not found for this tenant.`);
        let charge;
        if (kind === "ext") {
            const add = Number(extAdd), total = Number(extTotal);
            // Solo cobra ampliaciones que la sesión ya tiene aplicadas
            if (!Number.isInteger(add) || !Number.isInteger(total) || session.durationMinutes === null || total > session.durationMinutes) {
                throw new Error("Ampliación de tiempo inválida.");
            }
            charge = computeExtensionCharge(session, add, total, rates!);
        } else charge = computePlayzoneCharge(session, kind, rates!);
        // El pago confirma el inicio: el reloj arranca al cobrar, no al registrar
        if ((kind === "base" || kind === "comp") && session.status === "PENDING") {
            await tx.playSession.update({ where: { id: session.id }, data: { status: "ACTIVE", startTime: new Date() } });
        }

        // Serializa cobros concurrentes del mismo cargo hasta el commit
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${charge.sku}))`;
        const alreadyBilled = await tx.saleItem.findFirst({
            where: { virtualSku: charge.sku, sale: { tenantId, status: { not: "CANCELLED" } } },
            select: { id: true },
        });
        if (alreadyBilled) throw new Error(`El cargo "${charge.label}" ya fue cobrado en otra venta.`);

        lines.push({ qty: 1, unitPrice: charge.amount, label: charge.label, sku: charge.sku });
    }
    return lines;
}

type TxClient = Prisma.TransactionClient;

/**
 * Atomically reserves the next correlativo for a tenant+document type.
 *
 * Previously this read `lastBoletaNumber`/`lastFacturaNumber` with one query
 * and wrote the incremented value with a second, separate query against the
 * non-transactional `prisma` client. Two concurrent sales could both read the
 * same number before either committed its write, handing out the same
 * correlativo to two different SUNAT documents (a real compliance violation —
 * SUNAT rejects/flags duplicate correlativos). A single `UPDATE ... RETURNING`
 * inside the sale's own transaction closes that gap: Postgres takes a row
 * lock on the tenant row for the `UPDATE`, so a second concurrent transaction
 * blocks until the first commits, and always reads the post-increment value.
 */
async function getNextCorrelative(
    tx: TxClient,
    tenantId: string,
    tipoComprobante: ComprobanteType
): Promise<{ serie: string; correlativo: string }> {
    if (tipoComprobante === "TICKET") {
        return { serie: "", correlativo: "" };
    }

    const column = tipoComprobante === "BOLETA" ? "lastBoletaNumber" : "lastFacturaNumber";
    const serieColumn = tipoComprobante === "BOLETA" ? "serieBoleta" : "serieFactura";

    const rows = await tx.$queryRawUnsafe<Array<{ next: number; serie: string }>>(
        `UPDATE "tenants" SET "${column}" = "${column}" + 1 WHERE "id" = $1 RETURNING "${column}" AS next, "${serieColumn}" AS serie`,
        tenantId
    );

    const row = rows[0];
    if (!row) {
        throw new Error("Tenant not found");
    }

    return {
        serie: row.serie,
        correlativo: String(row.next).padStart(8, "0"),
    };
}

function normalizeClientData(
    tipoComprobante: ComprobanteType,
    clientDocType?: "1" | "6" | "-",
    clientDocNumber?: string,
    clientName?: string
): { clientDocType: "1" | "6" | "-"; clientDocNumber: string; clientName: string } {
    if (tipoComprobante === "TICKET") {
        return { clientDocType: "-", clientDocNumber: "0", clientName: "CLIENTE VARIOS" };
    }

    if (tipoComprobante === "BOLETA") {
        const dni = clientDocNumber?.trim();
        // The POS sends "0" when the customer gives no DNI: that is "sin documento", not a DNI.
        if (!dni || dni === "0") {
            return { clientDocType: "-", clientDocNumber: "0", clientName: "CLIENTE VARIOS" };
        }
        return {
            clientDocType: clientDocType ?? "1",
            clientDocNumber: dni,
            clientName: clientName?.trim() || "CLIENTE VARIOS",
        };
    }

    // FACTURA
    const ruc = clientDocNumber?.trim();
    if (!ruc) {
        throw new Error("RUC is required for invoices.");
    }
    return {
        clientDocType: "6",
        clientDocNumber: ruc,
        clientName: clientName?.trim() || "CLIENTE VARIOS",
    };
}

/**
 * Processes a POS sale inside a Prisma interactive transaction.
 *
 * Steps (all atomic):
 *  1. Validate the worker belongs to the tenant.
 *  2. Fetch all products (scoped to tenant) with fiscal config.
 *  3. Validate sufficient stock for every item.
 *  4. Decrement stock for each product.
 *  5. Calculate fiscal summary (IGV, exonerated, etc.).
 *  6. Generate series/correlative if BOLETA/FACTURA.
 *  7. Create the Sale header with fiscal breakdown.
 *  8. Create all SaleItem rows.
 *  9. Emit electronic document via APISPeru if BOLETA/FACTURA.
 * 10. Return the assembled result.
 */
export async function processSale(
    input: ProcessSaleInput
): Promise<ProcessSaleResult> {
    // Validate the worker exists and belongs to the tenant
    const worker = await prisma.worker.findFirst({
        where: { id: input.workerId, tenantId: input.tenantId, isActive: true },
    });
    if (!worker) {
        throw new Error("Worker not found or inactive for this tenant.");
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: input.tenantId },
    });
    if (!tenant) {
        throw new Error("Tenant not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
        // Sales only count in an open drawer, otherwise the frozen close stops matching reality.
        // The shared lock makes a concurrent close wait for this sale; the status is read after it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${cashDayLockKey(input.tenantId)}))`;
        const cashStatus = await getTodayCashStatus(input.tenantId, tx);
        if (cashStatus !== "ABIERTA") {
            throw new Error(`CASH_NOT_OPEN: la caja no está abierta (${cashStatus}).`);
        }
        // ── Split real vs virtual line items ───────────────────
        // Virtual items are never looked up in the Product table and never
        // touch stock: `pz-*` (playzone time, priced from tenant rates) and
        // `free-sale-*` ("Venta libre", client-priced by nature).
        // Cada producto una sola vez: se suman las cantidades de líneas repetidas
        const merged = new Map<string, SaleItemInput>();
        for (const i of input.items.filter((i) => !isVirtualLineItem(i.productId))) {
            const prev = merged.get(i.productId);
            merged.set(i.productId, prev ? { ...prev, qty: prev.qty + i.qty, discount: (prev.discount ?? 0) + (i.discount ?? 0) } : { ...i });
        }
        const realItems = [...merged.values()];
        const pzItems = await resolveVirtualLines(
            tx,
            input.tenantId,
            input.items.filter((i) => isVirtualLineItem(i.productId))
        );
        // Una línea negativa no es válida en boleta/factura electrónica: el descuento por aliado va solo en ticket
        if (input.tipoComprobante !== "TICKET" && pzItems.some((l) => l.unitPrice < 0)) {
            throw new Error("El descuento por aliado solo se puede cobrar con ticket (no boleta ni factura).");
        }
        if (input.items.some((i) => isVirtualLineItem(i.productId) && (i.discount ?? 0) > 0)) {
            throw new Error("El descuento por producto no aplica a venta libre ni a zona de juegos.");
        }
        const productIds = realItems.map((i) => i.productId);

        // ── Step 1: Fetch all products (tenant-scoped) ───────────
        const products = await tx.product.findMany({
            where: {
                id: { in: productIds },
                tenantId: input.tenantId,
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                stock: true,
                trackStock: true,
                igvRegime: true,
            },
        });

        // Build a lookup map for O(1) access
        const productMap = new Map(products.map((p) => [p.id, p]));

        // ── Step 2: Validate every requested item ────────────────
        for (const item of realItems) {
            const product = productMap.get(item.productId);
            if (!product) {
                throw new Error(
                    `Product "${item.productId}" not found or not available for this tenant.`
                );
            }
            const discount = item.discount ?? 0;
            if (!Number.isFinite(discount) || discount < 0 || Number(discount.toFixed(2)) !== discount) {
                throw new Error(`Descuento inválido para "${product.name}".`);
            }
            if (discount >= Number(product.price) * item.qty) {
                throw new Error(`El descuento de "${product.name}" debe ser menor al total de la línea.`);
            }
            if (product.trackStock && product.stock < item.qty) {
                throw new Error(
                    `Insufficient stock for product "${product.name}". Available: ${product.stock}, Requested: ${item.qty}.`
                );
            }
        }

        // ── Step 3: Decrement stock atomically ───────────────────
        const itemsToTrack = realItems.filter((item) => {
            const product = productMap.get(item.productId);
            return product?.trackStock;
        });

        const stockAfter = new Map<string, number>();
        await Promise.all(
            itemsToTrack.map(async (item) => {
                try {
                    const upd = await tx.product.update({
                        where: {
                            id: item.productId,
                            stock: { gte: item.qty },
                        },
                        data: { stock: { decrement: item.qty } },
                        select: { stock: true },
                    });
                    stockAfter.set(item.productId, upd.stock);
                } catch (error) {
                    const product = productMap.get(item.productId)!;
                    throw new Error(
                        `Error de concurrencia: Alguien acaba de comprar "${product.name}" y el stock ya no es suficiente.`
                    );
                }
            })
        );

        // ── Step 4: Calculate fiscal summary ─────────────────────
        const igvRate = Number(tenant.igvRate);
        const pricesIncludeIgv = tenant.pricesIncludeIgv;

        const fiscalLines = realItems.map((item) => {
            const product = productMap.get(item.productId)!;
            const regime = resolveIgvRegime(product.igvRegime, tenant.defaultIgvRegime);
            return calculateFiscalLine(
                Number(product.price),
                item.qty,
                regime,
                igvRate,
                pricesIncludeIgv,
                item.discount ?? 0
            );
        });

        // Virtual items: EXONERADO (same as apisperu buildFiscalSummary)
        const pzFiscalLines = pzItems.map((item) =>
            calculateFiscalLine(item.unitPrice, item.qty, 'EXONERADO', igvRate, false)
        );

        const allFiscalLines = [...fiscalLines, ...pzFiscalLines];

        const mtoOperGravadas = allFiscalLines
            .filter((l) => l.regime === "GRAVADO" || l.regime === "GRAVADO_10_5" || l.regime === "ICBPER")
            .reduce((sum, l) => sum + l.mtoValorVenta, 0);
        const mtoOperExoneradas = allFiscalLines
            .filter((l) => l.regime === "EXONERADO")
            .reduce((sum, l) => sum + l.mtoValorVenta, 0);
        const mtoOperInafectas = allFiscalLines
            .filter((l) => l.regime === "INAFECTO")
            .reduce((sum, l) => sum + l.mtoValorVenta, 0);
        const mtoIGV = allFiscalLines.reduce((sum, l) => sum + l.mtoIGV, 0);
        const mtoImpVenta = allFiscalLines.reduce((sum, l) => sum + l.mtoImpItem, 0);

        // ── Step 5: Generate series/correlative ──────────────────
        const { serie, correlativo } = await getNextCorrelative(
            tx,
            input.tenantId,
            input.tipoComprobante
        );

        // ── Step 6: Normalize client data ────────────────────────
        const client = normalizeClientData(
            input.tipoComprobante,
            input.clientDocType,
            input.clientDocNumber,
            input.clientName
        );

        // SUNAT: una boleta de S/ 700 o más exige identificar al cliente con DNI.
        if (input.tipoComprobante === "BOLETA" && mtoImpVenta >= 700 && !/^\d{8}$/.test(client.clientDocNumber)) {
            throw new Error("Boleta de S/ 700 o más: ingresa el DNI del cliente (8 dígitos).");
        }

        if (input.paymentMethod === "efectivo" && input.amountReceived !== undefined && input.amountReceived + 0.001 < mtoImpVenta) {
            throw new Error("El efectivo recibido es menor al total de la venta.");
        }

        // ── Step 7: Create Sale header ───────────────────────────
        const sale = await tx.sale.create({
            data: {
                tenantId: input.tenantId,
                workerId: input.workerId,
                total: mtoImpVenta,
                tipoComprobante: input.tipoComprobante,
                serie: input.tipoComprobante === "TICKET" ? null : serie,
                correlativo: input.tipoComprobante === "TICKET" ? null : correlativo,
                clientDocType: client.clientDocType,
                clientDocNumber: client.clientDocNumber,
                clientName: client.clientName,
                clientAddress: input.tipoComprobante === "FACTURA" ? input.clientAddress?.trim() || null : null,
                amountReceived: input.paymentMethod === "efectivo" ? input.amountReceived ?? null : null,
                paymentMethod: input.paymentMethod,
                status: input.tipoComprobante === "TICKET" ? "ACTIVE" : "PENDING_SUNAT",
                mtoOperGravadas: Number(mtoOperGravadas.toFixed(2)),
                mtoOperExoneradas: Number(mtoOperExoneradas.toFixed(2)),
                mtoOperInafectas: Number(mtoOperInafectas.toFixed(2)),
                mtoIGV: Number(mtoIGV.toFixed(2)),
                mtoImpVenta: Number(mtoImpVenta.toFixed(2)),
                items: {
                    create: [
                        ...realItems.map((item) => {
                            const product = productMap.get(item.productId)!;
                            return {
                                productId: item.productId,
                                qty: item.qty,
                                unitPrice: product.price,
                                discount: item.discount ?? 0,
                            };
                        }),
                        // Virtual items (pz-*, free-sale-*) are not real products —
                        // productId must stay null to satisfy the Product FK.
                        ...pzItems.map((item) => ({
                            productId: null,
                            qty: item.qty,
                            unitPrice: item.unitPrice,
                            isVirtual: true,
                            virtualLabel: item.label,
                            virtualSku: item.sku,
                        })),
                    ],
                },
            },
            select: {
                id: true,
                total: true,
                tipoComprobante: true,
                serie: true,
                correlativo: true,
                clientDocType: true,
                clientDocNumber: true,
                clientName: true,
                paymentMethod: true,
                status: true,
                mtoOperGravadas: true,
                mtoOperExoneradas: true,
                mtoOperInafectas: true,
                mtoIGV: true,
                mtoImpVenta: true,
                tenantId: true,
                workerId: true,
                createdAt: true,
                items: {
                    select: {
                        id: true,
                        productId: true,
                        qty: true,
                        unitPrice: true,
                        discount: true,
                        isVirtual: true,
                        virtualLabel: true,
                    },
                },
            },
        });

        // Kardex: one VENTA movement per tracked line (same transaction)
        if (itemsToTrack.length > 0) {
            await tx.stockMovement.createMany({
                data: itemsToTrack.map((item) => ({
                    type: "VENTA", delta: -item.qty,
                    stockBefore: stockAfter.get(item.productId)! + item.qty, stockAfter: stockAfter.get(item.productId)!,
                    tenantId: input.tenantId, productId: item.productId, workerId: input.workerId, saleId: sale.id,
                })),
            });
        }

        // Emisión SUNAT: fuera de la transacción (ver emitSale tras el commit)
        const sunatStatus: string | null = sale.status === "ACTIVE" ? null : "PENDING_SUNAT";

        // ── Step 9: Assemble enriched result ─────────────────────
        // Match by productId (not position: nested create order isn't guaranteed).
        const enrichedItems = sale.items.map((si) => {
            const product = si.productId ? productMap.get(si.productId) : undefined;
            const line = product
                ? calculateFiscalLine(Number(product.price), si.qty, resolveIgvRegime(product.igvRegime, tenant.defaultIgvRegime), igvRate, pricesIncludeIgv, Number(si.discount))
                : calculateFiscalLine(Number(si.unitPrice), si.qty, "EXONERADO", igvRate, false);

            return {
                id: si.id,
                productId: si.productId,
                productName: product?.name ?? si.virtualLabel ?? "Venta libre",
                qty: si.qty,
                unitPrice: si.unitPrice.toString(),
                discount: Number(si.discount).toFixed(2),
                lineTotal: line.mtoImpItem.toFixed(2),
            };
        });

        return {
            sale: {
                id: sale.id,
                total: sale.total.toString(),
                tipoComprobante: sale.tipoComprobante,
                serie: sale.serie,
                correlativo: sale.correlativo,
                sunatStatus,
                tenantId: sale.tenantId,
                workerId: sale.workerId,
                createdAt: sale.createdAt,
            },
            items: enrichedItems,
        };
    });

    if (result.sale.sunatStatus === "PENDING_SUNAT") {
        result.sale.sunatStatus = await emitSale(result.sale.id);
    }
    return result;
}

export async function listSales(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
    dateFrom?: Date,
    dateTo?: Date,
    status?: string
) {
    const skip = (page - 1) * limit;

    const where: {
        tenantId: string;
        status?: string;
        createdAt?: { gte?: Date; lte?: Date };
    } = { tenantId };
    if (status) where.status = status;

    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = dateFrom;
        if (dateTo) where.createdAt.lte = dateTo;
    }

    const [sales, total] = await Promise.all([
        prisma.sale.findMany({
            where,
            // XML/CDR pesan cientos de KB por venta: se piden aparte (getSunatFile).
            omit: { sunatXmlUrl: true, sunatCdrUrl: true },
            include: {
                worker: { select: { name: true } },
                items: {
                    include: {
                        product: { select: { name: true, sku: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.sale.count({ where }),
    ]);

    return {
        data: sales.map((sale) => ({
            ...sale,
            items: sale.items.map((item) => ({
                ...item,
                product: item.product ?? {
                    name: item.virtualLabel ?? "Venta libre",
                    sku: item.virtualSku ?? "VARIOS",
                },
            })),
        })),
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/** XML firmado (texto) o CDR (zip en base64) que APISPeru devolvió al emitir; bytes listos para descargar. */
export async function getSunatFile(tenantId: string, saleId: string, kind: "xml" | "cdr") {
    const sale = await prisma.sale.findFirst({
        where: { id: saleId, tenantId },
        select: { serie: true, correlativo: true, sunatXmlUrl: true, sunatCdrUrl: true },
    });
    if (!sale) throw new Error("Sale not found.");
    const content = kind === "xml" ? sale.sunatXmlUrl : sale.sunatCdrUrl;
    if (!content) throw new Error("not found: este comprobante no tiene ese archivo (aún no fue aceptado por SUNAT).");
    const name = `${sale.serie}-${sale.correlativo}`;
    return kind === "xml"
        ? { bytes: new TextEncoder().encode(content), type: "application/xml", filename: `${name}.xml` }
        : { bytes: Buffer.from(content, "base64"), type: "application/zip", filename: `R-${name}.zip` };
}

export async function getSaleById(tenantId: string, saleId: string) {
    const sale = await prisma.sale.findFirst({
        where: { id: saleId, tenantId },
        omit: { sunatXmlUrl: true, sunatCdrUrl: true },
        include: {
            worker: { select: { name: true } },
            items: {
                include: {
                    product: { select: { name: true, sku: true, igvRegime: true } },
                },
            },
            voidRequests: {
                orderBy: { requestedAt: "desc" },
                take: 1,
            },
        },
    });

    if (!sale) {
        throw new Error("Sale not found.");
    }

    return {
        ...sale,
        items: sale.items.map((item) => ({
            ...item,
            product: item.product ?? {
                name: item.virtualLabel ?? "Venta libre",
                sku: item.virtualSku ?? "VARIOS",
            },
        })),
    };
}

export async function listSalesToday(tenantId: string) {
    const { start: startOfDay, end: endOfDay } = limaDayBounds(limaYmd());

    const sales = await prisma.sale.findMany({
        where: {
            tenantId,
            createdAt: {
                gte: startOfDay,
                lt: endOfDay,
            },
        },
        include: {
            worker: { select: { name: true } },
            items: {
                include: {
                    product: { select: { name: true, sku: true } },
                },
            },
        },
        orderBy: { createdAt: "desc" },
        // shortcut: hard cap keeps the payload bounded; a single day above this needs pagination.
        take: 2000,
    });

    // Map virtual line item product names (playzone / free-sale)
    return sales.map((sale) => ({
        ...sale,
        items: sale.items.map((item) => ({
            ...item,
            product: item.product ?? {
                name: item.virtualLabel ?? "Venta libre",
                sku: item.virtualSku ?? "VARIOS",
            },
        })),
    }));
}

export async function listVoidRequests(
    tenantId: string,
    status?: "PENDING" | "APPROVED" | "REJECTED"
) {
    return prisma.voidRequest.findMany({
        where: {
            tenantId,
            ...(status ? { status } : {}),
        },
        include: {
            sale: {
                select: {
                    id: true,
                    total: true,
                    tipoComprobante: true,
                    serie: true,
                    correlativo: true,
                    createdAt: true,
                    items: {
                        include: {
                            product: { select: { name: true } },
                        },
                    },
                },
            },
            requester: { select: { name: true } },
            approver: { select: { name: true } },
        },
        orderBy: { requestedAt: "desc" },
    }).then((requests) =>
        requests.map((vr) => ({
            ...vr,
            sale: {
                ...vr.sale,
                items: vr.sale.items.map((item) => ({
                    ...item,
                    product: item.product ?? { name: item.virtualLabel ?? "Venta libre" },
                })),
            },
        }))
    );
}

export type CreateVoidRequestInput = {
    saleId: string;
    tenantId: string;
    requesterWorkerId: string;
    reason: string;
};

export async function createVoidRequest(input: CreateVoidRequestInput) {
    const sale = await prisma.sale.findUnique({
        where: { id: input.saleId },
        include: { voidRequests: true },
    });

    if (!sale || sale.tenantId !== input.tenantId) {
        throw new Error("Sale not found for this tenant.");
    }

    if (sale.status === "CANCELLED") {
        throw new Error("Sale is already cancelled.");
    }

    const hasPending = sale.voidRequests.some((vr) => vr.status === "PENDING");
    if (hasPending) {
        throw new Error("There is already a pending void request for this sale.");
    }

    return prisma.voidRequest.create({
        data: {
            saleId: input.saleId,
            requesterWorkerId: input.requesterWorkerId,
            reason: input.reason,
            tenantId: sale.tenantId,
        },
    });
}

export type ResolveVoidInput = {
    voidRequestId: string;
    tenantId: string;
    approverWorkerId: string;
    approve: boolean;
};

export async function resolveVoidRequest(input: ResolveVoidInput) {
    const voidRequest = await prisma.voidRequest.findFirst({
        where: { id: input.voidRequestId, tenantId: input.tenantId },
        include: {
            sale: {
                include: {
                    items: {
                        include: { product: true },
                    },
                    tenant: true,
                },
            },
        },
    });

    if (!voidRequest) {
        throw new Error("Void request not found.");
    }

    if (voidRequest.status !== "PENDING") {
        throw new Error(`Void request is already ${voidRequest.status}.`);
    }

    if (!input.approve) {
        const { count } = await prisma.voidRequest.updateMany({
            where: { id: input.voidRequestId, status: "PENDING" },
            data: {
                status: "REJECTED",
                approverWorkerId: input.approverWorkerId,
                resolvedAt: new Date(),
            },
        });
        if (count === 0) throw new Error("Void request is already resolved.");
        return prisma.voidRequest.findUniqueOrThrow({ where: { id: input.voidRequestId } });
    }

    const { sale } = voidRequest;
    if (sale.status === "CANCELLED") {
        throw new Error("Sale is already cancelled.");
    }

    if (sale.sunatStatus === "ENVIANDO") {
        throw new Error("El comprobante se está enviando a SUNAT; reintenta en unos segundos.");
    }

    // All DB writes atomic: restore stock, cancel sale, approve void request
    const { resolved, noteId } = await prisma.$transaction(async (tx) => {
        // Claim the request first: a concurrent double-approve gets count 0
        // here and rolls back, so stock is restored exactly once.
        const claimed = await tx.voidRequest.updateMany({
            where: { id: input.voidRequestId, status: "PENDING" },
            data: { status: "APPROVED" },
        });
        const cancelled = await tx.sale.updateMany({
            where: { id: sale.id, status: { not: "CANCELLED" } },
            data: { status: "CANCELLED" },
        });
        if (claimed.count === 0 || cancelled.count === 0) {
            throw new Error("Void request is already resolved.");
        }
        // Nota de crédito solo si SUNAT aceptó la venta (null en otro caso)
        const note = await createVoidCreditNote(tx, { sale, workerId: input.approverWorkerId, reason: voidRequest.reason });
        const creditNoteSerie = note?.serie ?? null;
        const creditNoteCorrelativo = note?.correlative ?? null;

        // Only restore stock for real, stock-tracked products. Virtual lines
        // (playzone time, "venta libre") have productId === null and no
        // Product row to update; non-tracked products must not have their
        // stock figure touched either, mirroring the decrement in processSale.
        for (const item of sale.items.filter((i) => i.productId !== null && i.product?.trackStock)) {
            const upd = await tx.product.update({
                where: { id: item.productId! },
                data: { stock: { increment: item.qty } },
                select: { stock: true },
            });
            await tx.stockMovement.create({
                data: {
                    type: "ANULACION", delta: item.qty, stockBefore: upd.stock - item.qty, stockAfter: upd.stock,
                    tenantId: sale.tenantId, productId: item.productId!, workerId: input.approverWorkerId, saleId: sale.id,
                },
            });
        }

        await tx.sale.update({
            where: { id: sale.id },
            data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
                voidReason: voidRequest.reason,
                creditNoteSerie,
                creditNoteCorrelativo,
            },
        });

        const resolved = await tx.voidRequest.update({
            where: { id: input.voidRequestId },
            data: {
                status: "APPROVED",
                approverWorkerId: input.approverWorkerId,
                resolvedAt: new Date(),
                creditNoteSerie,
                creditNoteCorrelativo,
            },
        });
        return { resolved, noteId: note?.id ?? null };
    });

    const creditNote = noteId ? await emitBillingNote(noteId) : null;
    // La nota emitida viaja con la respuesta para que el cliente la imprima apenas se aprueba.
    return Object.assign(resolved, { creditNote });
}

// ── Send sale receipt by email ────────────────────────────────

function formatPEN(val: number): string {
    return `S/ ${val.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildReceiptHtml(sale: {
    id: string;
    tipoComprobante: string;
    serie: string | null;
    correlativo: string | null;
    clientName: string | null;
    paymentMethod: string;
    status: string;
    total: Prisma.Decimal;
    createdAt: Date;
    amountReceived?: Prisma.Decimal | null;
    items: Array<{ qty: number; unitPrice: Prisma.Decimal; discount?: Prisma.Decimal | null; product: { name: string } | null; virtualLabel: string | null }>;
}): string {
    const docLabel =
        sale.tipoComprobante === "BOLETA" ? "Boleta" :
        sale.tipoComprobante === "FACTURA" ? "Factura" : "Ticket";
    const correlativo = sale.serie && sale.correlativo
        ? `${sale.serie}-${sale.correlativo}`
        : `BW01-${sale.id.slice(-8)}`;

    const itemRows = sale.items
        .map(
            (i) => `
        <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.product?.name ?? i.virtualLabel ?? "Venta libre"}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${formatPEN(Number(i.unitPrice))}${Number(i.discount ?? 0) > 0 ? `<br><span style="font-size:11px;color:#c00">Desc. -${formatPEN(Number(i.discount))}</span>` : ""}</td>
        </tr>`
        )
        .join("");

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
    <div style="text-align:center;border-bottom:2px solid #00c569;padding-bottom:12px;margin-bottom:16px">
        <h2 style="margin:0;color:#1a1a1a">WONKA POS</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#666">${docLabel} ${correlativo}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#999">${sale.createdAt.toLocaleString("es-PE")}</p>
    </div>
    <table style="width:100%;margin-bottom:16px;font-size:13px">
        <tr><td style="color:#666;padding:2px 0">Cliente:</td><td style="text-align:right;font-weight:600">${sale.clientName || "CLIENTE VARIOS"}</td></tr>
        <tr><td style="color:#666;padding:2px 0">Método de pago:</td><td style="text-align:right;font-weight:600">${sale.paymentMethod}</td></tr>
        <tr><td style="color:#666;padding:2px 0">Estado:</td><td style="text-align:right;font-weight:600">${sale.status === "CANCELLED" ? "ANULADO" : "EMITIDO"}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
            <tr style="background:#f5f5f5">
                <th style="padding:6px 8px;text-align:left">Producto</th>
                <th style="padding:6px 8px;text-align:center">Cant.</th>
                <th style="padding:6px 8px;text-align:right">Precio</th>
            </tr>
        </thead>
        <tbody>${itemRows}</tbody>
    </table>
    <div style="border-top:2px solid #00c569;padding-top:12px;text-align:right">
        <span style="font-size:18px;font-weight:800;color:#1a1a1a">TOTAL: ${formatPEN(Number(sale.total))}</span>
        ${sale.paymentMethod === "efectivo" && sale.amountReceived != null ? `<p style="margin:6px 0 0;font-size:12px;color:#666">Pagado ${formatPEN(Number(sale.amountReceived))} · Vuelto ${formatPEN(Math.max(0, Number(sale.amountReceived) - Number(sale.total)))}</p>` : ""}
    </div>
    <p style="text-align:center;font-size:11px;color:#999;margin-top:24px">Gracias por su compra — Wonka POS</p>
</body>
</html>`;
}

export async function sendSaleEmail(
    tenantId: string,
    saleId: string,
    recipientEmail: string
): Promise<{ success: boolean; message: string }> {
    const sale = await prisma.sale.findFirst({
        where: { id: saleId, tenantId },
        include: {
            worker: { select: { name: true } },
            items: {
                include: { product: { select: { name: true } } },
            },
        },
    });

    if (!sale) {
        throw new Error("Sale not found.");
    }

    const smtpHost = process.env["SMTP_HOST"];
    const smtpPort = Number(process.env["SMTP_PORT"] ?? 587);
    const smtpUser = process.env["SMTP_USER"];
    const smtpPass = process.env["SMTP_PASS"];
    const smtpFrom = process.env["SMTP_FROM"] || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
        throw new Error("SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.");
    }

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
    });

    const docLabel =
        sale.tipoComprobante === "BOLETA" ? "Boleta" :
        sale.tipoComprobante === "FACTURA" ? "Factura" : "Ticket";
    const correlativo = sale.serie && sale.correlativo
        ? `${sale.serie}-${sale.correlativo}`
        : `BW01-${sale.id.slice(-8)}`;

    await transporter.sendMail({
        from: smtpFrom,
        to: recipientEmail,
        subject: `${docLabel} ${correlativo} — Wonka POS`,
        html: buildReceiptHtml(sale),
    });

    return { success: true, message: "Receipt sent successfully." };
}
