import { formatPEN } from '@/lib/format'

export interface Sale {
  id: string
  total: number
  tipoComprobante: string
  serie: string | null
  correlativo: string | null
  createdAt: string
  status: string
  paymentMethod: string
  clientName: string | null
  clientDocNumber?: string | null
  worker: { name: string }
  items?: Array<{
    qty: number
    product: { name: string; sku?: string }
    unitPrice: number
  }>
}

export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function formatTableDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  let hours = d.getHours()
  const mins = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${d.getFullYear()}-${m}-${day} ${hours}:${mins} ${ampm}`
}

export function getCorrelativo(sale: Sale): string {
  if (sale.serie && sale.correlativo) return `${sale.serie}-${sale.correlativo}`
  return `BW01-${sale.id.slice(-8)}`
}

export function getPaymentMethodLabel(method: string): string {
  const lower = (method || '').toLowerCase()
  if (lower === 'efectivo') return 'Efectivo'
  if (lower === 'yape' || lower === 'plin' || lower === 'qr') return 'Qr'
  if (lower === 'tarjeta') return 'Tarjeta'
  if (lower === 'mixto') return 'Mixto'
  return 'Efectivo'
}

export function getDocumentTypeLabel(tipo: string): string {
  const upper = (tipo || '').toUpperCase()
  if (upper === 'BOLETA') return 'Boleta'
  if (upper === 'FACTURA') return 'Factura'
  if (upper === 'TICKET') return 'Ticket'
  if (upper === 'NOTA_CREDITO' || upper === 'CREDIT_NOTE') return 'Nota de Crédito'
  return 'Boleta'
}

/** Opens the browser print dialog with a standalone receipt (the colours here are for paper, not the app theme). */
export function printReceipt(s: Sale) {
  const receiptHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Comprobante Wonka</title>
<style>
  body{font-family:monospace;max-width:320px;margin:20px auto;color:#1a1a1a;font-size:12px}
  .center{text-align:center;border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .total{border-top:1px dashed #ccc;margin-top:8px;padding-top:8px;font-weight:800;font-size:14px;text-align:right}
</style></head><body>
  <div class="center">
    <strong>WONKA POS</strong><br>
    ${getDocumentTypeLabel(s.tipoComprobante)} ${getCorrelativo(s)}<br>
    <small>${formatTableDateTime(s.createdAt)}</small>
  </div>
  <div class="row"><span>Cliente:</span><span>${escapeHtml(s.clientName || 'CLIENTE VARIOS')}</span></div>
  <div class="row"><span>Pago:</span><span>${getPaymentMethodLabel(s.paymentMethod)}</span></div>
  <div class="row"><span>Estado:</span><span>${s.status === 'CANCELLED' ? 'ANULADO' : 'EMITIDO'}</span></div>
  <div class="total">TOTAL: ${formatPEN(s.total)}</div>
</body></html>`
  const w = window.open('', '_blank', 'width=400,height=500')
  if (w) {
    w.document.write(receiptHtml)
    w.document.close()
    w.print()
  }
}
