import type { PlayzoneChargeLine } from '@/store/playzoneTicketStore'
import { RECEIPT_LOGO } from '../receipt-logo'
import { numberToWords, type CheckoutLine, type PaymentMethod, type SaleResultItem, type TenantFiscalConfig } from './fiscal'

const DEFAULT_RECEIPT_FOOTER = '¡Aquí creamos sonrisas! Recuerda que la supervisión y responsabilidad ante cualquier accidente es exclusivamente de los papis.'

export function escapeHtml(v: string): string {
 return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Builds the 80mm receipt from tenant settings (name/RUC/address) and prints it (Electron silent print or hidden iframe). */
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
}) {
 const { saleData, saleItems, clientNameStr, method, total, config, lines, summary, playzoneCharges, activeWorker } = p
  const tipo = (saleData.tipoComprobante || 'TICKET').toUpperCase()
  const tipoLabel = tipo === 'BOLETA' ? 'BOLETA DE VENTA ELECTRONICA' : tipo === 'FACTURA' ? 'FACTURA DE VENTA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA'
  const correlativo = saleData.serie && saleData.correlativo ? `${saleData.serie}-${saleData.correlativo}` : `TICKET-${Date.now().toString().slice(-8)}`
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const businessRazonSocial = config.razonSocial || config.name || ''
  const businessDireccion = config.direccion || ''
  const businessRuc = config.ruc || ''
  const businessNombreComercial = config.nombreComercial || ''

  const productsHtml = saleItems.map((item) => `
   <tr>
    <td colspan="2">${escapeHtml(item.productName)}</td>
   </tr>
   <tr>
    <td class="text-left" style="padding-bottom: 6px;">${item.qty} Un x ${Number(item.unitPrice).toFixed(2)}</td>
    <td class="text-right" style="padding-bottom: 6px;">S/${Number(item.lineTotal).toFixed(2)}</td>
   </tr>`).join('')

  // Playzone lines are always EXONERADO (same as backend)
  const sumExonerado = lines.filter(l => l.regime === 'EXONERADO' || l.regime === 'INAFECTO').reduce((s, l) => s + l.mtoImpItem, 0)
   + playzoneCharges.reduce((s, c) => s + c.total, 0)
  const sumGravado = lines.filter(l => l.regime === 'GRAVADO' || l.regime === 'GRAVADO_10_5').reduce((s, l) => s + l.mtoValorVenta, 0)
  const sumIgv = summary.mtoIGV

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
  <p>RUC: ${escapeHtml(businessRuc)}</p>
  ${businessNombreComercial ? `<p>${escapeHtml(businessNombreComercial)}</p>` : ''}
 </div>

 <div class="dashed-line"></div>

 <div>
  <p>${tipoLabel}: ${correlativo}</p>
  <p>Cuenta: Mesa: ${escapeHtml(clientNameStr || '-')}</p>
  <p>Fecha: ${dateStr} Hora: ${timeStr}</p>
  <p>Cajero: ${escapeHtml(activeWorker?.name || 'Cajero')}</p>
 </div>

 <div class="text-center">
  <p style="margin: 6px 0;">----------------PRODUCTOS----------------</p>
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

 <table>
  <tr>
   <td class="text-left">${paymentLabel}</td>
   <td class="text-right">S/${total.toFixed(2)}</td>
  </tr>
 </table>

 <div class="qr-container">
 <img src="qr-code.png" alt="QR Code" width="100" height="100">
 </div>

 <p class="disclaimer">${escapeHtml(config.receiptFooter || DEFAULT_RECEIPT_FOOTER)}</p>

 <div style="margin-top: 40px; text-align: center;">
  <p style="border-top: 1px solid #000; width: 60%; margin: 0 auto; padding-top: 20px;">Firma y DNI</p>
 </div>
</body>
</html>`
  if (window.electronAPI?.printSilent) {
   window.electronAPI.printSilent(receiptHtml)
  } else {
   const iframe = document.createElement('iframe')
   iframe.style.position = 'fixed'
   iframe.style.right = '0'
   iframe.style.bottom = '0'
   iframe.style.width = '0'
   iframe.style.height = '0'
   iframe.style.border = 'none'
   document.body.appendChild(iframe)
   const doc = iframe.contentDocument
   if (doc) {
    doc.open()
    doc.write(receiptHtml)
    doc.close()
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
   }
  }
 }
