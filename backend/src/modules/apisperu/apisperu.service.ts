import type { Tenant } from "@prisma/client";
import type {
    ApisPeruClient,
    ApisPeruCompany,
    ApisPeruCreditNotePayload,
    ApisPeruInvoiceItem,
    ApisPeruInvoicePayload,
    FiscalLine,
    FiscalSummary,
    SaleContext,
} from "./apisperu.types.ts";

// ============================================================
//  APISPeru Service — Fiscal calculations + HTTP integration
// ============================================================

export type IgvRegime = "GRAVADO" | "EXONERADO" | "INAFECTO" | "ICBPER" | "GRAVADO_10_5";

export function resolveIgvRegime(productRegime: string | null | undefined, tenantDefault: string): IgvRegime {
    const regime = productRegime ?? tenantDefault;
    const normalized = regime.toUpperCase();
    if (normalized === "GRAVADO") return "GRAVADO";
    if (normalized === "INAFECTO") return "INAFECTO";
    if (normalized === "ICBPER") return "ICBPER";
    if (normalized === "GRAVADO_10_5") return "GRAVADO_10_5";
    return "EXONERADO";
}

export function getTipAfeIGV(regime: IgvRegime): ApisPeruInvoiceItem["tipAfeIGV"] {
    switch (regime) {
        case "GRAVADO":
        case "GRAVADO_10_5":
            return "10";
        case "EXONERADO":
            return "20";
        case "INAFECTO":
            return "30";
        case "ICBPER":
            return "10";
    }
}

export function formatCorrelative(num: number): string {
    return String(num).padStart(8, "0");
}

export function formatSunatDate(date: Date): string {
    // Peru timezone: UTC-5
    const offsetDate = new Date(date.getTime() - 5 * 60 * 60 * 1000);
    return offsetDate.toISOString().slice(0, 19) + "-05:00";
}

export function calculateFiscalLine(
    unitPrice: number,
    qty: number,
    regime: IgvRegime,
    igvRate: number,
    pricesIncludeIgv: boolean
): FiscalLine {
    if (regime === "EXONERADO" || regime === "INAFECTO") {
        const mtoValorVenta = unitPrice * qty;
        return {
            qty,
            unitPrice,
            mtoValorUnitario: unitPrice,
            mtoPrecioUnitario: unitPrice,
            mtoValorVenta,
            mtoIGV: 0,
            mtoImpItem: mtoValorVenta,
            tipAfeIGV: getTipAfeIGV(regime),
            igvRate: 0,
            regime,
        };
    }

    const rate = regime === "GRAVADO_10_5" ? 10.5 / 100 : (regime === "ICBPER" ? igvRate / 100 : igvRate / 100);

    let mtoValorUnitario: number;
    let mtoPrecioUnitario: number;

    if (pricesIncludeIgv) {
        mtoValorUnitario = unitPrice / (1 + rate);
        mtoPrecioUnitario = unitPrice;
    } else {
        mtoValorUnitario = unitPrice;
        mtoPrecioUnitario = unitPrice * (1 + rate);
    }

    const mtoValorVenta = mtoValorUnitario * qty;
    const mtoIGV = mtoValorVenta * rate;
    const mtoImpItem = mtoValorVenta + mtoIGV;

    return {
        qty,
        unitPrice,
        mtoValorUnitario: Number(mtoValorUnitario.toFixed(4)),
        mtoPrecioUnitario: Number(mtoPrecioUnitario.toFixed(4)),
        mtoValorVenta: Number(mtoValorVenta.toFixed(2)),
        mtoIGV: Number(mtoIGV.toFixed(2)),
        mtoImpItem: Number(mtoImpItem.toFixed(2)),
        tipAfeIGV: getTipAfeIGV(regime),
        igvRate: regime === "GRAVADO_10_5" ? 10.5 : igvRate,
        regime,
    };
}

export function buildFiscalSummary(saleContext: SaleContext): FiscalSummary {
    const { tenant, sale } = saleContext;
    const igvRate = Number(tenant.igvRate);
    const pricesIncludeIgv = tenant.pricesIncludeIgv;

    const lines: FiscalLine[] = sale.items.map((item) => {
        // Virtual line items (playzone time, "venta libre") have no Product row —
        // they use the tenant default regime (contract with pos-zona).
        const regime = resolveIgvRegime(item.product?.igvRegime, tenant.defaultIgvRegime);
        return calculateFiscalLine(
            Number(item.unitPrice),
            item.qty,
            regime,
            igvRate,
            pricesIncludeIgv
        );
    });

    const mtoOperGravadas = lines
        .filter((l) => l.regime === "GRAVADO" || l.regime === "GRAVADO_10_5" || l.regime === "ICBPER")
        .reduce((sum, l) => sum + l.mtoValorVenta, 0);
    const mtoOperExoneradas = lines
        .filter((l) => l.regime === "EXONERADO")
        .reduce((sum, l) => sum + l.mtoValorVenta, 0);
    const mtoOperInafectas = lines
        .filter((l) => l.regime === "INAFECTO")
        .reduce((sum, l) => sum + l.mtoValorVenta, 0);
    const mtoIGV = lines.reduce((sum, l) => sum + l.mtoIGV, 0);
    const totalImpuestos = mtoIGV;
    const valorVenta = lines.reduce((sum, l) => sum + l.mtoValorVenta, 0);
    const subTotal = valorVenta + totalImpuestos;
    const mtoImpVenta = subTotal;

    return {
        mtoOperGravadas: Number(mtoOperGravadas.toFixed(2)),
        mtoOperExoneradas: Number(mtoOperExoneradas.toFixed(2)),
        mtoOperInafectas: Number(mtoOperInafectas.toFixed(2)),
        mtoIGV: Number(mtoIGV.toFixed(2)),
        totalImpuestos: Number(totalImpuestos.toFixed(2)),
        valorVenta: Number(valorVenta.toFixed(2)),
        subTotal: Number(subTotal.toFixed(2)),
        mtoImpVenta: Number(mtoImpVenta.toFixed(2)),
        lines,
    };
}

function buildClient(sale: SaleContext["sale"]): ApisPeruClient {
    const docType = sale.clientDocType ?? "-";
    const docNumber = sale.clientDocNumber ?? "0";
    const name = sale.clientName?.trim() || "CLIENTE VARIOS";

    return {
        tipoDoc: docType as ApisPeruClient["tipoDoc"],
        numDoc: docNumber,
        rznSocial: name,
    };
}

function buildCompany(tenant: SaleContext["tenant"]): ApisPeruCompany {
    return {
        ruc: tenant.ruc ?? "",
        razonSocial: tenant.razonSocial ?? "",
        nombreComercial: tenant.nombreComercial ?? tenant.razonSocial ?? "",
        address: {
            ubigeo: tenant.ubigeo ?? "150101",
            direccion: tenant.direccion ?? "",
        },
    };
}

function buildDetails(summary: FiscalSummary, sale: SaleContext["sale"]): ApisPeruInvoiceItem[] {
    return sale.items.map((item, index) => {
        const line = summary.lines[index] ?? calculateFiscalLine(
            Number(item.unitPrice),
            item.qty,
            "EXONERADO",
            0,
            false
        );
        return {
            codProducto: (item.product?.sku ?? item.virtualSku ?? "VARIOS").slice(0, 30), // UBL max length
            unidad: "NIU",
            descripcion: item.product?.name ?? item.virtualLabel ?? "Venta libre",
            cantidad: line.qty,
            mtoValorUnitario: line.mtoValorUnitario,
            mtoPrecioUnitario: line.mtoPrecioUnitario,
            mtoValorVenta: line.mtoValorVenta,
            mtoIGV: line.mtoIGV,
            tipAfeIGV: line.tipAfeIGV,
            porcentajeIGV: line.mtoIGV > 0 ? line.igvRate : 0,
        };
    });
}

export function buildInvoicePayload(saleContext: SaleContext): ApisPeruInvoicePayload {
    const { tenant, sale } = saleContext;
    const summary = buildFiscalSummary(saleContext);

    const documentTypeMap: Record<string, ApisPeruInvoicePayload["tipoDoc"]> = {
        BOLETA: "03",
        FACTURA: "01",
    };

    const tipoDoc = documentTypeMap[sale.tipoComprobante] ?? "03";

    return {
        tipoOperacion: "0101",
        tipoDoc,
        serie: sale.serie ?? "",
        correlativo: sale.correlativo ?? "",
        fechaEmision: formatSunatDate(sale.createdAt),
        tipoMoneda: "PEN",
        client: buildClient(sale),
        company: buildCompany(tenant),
        details: buildDetails(summary, sale),
        mtoOperGravadas: summary.mtoOperGravadas,
        mtoOperExoneradas: summary.mtoOperExoneradas,
        mtoOperInafectas: summary.mtoOperInafectas,
        mtoIGV: summary.mtoIGV,
        totalImpuestos: summary.totalImpuestos,
        valorVenta: summary.valorVenta,
        subTotal: summary.subTotal,
        mtoImpVenta: summary.mtoImpVenta,
        ublVersion: "2.1",
        formaPago: {
            moneda: "PEN",
            tipo: "Contado",
        },
    };
}

export function buildCreditNotePayload(
    saleContext: SaleContext,
    reason: string
): ApisPeruCreditNotePayload {
    const { tenant, sale } = saleContext;
    const summary = buildFiscalSummary(saleContext);

    const documentTypeMap: Record<string, "03" | "01"> = {
        BOLETA: "03",
        FACTURA: "01",
    };

    const tipDocAfectado = documentTypeMap[sale.tipoComprobante] ?? "03";

    return {
        tipoOperacion: "0101",
        tipoDoc: "07",
        serie: sale.creditNoteSerie ?? "",
        correlativo: sale.creditNoteCorrelativo ?? "",
        fechaEmision: formatSunatDate(new Date()),
        tipoMoneda: "PEN",
        tipDocAfectado,
        numDocfectado: `${sale.serie}-${sale.correlativo}`,
        codMotivo: "01",
        desMotivo: reason || "Anulación de la operación",
        client: buildClient(sale),
        company: buildCompany(tenant),
        details: buildDetails(summary, sale),
        mtoOperGravadas: summary.mtoOperGravadas,
        mtoOperExoneradas: summary.mtoOperExoneradas,
        mtoOperInafectas: summary.mtoOperInafectas,
        mtoIGV: summary.mtoIGV,
        totalImpuestos: summary.totalImpuestos,
        valorVenta: summary.valorVenta,
        subTotal: summary.subTotal,
        mtoImpVenta: summary.mtoImpVenta,
        ublVersion: "2.1",
    };
}

/** Single-line note payload for manual credit/debit notes (amount only, no item detail). */
export function buildManualNotePayload(
    tenant: Tenant,
    note: {
        type: "CREDIT_NOTE" | "DEBIT_NOTE";
        serie: string;
        correlative: string;
        modifiedDocumentSerie: string;
        modifiedDocumentCorrelative: string;
        reasonCode: string;
        reasonDescription: string;
        clientDocType: string;
        clientDocNumber: string;
        clientName: string;
        totalAmount: number;
        createdAt: Date;
    }
): ApisPeruCreditNotePayload {
    const regime = resolveIgvRegime(null, tenant.defaultIgvRegime);
    // The note amount is what the customer pays/gets back, i.e. IGV included.
    const line = calculateFiscalLine(note.totalAmount, 1, regime, Number(tenant.igvRate), true);
    const gravada = line.regime === "GRAVADO" || line.regime === "GRAVADO_10_5" || line.regime === "ICBPER";
    return {
        tipoOperacion: "0101",
        tipoDoc: note.type === "CREDIT_NOTE" ? "07" : "08",
        serie: note.serie,
        correlativo: note.correlative,
        fechaEmision: formatSunatDate(note.createdAt),
        tipoMoneda: "PEN",
        tipDocAfectado: note.modifiedDocumentSerie.startsWith("F") ? "01" : "03",
        numDocfectado: `${note.modifiedDocumentSerie}-${note.modifiedDocumentCorrelative}`,
        codMotivo: note.reasonCode,
        desMotivo: note.reasonDescription,
        client: {
            tipoDoc: note.clientDocType as ApisPeruClient["tipoDoc"],
            numDoc: note.clientDocNumber,
            rznSocial: note.clientName,
        },
        company: buildCompany(tenant),
        details: [{
            codProducto: "NOTA",
            unidad: "ZZ",
            descripcion: note.reasonDescription,
            cantidad: 1,
            mtoValorUnitario: line.mtoValorUnitario,
            mtoPrecioUnitario: line.mtoPrecioUnitario,
            mtoValorVenta: line.mtoValorVenta,
            mtoIGV: line.mtoIGV,
            tipAfeIGV: line.tipAfeIGV,
            porcentajeIGV: gravada ? line.igvRate : 0,
        }],
        mtoOperGravadas: gravada ? line.mtoValorVenta : 0,
        mtoOperExoneradas: line.regime === "EXONERADO" ? line.mtoValorVenta : 0,
        mtoOperInafectas: line.regime === "INAFECTO" ? line.mtoValorVenta : 0,
        mtoIGV: line.mtoIGV,
        totalImpuestos: line.mtoIGV,
        valorVenta: line.mtoValorVenta,
        subTotal: line.mtoImpItem,
        mtoImpVenta: line.mtoImpItem,
        ublVersion: "2.1",
    };
}

const DEFAULT_APISPERU_URL = "https://facturacion.apisperu.com/api/v1";

/** Outcome of a document SUNAT actually processed. Transport/service failures throw instead. */
export interface EmissionResult {
    sunatStatus: "ACEPTADA" | "RECHAZADA";
    description: string;
    xml: string | null;
    cdr: string | null;
    raw: Record<string, unknown>;
}

export function resolveApisPeruUrl(tenant: Pick<Tenant, "apisperuUrl">): string {
    // Deployment-level override wins so test/dev can never hit the real service
    // through a tenant row that still points at production.
    const url = process.env["APISPERU_URL"] || tenant.apisperuUrl || DEFAULT_APISPERU_URL;
    if (process.env["NODE_ENV"] === "test" && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) {
        throw new Error("NODE_ENV=test: APISPeru URL must be a local mock.");
    }
    return url;
}

/**
 * Maps an APISPeru `/invoice/send` | `/note/send` body to a SUNAT outcome.
 * SUNAT codes: 0 / 4000+ accepted (with observations), 2000–3999 rejected,
 * 1033 = already registered (an earlier send that timed out did reach SUNAT),
 * anything else (0100–1999 exceptions) = not processed → caller keeps it pending.
 */
export function interpretSendResponse(body: Record<string, any>): EmissionResult {
    const sr = body?.["sunatResponse"];
    if (!sr || typeof sr !== "object") {
        throw new Error(body?.["message"] || "APISPeru: respuesta sin sunatResponse.");
    }
    const code = Number(sr.success ? sr.cdrResponse?.code ?? 0 : sr.error?.code);
    const description = String(sr.success ? sr.cdrResponse?.description ?? "" : sr.error?.message ?? "");
    // xml/cdr go to their own columns; keep the stored JSON small.
    const raw = { hash: body["hash"] ?? null, success: Boolean(sr.success), error: sr.error ?? null, cdrResponse: sr.cdrResponse ?? null };
    const base = { description, xml: body["xml"] ?? null, cdr: sr.cdrZip ?? null, raw };
    if (sr.success && !(code >= 2000 && code < 4000)) return { sunatStatus: "ACEPTADA", ...base };
    if (code === 1033) return { sunatStatus: "ACEPTADA", ...base };
    if (code >= 2000 && code < 4000) return { sunatStatus: "RECHAZADA", ...base };
    throw new Error(`SUNAT no procesó el comprobante (${code || "?"}): ${description || "sin detalle"}`);
}

async function sendDocument(
    tenant: Tenant,
    endpoint: "invoice/send" | "note/send",
    payload: unknown
): Promise<EmissionResult> {
    if (!tenant.apisperuToken) {
        throw new Error("APISPeru token not configured for this tenant.");
    }
    if (!tenant.ruc || !tenant.razonSocial) {
        throw new Error("Company fiscal data not configured.");
    }
    const url = `${resolveApisPeruUrl(tenant).replace(/\/$/, "")}/${endpoint}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${tenant.apisperuToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Number(process.env["APISPERU_TIMEOUT_MS"] ?? 15000)),
    });
    const body = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok || !body) {
        throw new Error(`APISPeru HTTP ${response.status}: ${body?.["message"] ?? response.statusText}`);
    }
    return interpretSendResponse(body);
}

export function emitInvoice(saleContext: SaleContext): Promise<EmissionResult> {
    return sendDocument(saleContext.tenant, "invoice/send", buildInvoicePayload(saleContext));
}

export function emitNote(tenant: Tenant, payload: ApisPeruCreditNotePayload): Promise<EmissionResult> {
    return sendDocument(tenant, "note/send", payload);
}
export interface DniQueryResult {
    numero: string;
    nombre_completo: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string;
    nombre: string;
    codigo_verificacion?: number | undefined;
}

export interface RucQueryResult {
    ruc: string;
    razonSocial: string;
    nombreComercial?: string | undefined;
    direccion?: string | undefined;
    departamento?: string | undefined;
    provincia?: string | undefined;
    distrito?: string | undefined;
    ubigeo?: string | undefined;
    estado?: string | undefined;
    condicion?: string | undefined;
}

export async function consultaDNI(dni: string, token: string, baseUrl?: string): Promise<DniQueryResult> {
    // According to https://docs.apiperu.dev/referencia/consultar-dni/
    // Endpoint: POST https://api.apiperu.dev/dni
    // Headers: Accept: application/json, Content-Type: application/json, Authorization: Bearer <token>
    // Body: { "dni": "44556677" }
    const cleanBaseUrl = baseUrl && !baseUrl.includes("facturacion.apisperu.com")
        ? baseUrl.replace(/\/$/, "")
        : "https://api.apiperu.dev";
    const url = cleanBaseUrl.endsWith("/dni") ? cleanBaseUrl : `${cleanBaseUrl}/dni`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ dni: dni.trim() }),
        signal: AbortSignal.timeout(Number(process.env["APISPERU_TIMEOUT_MS"] ?? 15000)),
    });

    const resJson = (await response.json().catch(() => null)) as {
        success?: boolean;
        code?: string;
        message?: string;
        data?: {
            numero?: string;
            nombre_completo?: string;
            nombres?: string;
            apellido_paterno?: string;
            apellido_materno?: string;
            codigo_verificacion?: number;
            [key: string]: unknown;
        };
    } | null;

    if (!response.ok || !resJson || resJson.success === false) {
        const errorMsg = resJson?.message || `No se pudo consultar el DNI ${dni} (${response.statusText || response.status})`;
        throw new Error(errorMsg);
    }

    const d = resJson.data || {};
    // RENIEC puede devolver "APELLIDOS, NOMBRES": se quita la coma
    const nombreCompleto = (d.nombre_completo || [d.nombres, d.apellido_paterno, d.apellido_materno].filter(Boolean).join(" ")).replace(/,/g, "").replace(/ {2,}/g, " ").trim();

    return {
        numero: d.numero || dni,
        nombre_completo: nombreCompleto || "",
        nombres: d.nombres || "",
        apellido_paterno: d.apellido_paterno || "",
        apellido_materno: d.apellido_materno || "",
        nombre: nombreCompleto || d.nombres || "",
        codigo_verificacion: d.codigo_verificacion,
    };
}

export async function consultaRUC(ruc: string, token: string, baseUrl?: string): Promise<RucQueryResult> {
    // According to https://docs.apiperu.dev/referencia/consultar-ruc/
    const cleanBaseUrl = baseUrl && !baseUrl.includes("facturacion.apisperu.com")
        ? baseUrl.replace(/\/$/, "")
        : "https://api.apiperu.dev";
    const url = cleanBaseUrl.endsWith("/ruc") ? cleanBaseUrl : `${cleanBaseUrl}/ruc`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ ruc: ruc.trim() }),
        signal: AbortSignal.timeout(Number(process.env["APISPERU_TIMEOUT_MS"] ?? 15000)),
    });

    const resJson = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        data?: {
            ruc?: string;
            nombre_o_razon_social?: string;
            razon_social?: string;
            nombre_comercial?: string;
            direccion_completa?: string;
            direccion?: string;
            ubigeo?: string;
            estado?: string;
            condicion?: string;
            [key: string]: unknown;
        };
    } | null;

    if (!response.ok || !resJson || resJson.success === false) {
        const errorMsg = resJson?.message || `No se pudo consultar el RUC ${ruc} (${response.statusText || response.status})`;
        throw new Error(errorMsg);
    }

    const d = resJson.data || {};

    // Parse ubigeo: API returns either string "150101" or array ["15","1501","150101"]
    const rawUbigeo = (d as Record<string, unknown>).ubigeo;
    let ubigeoStr = "";
    if (typeof rawUbigeo === "string") {
        ubigeoStr = rawUbigeo;
    } else if (Array.isArray(rawUbigeo) && rawUbigeo.length > 0) {
        ubigeoStr = String(rawUbigeo[rawUbigeo.length - 1]);
    } else if (typeof (d as Record<string, unknown>).ubigeo_sunat === "string") {
        ubigeoStr = String((d as Record<string, unknown>).ubigeo_sunat);
    }

    const result: RucQueryResult = {
        ruc: String(d.ruc || ruc),
        razonSocial: String(d.nombre_o_razon_social || d.razon_social || ""),
        nombreComercial: String(d.nombre_comercial || ""),
        direccion: String(d.direccion_completa || d.direccion || ""),
        departamento: String(d.departamento || ""),
        provincia: String(d.provincia || ""),
        distrito: String(d.distrito || ""),
        ubigeo: ubigeoStr,
        estado: String(d.estado || ""),
        condicion: String(d.condicion || ""),
    };

    return result;
}
