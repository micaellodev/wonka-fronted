import { printHtml } from '@/lib/print'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/ui/toast'
import { useAuthStore } from '@/store/authStore'
import { renderReceipt } from '@/components/checkout/receipt'
import { resolveRegime, type IgvRegime, type TenantFiscalConfig } from '@/components/checkout/fiscal'

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
    product: { name: string; sku?: string; igvRegime?: string | null }
    unitPrice: number
    isVirtual?: boolean
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

/** Reimprime una venta con la misma maqueta que al cobrar (ticket, boleta o factura): trae el detalle y los datos del negocio si faltan. */
export async function printReceipt(sale: Sale) {
  const tenantId = useAuthStore.getState().tenantId
  if (!tenantId) return
  try {
    let full = sale
    if (!full.items) {
      const { data, error } = await api.pos.sales({ id: sale.id }).get({ query: { tenantId } })
      if (error) throw error
      full = { ...(data?.data as Sale), total: Number(sale.total) }
    }
    const { data, error } = await api.dashboard.settings.get({ query: { tenantId } })
    if (error) throw error
    const t = data?.data as TenantFiscalConfig
    const config: TenantFiscalConfig = { ...t, igvRate: Number(t.igvRate ?? 18), defaultIgvRegime: (t.defaultIgvRegime as IgvRegime) ?? 'EXONERADO', pricesIncludeIgv: t.pricesIncludeIgv ?? false }

    let sumExonerado = 0, sumGravado = 0, sumIgv = 0
    const items = (full.items ?? []).map((it) => {
      const price = Number(it.unitPrice)
      const virtual = it.isVirtual || /^(pz-|free-sale-)/.test(it.product.sku ?? '')
      // Juegos y venta libre siempre exonerados (igual que al cobrar); el resto, según el producto o el régimen por defecto
      const regime = virtual ? 'EXONERADO' : resolveRegime(it.product.igvRegime, config.defaultIgvRegime)
      if (regime === 'EXONERADO' || regime === 'INAFECTO') sumExonerado += price * it.qty
      else {
        const rate = (regime === 'GRAVADO_10_5' ? 10.5 : config.igvRate) / 100
        const valor = (config.pricesIncludeIgv ? price / (1 + rate) : price) * it.qty
        sumGravado += valor
        sumIgv += valor * rate
      }
      return { productName: it.product.name, qty: it.qty, unitPrice: String(price), lineTotal: String(price * it.qty) }
    })
    const method = (full.paymentMethod || '').toLowerCase()
    void printHtml(renderReceipt({
      tipo: full.tipoComprobante, serie: full.serie, correlativo: full.correlativo, ticketId: full.id.slice(-8),
      date: new Date(full.createdAt), cashier: full.worker?.name || 'Cajero', clientName: full.clientName || '',
      method: method === 'yape' || method === 'tarjeta' ? method : 'efectivo', total: Number(full.total), config, items,
      sumExonerado, sumGravado, sumIgv,
    }))
  } catch (err) {
    toast.error(apiErrorMessage(err, 'No se pudo preparar el comprobante'))
  }
}
