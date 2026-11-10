import type { Sale, SaleItem, Product, Tenant } from "@prisma/client";

// ============================================================
//  APISPeru Types — UBL 2.1 JSON payloads
// ============================================================

export type DocumentType = "03" | "01" | "07" | "08"; // Boleta, Factura, NotaCredito, NotaDebito

export interface ApisPeruClient {
    tipoDoc: "1" | "6" | "-"; // 1=DNI, 6=RUC, -=Sin documento
    numDoc: string;
    rznSocial: string;
}

export interface ApisPeruCompany {
    ruc: string;
    razonSocial: string;
    nombreComercial: string;
    address: {
        ubigueo: string; // sic: APISPeru spells it this way
        direccion: string;
        provincia?: string;
        departamento?: string;
        distrito?: string;
        urbanizacion?: string;
    };
}

export interface ApisPeruInvoiceItem {
    codProducto: string;
    unidad: string; // "NIU" para unidades, "KGM" para kilos
    descripcion: string;
    cantidad: number;
    mtoValorUnitario: number; // Precio sin IGV
    mtoPrecioUnitario: number; // Precio con IGV (igual si exonerado)
    mtoValorVenta: number; // cantidad * valorUnitario
    mtoBaseIgv: number;
    igv: number;
    totalImpuestos: number;
    tipAfeIgv: "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "20" | "21" | "30" | "31" | "32" | "33" | "34" | "35" | "36";
    porcentajeIgv?: number;
    /** Descuento de línea que afecta la base imponible (codTipo 00). */
    descuentos?: { codTipo: "00"; montoBase: number; factor: number; monto: number }[];
}

export interface ApisPeruInvoicePayload {
    tipoOperacion: "0101";
    tipoDoc: DocumentType;
    serie: string;
    correlativo: string;
    fechaEmision: string;
    tipoMoneda: "PEN";
    client: ApisPeruClient;
    company: ApisPeruCompany;
    details: ApisPeruInvoiceItem[];
    mtoOperGravadas: number;
    mtoOperExoneradas: number;
    mtoOperInafectas: number;
    mtoOperExportacion?: number;
    mtoOperGratuitas?: number;
    mtoIGV: number;
    mtoIGVGratuitas?: number;
    totalImpuestos: number;
    valorVenta: number;
    subTotal: number;
    mtoImpVenta: number;
    ublVersion?: string;
    legends: { code: string; value: string }[];
    formaPago?: {
        moneda: "PEN";
        tipo: "Contado" | "Credito";
    };
}

export interface ApisPeruCreditNotePayload {
    tipoOperacion: "0101";
    tipoDoc: "07" | "08"; // Nota de Crédito / Débito
    serie: string;
    correlativo: string;
    fechaEmision: string;
    tipoMoneda: "PEN";
    tipDocAfectado: "03" | "01"; // Boleta o Factura
    numDocfectado: string; // Serie-Correlativo original
    codMotivo: string; // "01"=Anulación, "02"=Devolución, etc.
    desMotivo: string;
    client: ApisPeruClient;
    company: ApisPeruCompany;
    details: ApisPeruInvoiceItem[];
    mtoOperGravadas: number;
    mtoOperExoneradas: number;
    mtoOperInafectas: number;
    mtoIGV: number;
    totalImpuestos: number;
    valorVenta: number;
    subTotal: number;
    mtoImpVenta: number;
    ublVersion?: string;
    legends: { code: string; value: string }[];
}

// Internal type used to pass sale context to APISPeru helpers
export interface SaleContext {
    tenant: Tenant;
    sale: Sale & { items: (SaleItem & { product: Product | null })[] };
}

// Fiscal line calculation result
export interface FiscalLine {
    qty: number;
    unitPrice: number; // Stored unit price from product
    mtoValorUnitario: number; // Without IGV
    mtoPrecioUnitario: number; // With IGV
    mtoValorVenta: number;
    mtoIGV: number;
    mtoImpItem: number; // Total line amount
    mtoDescuento: number; // Descuento de la línea sin IGV (0 = sin descuento)
    mtoBaseDescuento: number; // Valor de venta de la línea antes del descuento
    tipAfeIGV: ApisPeruInvoiceItem["tipAfeIgv"];
    igvRate: number;
    regime: "GRAVADO" | "EXONERADO" | "INAFECTO" | "ICBPER" | "GRAVADO_10_5";
}

export interface FiscalSummary {
    mtoOperGravadas: number;
    mtoOperExoneradas: number;
    mtoOperInafectas: number;
    mtoIGV: number;
    totalImpuestos: number;
    valorVenta: number;
    subTotal: number;
    mtoImpVenta: number;
    lines: FiscalLine[];
}
