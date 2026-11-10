import type { PlayzoneChargeLine } from '@/store/playzoneTicketStore'
import { RECEIPT_LOGO } from '../receipt-logo'
// Incrustado: el comprobante se imprime desde un documento data: y una ruta relativa no carga (salía imagen rota)
import qrcode from 'qrcode-generator'
import { printHtml } from '@/lib/print'
import { toLima } from '@/lib/format'
import { numberToWords, type CheckoutLine, type PaymentMethod, type SaleResultItem, type TenantFiscalConfig } from './fiscal'

const RETURN_POLICY = 'No se aceptan reembolsos ni devoluciones de productos, solo aquellos con una probable falla de fábrica. Se realizan cambios con su comprobante de pago.'
const DEFAULT_RECEIPT_FOOTER = '¡Aquí creamos sonrisas! Recuerda que la supervisión y responsabilidad ante cualquier accidente es exclusivamente de los papis.'

export function escapeHtml(v: string): string {
 return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Todo lo que necesita la maqueta del comprobante: es la misma para ticket, boleta y factura, al cobrar y al reimprimir. */
export interface ReceiptInput {
 tipo: string
 serie: string | null
 correlativo: string | null
 /** Si no hay serie/correlativo (ticket): se muestra TICKET-<ticketId> */
 ticketId: string
 date: Date
 cashier: string
 clientName: string
 method: PaymentMethod
 total: number
 config: TenantFiscalConfig
 items: SaleResultItem[]
 sumExonerado: number
 sumGravado: number
 sumIgv: number
 /** Para el QR de SUNAT: DNI (8) / RUC (11); vacío = sin documento */
 clientDocNumber?: string | null
 /** Dirección del cliente (factura): dirección, distrito, provincia y departamento en una línea */
 clientAddress?: string | null
 /** Efectivo entregado (pago en efectivo); sin dato = pagó exacto */
 amountPaid?: number | null
}

/** Builds the 80mm receipt from tenant settings (name/RUC/address) and prints it (direct to the configured printer in the desktop app). */
export function printReceipt(p: {
 saleData: { tipoComprobante: string; serie: string | null; correlativo: string | null }
 saleItems: SaleResultItem[]
 clientNameStr: string
 method: PaymentMethod
 total: number
 config: TenantFiscalConfig
 lines: CheckoutLine[]
 summary: { mtoIGV: number }
 playzoneCharges: PlayzoneChargeLine[]
 activeWorker: { name: string } | null
 clientDocNumber?: string | null
 clientAddress?: string | null
 amountPaid?: number | null
 /** Descuento de combos aplicado a líneas de tiempo (los productos ya vienen en `lines`) */
 comboTimeDiscount?: number
}) {
 const { saleData, saleItems, clientNameStr, method, total, config, lines, summary, playzoneCharges, activeWorker } = p
  // Playzone lines are always EXONERADO (same as backend)
  const sumExonerado = lines.filter(l => l.regime === 'EXONERADO' || l.regime === 'INAFECTO').reduce((s, l) => s + l.mtoImpItem, 0)
   + playzoneCharges.reduce((s, c) => s + c.total, 0) - (p.comboTimeDiscount ?? 0)
  const sumGravado = lines.filter(l => l.regime === 'GRAVADO' || l.regime === 'GRAVADO_10_5').reduce((s, l) => s + l.mtoValorVenta, 0)
  const sumIgv = summary.mtoIGV
  void printHtml(renderReceipt({
   tipo: saleData.tipoComprobante, serie: saleData.serie, correlativo: saleData.correlativo, ticketId: Date.now().toString().slice(-8),
   date: new Date(), cashier: activeWorker?.name || 'Cajero', clientName: clientNameStr, method, total, config, items: saleItems,
   sumExonerado, sumGravado, sumIgv, clientDocNumber: p.clientDocNumber, clientAddress: p.clientAddress, amountPaid: p.amountPaid,
  }))
}

/** QR de SUNAT: RUC|tipo|serie|correlativo|IGV|total|fecha|tipo doc cliente|nº doc cliente| */
function sunatQrSvg(i: ReceiptInput, tipo: string): string | null {
  if (!i.serie || !i.correlativo || !i.config.ruc || (tipo !== 'BOLETA' && tipo !== 'FACTURA')) return null
  const doc = (i.clientDocNumber || '').trim()
  const docType = doc.length === 11 ? '6' : doc.length === 8 ? '1' : '-'
  const d = toLima(i.date)
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const text = [i.config.ruc, tipo === 'FACTURA' ? '01' : '03', i.serie, i.correlativo.replace(/^0+(?=\d)/, ''), i.sumIgv.toFixed(2), i.total.toFixed(2), date, docType, doc || '-'].join('|') + '|'
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  // SVG incrustado (no <img>): una imagen SVG carga async y salía vacía si se imprimía antes de cargar. Margen = zona silenciosa.
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }).replace('<svg ', '<svg width="120" height="120" shape-rendering="crispEdges" ')
}

/** Comprobante como HTML de 80 mm (sin imprimirlo). */
export function renderReceipt(i: ReceiptInput): string {
  const { serie, correlativo: corr, clientName: clientNameStr, method, total, config, items: saleItems, sumExonerado, sumGravado, sumIgv } = i
  const tipo = (i.tipo || 'TICKET').toUpperCase()
  const tipoLabel = tipo === 'BOLETA' ? 'BOLETA DE VENTA ELECTRONICA' : tipo === 'FACTURA' ? 'FACTURA DE VENTA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA'
  const correlativo = serie && corr ? `${serie}-${corr}` : `TICKET-${i.ticketId}`
  const now = toLima(i.date)
  const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  const timeStr = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`

  const businessRazonSocial = config.razonSocial || config.name || ''
  const businessDireccion = config.direccion || ''
  // Distrito - Provincia - Departamento, como pide la representación impresa
  const businessUbicacion = [config.distrito, config.provincia, config.departamento].filter(Boolean).join(' - ')
  const businessRuc = config.ruc || ''
  const businessNombreComercial = config.nombreComercial || ''

  const productsHtml = saleItems.map((item) => `
   <tr>
    <td colspan="2">${escapeHtml(item.productName)}</td>
   </tr>
   <tr>
    <td class="text-left" style="padding-bottom: 6px;">${item.qty} Un x ${Number(item.unitPrice).toFixed(2)}</td>
    <td class="text-right" style="padding-bottom: 6px;">S/${Number(item.lineTotal).toFixed(2)}</td>
   </tr>${Number(item.discount) > 0 ? `
   <tr><td class="text-left" style="padding-bottom: 6px;">DESC.</td><td class="text-right" style="padding-bottom: 6px;">-S/${Number(item.discount).toFixed(2)}</td></tr>` : ''}`).join('')


  // Datos del cliente en boleta/factura: DNI (8) o RUC (11) y, si hay, su dirección con distrito, provincia y departamento
  const clientDoc = (i.clientDocNumber || '').trim()
  const clientDocLabel = clientDoc.length === 11 ? 'RUC' : clientDoc.length === 8 ? 'DNI' : ''
  const clientAddr = tipo === 'FACTURA' ? (i.clientAddress || '').trim() : '' // la dirección va solo en factura, no en boleta con DNI

  // Resumen de pago: total de unidades, lo pagado y el vuelto (solo en efectivo hay vuelto)
  const totalItems = saleItems.filter((it) => Number(it.unitPrice) >= 0).reduce((s, it) => s + it.qty, 0) // la línea de descuento (monto negativo) no es un ítem
  const paid = method === 'efectivo' && i.amountPaid != null && i.amountPaid > total ? i.amountPaid : total
  const change = Math.max(0, Math.round((paid - total) * 100) / 100)

  const paymentLabel = method === 'efectivo' ? 'EFECTIVO' : method === 'yape' ? 'YAPE' : method === 'tarjeta' ? 'TARJETA' : 'EFECTIVO'

  const receiptHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
 <meta charset="UTF-8">
 <style>
  * { box-sizing: border-box; }
  body { width: 80mm; margin: 0 auto; padding: 10px; font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; line-height: 1.2; text-transform: uppercase; }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }
  .dashed-line { border-bottom: 1px dashed #000; margin: 6px 0; width: 100%; }
  p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  td { vertical-align: top; padding: 2px 0; }
  .logo-container { text-align: center; margin-bottom: 8px; }
  .logo-container img { max-width: 60mm; height: auto; }
  .qr-container { text-align: center; margin-top: 15px; margin-bottom: 10px; }
  .disclaimer { text-align: center; font-size: 10px; font-weight: bold; margin-top: 10px; padding: 0 5px; }
  @media print { body { width: 100%; padding: 0; margin: 0; } @page { margin: 0; } }
 </style>
</head>
<body>
 <div class="logo-container">
  <img src="${RECEIPT_LOGO}" alt="Logo">
 </div>

 <div class="text-center">
  <p>${escapeHtml(businessRazonSocial)}</p>
  <p>${escapeHtml(businessDireccion)}</p>
  ${businessUbicacion ? `<p>${escapeHtml(businessUbicacion)}</p>` : ''}
  <p>RUC: ${escapeHtml(businessRuc)}</p>
  ${businessNombreComercial ? `<p>${escapeHtml(businessNombreComercial)}</p>` : ''}
 </div>

 <div class="dashed-line"></div>

 <div>
  <p>${tipoLabel}: ${correlativo}</p>
  <p>Cuenta: Mesa: ${escapeHtml(clientNameStr || '-')}</p>
  ${clientDocLabel ? `<p>${clientDocLabel}: ${escapeHtml(clientDoc)}</p>` : ''}
  ${clientAddr ? `<p>Dirección: ${escapeHtml(clientAddr)}</p>` : ''}
  <p>Fecha: ${dateStr} Hora: ${timeStr}</p>
  <p>Cajero: ${escapeHtml(i.cashier)}</p>
 </div>

 <div class="text-center">
  <div style="display: flex; align-items: center; gap: 6px; margin: 6px 0;"><span style="flex: 1; border-top: 1px dashed #000;"></span>PRODUCTOS<span style="flex: 1; border-top: 1px dashed #000;"></span></div>
 </div>

 <table>${productsHtml}</table>

 <div class="dashed-line"></div>

 <table>
  ${sumExonerado > 0 ? `<tr><td class="text-left">OP. EXONERADAS</td><td class="text-right">S/${sumExonerado.toFixed(2)}</td></tr>` : ''}
  ${sumGravado > 0 ? `<tr><td class="text-left">OP. GRAVADAS</td><td class="text-right">S/${sumGravado.toFixed(2)}</td></tr>` : ''}
  <tr><td class="text-left">I.G.V</td><td class="text-right">S/${sumIgv.toFixed(2)}</td></tr>
  <tr><td class="text-left">IMPORTE TOTAL</td><td class="text-right">S/${total.toFixed(2)}</td></tr>
 </table>

 <p>SON: ${numberToWords(total)} SOLES</p>

 <table style="table-layout: fixed;">
  <colgroup><col style="width: 38%;"><col style="width: 34%;"><col style="width: 28%;"></colgroup>
  <tr><td class="text-left">ITEMS: ${totalItems}</td><td class="text-left">${paymentLabel}</td><td class="text-right">S/${total.toFixed(2)}</td></tr>
  <tr><td></td><td class="text-left">PAGADO</td><td class="text-right">S/${paid.toFixed(2)}</td></tr>
  <tr><td></td><td class="text-left">VUELTO</td><td class="text-right">S/${change.toFixed(2)}</td></tr>
 </table>

 ${(() => { const qr = sunatQrSvg(i, tipo); return qr ? `<div class="qr-container">${qr}</div>` : '' })()}

 <p class="disclaimer">${escapeHtml(config.receiptFooter || DEFAULT_RECEIPT_FOOTER)}</p>

 <div style="margin-top: 40px; text-align: center;">
  <p style="border-top: 1px solid #000; width: 60%; margin: 0 auto; padding-top: 20px;">Firma y DNI</p>
 </div>

 <p class="disclaimer" style="margin-top: 14px;">${escapeHtml(RETURN_POLICY)}</p>
</body>
</html>`
  return receiptHtml
}
