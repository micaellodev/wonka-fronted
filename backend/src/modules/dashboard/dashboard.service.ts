import { prisma } from "../../lib/prisma.ts";
import { limaDayBounds } from "../cash/cash.service.ts";
import { aggregateSales, getDaySummary } from "../cash/summary.ts";

// ============================================================
//  Dashboard Service — KPIs for the admin dashboard
// ============================================================


export async function getTenantById(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            name: true,
            slug: true,
            ruc: true,
            razonSocial: true,
            nombreComercial: true,
            direccion: true,
            ubigeo: true,
            departamento: true,
            provincia: true,
            distrito: true,
            receiptFooter: true,
            apisperuToken: true,
            apisperuUrl: true,
            igvRate: true,
            defaultIgvRegime: true,
            pricesIncludeIgv: true,
            electronicInvoicingEnabled: true,
            serieBoleta: true,
            serieFactura: true,
            serieNotaCredito: true,
            serieNotaDebito: true,
            lastBoletaNumber: true,
            lastFacturaNumber: true,
            lastNotaCredito: true,
            lastNotaDebito: true,
        },
    });

    if (!tenant) return null;

    // Never return the raw APISPeru secret token to the client — only whether
    // one has been configured, so the frontend can show "configured" vs not.
    const { apisperuToken, ...rest } = tenant;
    return {
        ...rest,
        hasApisperuToken: Boolean(apisperuToken),
    };
}

export type UpdateTenantInput = {
    name?: string;
    ruc?: string;
    razonSocial?: string;
    nombreComercial?: string;
    direccion?: string;
    ubigeo?: string;
    departamento?: string;
    provincia?: string;
    distrito?: string;
    receiptFooter?: string;
    apisperuToken?: string;
    apisperuUrl?: string;
    igvRate?: number;
    defaultIgvRegime?: string;
    pricesIncludeIgv?: boolean;
    electronicInvoicingEnabled?: boolean;
    serieBoleta?: string;
    serieFactura?: string;
    serieNotaCredito?: string;
    serieNotaDebito?: string;
    lastBoletaNumber?: number;
    lastFacturaNumber?: number;
    lastNotaCredito?: number;
    lastNotaDebito?: number;
};

const SERIE_RE = /^[BF][A-Z0-9]{3}$/;

/** SUNAT-shape checks for what APISPeru will reject later; throws a user-facing message. */
export function validateTenantInput(input: UpdateTenantInput, current: Record<string, unknown>): void {
    const fail = (m: string) => { throw new Error(m); };
    if (input.ruc !== undefined && input.ruc !== "" && !/^(10|15|17|20)\d{9}$/.test(input.ruc)) fail("RUC inválido: 11 dígitos que empiecen con 10, 15, 17 o 20.");
    if (input.ubigeo !== undefined && input.ubigeo !== "" && !/^\d{6}$/.test(input.ubigeo)) fail("Ubigeo inválido: 6 dígitos.");
    if (input.igvRate !== undefined && !(input.igvRate >= 0 && input.igvRate <= 100)) fail("La tasa de IGV debe estar entre 0 y 100.");
    if (input.apisperuUrl !== undefined && input.apisperuUrl !== "") {
        let u: URL | null = null;
        try { u = new URL(input.apisperuUrl); } catch { /* handled below */ }
        // https only: the bearer token is sent to this URL.
        if (!u || u.protocol !== "https:") fail("La URL de APISPeru debe ser https válida.");
    }
    for (const f of ["serieBoleta", "serieFactura", "serieNotaCredito", "serieNotaDebito"] as const) {
        const v = input[f];
        if (v !== undefined && !SERIE_RE.test(v)) fail(`Serie inválida (${f}): 4 caracteres A-Z/0-9 que empiecen con B o F.`);
    }
    if (input.serieBoleta !== undefined && !input.serieBoleta.startsWith("B")) fail("La serie de boleta debe empezar con B.");
    if (input.serieFactura !== undefined && !input.serieFactura.startsWith("F")) fail("La serie de factura debe empezar con F.");
    for (const f of ["lastBoletaNumber", "lastFacturaNumber", "lastNotaCredito", "lastNotaDebito"] as const) {
        const v = input[f];
        if (v === undefined) continue;
        if (!Number.isInteger(v) || v < 0) fail(`${f} must be a non-negative integer.`);
        // Lowering a correlative would re-issue numbers SUNAT already has.
        if (v < Number(current[f] ?? 0)) fail(`El correlativo ${f} no puede bajar (actual ${current[f]}).`);
    }
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput, actor?: { id: string; name: string }) {
    const before = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!before) throw new Error("Tenant not found.");
    validateTenantInput(input, before);

    // Audit trail: only fields that really changed; the token is never stored, only that it changed.
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(input)) {
        const prev = (before as Record<string, unknown>)[k];
        const same = String(prev ?? "") === String(v ?? "") || (k === "receiptFooter" && !prev && !String(v).trim());
        if (same) continue;
        changes[k] = k === "apisperuToken" ? ["***", "***"] : [prev instanceof Object ? String(prev) : prev, v];
    }
    const [tenant] = await prisma.$transaction([
    prisma.tenant.update({
        where: { id: tenantId },
        data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.ruc !== undefined && { ruc: input.ruc }),
            ...(input.razonSocial !== undefined && { razonSocial: input.razonSocial }),
            ...(input.nombreComercial !== undefined && { nombreComercial: input.nombreComercial }),
            ...(input.direccion !== undefined && { direccion: input.direccion }),
            ...(input.ubigeo !== undefined && { ubigeo: input.ubigeo }),
            ...(input.departamento !== undefined && { departamento: input.departamento }),
            ...(input.provincia !== undefined && { provincia: input.provincia }),
            ...(input.distrito !== undefined && { distrito: input.distrito }),
            ...(input.receiptFooter !== undefined && { receiptFooter: input.receiptFooter.trim() || null }),
            ...(input.apisperuToken !== undefined && { apisperuToken: input.apisperuToken }),
            ...(input.apisperuUrl !== undefined && { apisperuUrl: input.apisperuUrl }),
            ...(input.igvRate !== undefined && { igvRate: input.igvRate }),
            ...(input.defaultIgvRegime !== undefined && { defaultIgvRegime: input.defaultIgvRegime }),
            ...(input.pricesIncludeIgv !== undefined && { pricesIncludeIgv: input.pricesIncludeIgv }),
            ...(input.electronicInvoicingEnabled !== undefined && { electronicInvoicingEnabled: input.electronicInvoicingEnabled }),
            ...(input.serieBoleta !== undefined && { serieBoleta: input.serieBoleta }),
            ...(input.serieFactura !== undefined && { serieFactura: input.serieFactura }),
            ...(input.serieNotaCredito !== undefined && { serieNotaCredito: input.serieNotaCredito }),
            ...(input.serieNotaDebito !== undefined && { serieNotaDebito: input.serieNotaDebito }),
            ...(input.lastBoletaNumber !== undefined && { lastBoletaNumber: input.lastBoletaNumber }),
            ...(input.lastFacturaNumber !== undefined && { lastFacturaNumber: input.lastFacturaNumber }),
            ...(input.lastNotaCredito !== undefined && { lastNotaCredito: input.lastNotaCredito }),
            ...(input.lastNotaDebito !== undefined && { lastNotaDebito: input.lastNotaDebito }),
        },
        select: {
            id: true,
            name: true,
            slug: true,
            ruc: true,
            razonSocial: true,
            nombreComercial: true,
            direccion: true,
            ubigeo: true,
            departamento: true,
            provincia: true,
            distrito: true,
            receiptFooter: true,
            apisperuToken: true,
            apisperuUrl: true,
            igvRate: true,
            defaultIgvRegime: true,
            pricesIncludeIgv: true,
            electronicInvoicingEnabled: true,
            serieBoleta: true,
            serieFactura: true,
            serieNotaCredito: true,
            serieNotaDebito: true,
            lastBoletaNumber: true,
            lastFacturaNumber: true,
            lastNotaCredito: true,
            lastNotaDebito: true,
        },
    }),
    ...(Object.keys(changes).length > 0
        ? [prisma.auditLog.create({
            data: { tenantId, action: "TENANT_SETTINGS_UPDATE", entity: "Tenant", actorId: actor?.id ?? null, actorName: actor?.name ?? null, changes: changes as object },
        })]
        : []),
    ]);

    // Same secret-hiding treatment as getTenantById.
    const { apisperuToken, ...rest } = tenant;
    return {
        ...rest,
        hasApisperuToken: Boolean(apisperuToken),
    };
}

export async function getDashboardStats(tenantId: string, date?: string) {
    const s = await getDaySummary(tenantId, date);
    const { start, end } = limaDayBounds(s.date);
    const activeWorkersToday = await prisma.attendance.count({
        where: { tenantId, checkIn: { gte: start, lt: end }, checkOut: null },
    });
    // The DaySummary is the payload; the extra field is the only non-cash KPI.
    return { ...s, activeWorkersToday };
}

/**
 * Sales of a Lima date range (inclusive YYYY-MM-DD bounds): the listing plus
 * totals from aggregateSales (same code as DaySummary). CANCELLED sales are
 * listed but only counted under `voided`.
 */
export async function getSalesReport(tenantId: string, from: string, to: string) {
    const { start } = limaDayBounds(from);
    const { end } = limaDayBounds(to);
    if (end <= start) throw new Error("'from' must be on or before 'to'.");
    if (end.getTime() - start.getTime() > 366 * 86_400_000) throw new Error("Range cannot exceed 366 days.");

    const sales = await prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: start, lt: end } },
        include: {
            worker: { select: { name: true } },
            items: { include: { product: { select: { name: true, sku: true } } } },
        },
        orderBy: { createdAt: "desc" },
        // shortcut: hard cap keeps the payload bounded; paginate if a range ever exceeds it.
        take: 5000,
    });

    const data = sales.map((sale) => ({
        ...sale,
        total: Number(sale.total),
        items: sale.items.map((item) => ({
            ...item,
            unitPrice: Number(item.unitPrice),
            product: item.product ?? {
                name: item.virtualLabel ?? "Venta libre",
                sku: item.virtualSku ?? "VARIOS",
            },
        })),
    }));
    const agg = aggregateSales(sales);
    // Flat legacy keys (count/amount/byMethod/cancelled*) mirror the same aggregate for older clients/tests.
    return {
        from, to,
        summary: {
            ...agg,
            count: agg.sales.count, amount: agg.sales.total, byMethod: agg.sales.byMethod,
            cancelledCount: agg.voided.count, cancelledAmount: agg.voided.total,
            truncated: sales.length === 5000,
        },
        data,
    };
}
