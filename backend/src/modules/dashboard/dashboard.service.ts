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

function assertNonNegativeInteger(value: number | undefined, fieldName: string): void {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative integer.`);
    }
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput) {
    assertNonNegativeInteger(input.lastBoletaNumber, "lastBoletaNumber");
    assertNonNegativeInteger(input.lastFacturaNumber, "lastFacturaNumber");
    assertNonNegativeInteger(input.lastNotaCredito, "lastNotaCredito");
    assertNonNegativeInteger(input.lastNotaDebito, "lastNotaDebito");

    const tenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.ruc !== undefined && { ruc: input.ruc }),
            ...(input.razonSocial !== undefined && { razonSocial: input.razonSocial }),
            ...(input.nombreComercial !== undefined && { nombreComercial: input.nombreComercial }),
            ...(input.direccion !== undefined && { direccion: input.direccion }),
            ...(input.ubigeo !== undefined && { ubigeo: input.ubigeo }),
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
