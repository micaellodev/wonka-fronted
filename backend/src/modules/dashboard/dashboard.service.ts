import { prisma } from "../../lib/prisma.ts";
import { getTodayCashClose, getTodayOpening, limaDayBounds, limaYmd } from "../cash/cash.service.ts";

// ============================================================
//  Dashboard Service — KPIs for the admin dashboard
// ============================================================

export interface DashboardStats {
    salesToday: {
        count: number;
        amount: number;
    };
    lowStockProducts: number;
    pendingVoidRequests: number;
    cashCloseStatus: "OPEN" | "PENDING_APPROVAL" | "APPROVED" | "NOT_OPENED";
    activeWorkersToday: number;
}

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

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
    const { start: startOfDay, end: endOfDay } = limaDayBounds(limaYmd());

    const [salesToday, lowStockProducts, pendingVoidRequests, todayClose, opening, activeWorkersToday] =
        await Promise.all([
            // Sales today (ACTIVE and PENDING_SUNAT, exclude CANCELLED)
            prisma.sale.aggregate({
                where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay }, status: { not: "CANCELLED" } },
                _count: { id: true },
                _sum: { total: true },
            }),
            // Low stock products (<= 5 units and trackStock = true)
            prisma.product.count({
                where: { tenantId, isActive: true, trackStock: true, stock: { lte: 5 } },
            }),
            prisma.voidRequest.count({ where: { tenantId, status: "PENDING" } }),
            getTodayCashClose(tenantId),
            getTodayOpening(tenantId),
            // Active workers today (checked in, not checked out)
            prisma.attendance.count({
                where: { tenantId, checkIn: { gte: startOfDay, lt: endOfDay }, checkOut: null },
            }),
        ]);

    const cashCloseStatus: DashboardStats["cashCloseStatus"] = todayClose
        ? todayClose.status === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL"
        : opening ? "OPEN" : "NOT_OPENED";

    return {
        salesToday: {
            count: salesToday._count.id,
            amount: Number(salesToday._sum.total ?? 0),
        },
        lowStockProducts,
        pendingVoidRequests,
        cashCloseStatus,
        activeWorkersToday,
    };
}

/**
 * Sales of a Lima date range (inclusive YYYY-MM-DD bounds) with totals computed
 * from the DB. CANCELLED sales are listed but excluded from every amount.
 * Each SaleItem is one line: play-zone charges (virtualSku `pz-*`) are counted
 * once via their line, and the sale total already includes them exactly once.
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

    const byMethod: Record<string, number> = { efectivo: 0, yape: 0, tarjeta: 0 };
    let amount = 0;
    let count = 0;
    let cancelledCount = 0;
    let cancelledAmount = 0;
    let playzoneAmount = 0;
    let playzoneLines = 0;

    const data = sales.map((sale) => {
        const total = Number(sale.total);
        if (sale.status === "CANCELLED") {
            cancelledCount++;
            cancelledAmount += total;
        } else {
            count++;
            amount += total;
            const m = (sale.paymentMethod || "").toLowerCase();
            byMethod[m] = (byMethod[m] ?? 0) + total;
            for (const item of sale.items) {
                if (item.virtualSku?.startsWith("pz-")) {
                    playzoneLines++;
                    playzoneAmount += Number(item.unitPrice) * item.qty;
                }
            }
        }
        return {
            ...sale,
            total,
            items: sale.items.map((item) => ({
                ...item,
                unitPrice: Number(item.unitPrice),
                product: item.product ?? {
                    name: item.virtualLabel ?? "Venta libre",
                    sku: item.virtualSku ?? "VARIOS",
                },
            })),
        };
    });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
        from,
        to,
        summary: {
            count,
            amount: r2(amount),
            byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, r2(v)])),
            cancelledCount,
            cancelledAmount: r2(cancelledAmount),
            playzone: { lines: playzoneLines, amount: r2(playzoneAmount) },
            truncated: sales.length === 5000,
        },
        data,
    };
}
