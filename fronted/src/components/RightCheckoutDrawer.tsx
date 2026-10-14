import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Smartphone, CreditCard, Search, Loader2, Ticket, FileText, User, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { usePaymentLedgerStore } from '@/store/paymentLedgerStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCurrency } from '@/lib/format'
import type { CartItem, Product } from '@/types'
import type { PlayzoneChargeLine } from '@/store/playzoneTicketStore'
import { RECEIPT_LOGO } from './receipt-logo'

// ============================================================
// RightCheckoutDrawer — Right-side checkout with invoicing
// ============================================================

type PaymentMethod = 'efectivo' | 'yape' | 'tarjeta'
type InvoiceType = 'TICKET' | 'BOLETA' | 'FACTURA'
type IgvRegime = 'GRAVADO' | 'EXONERADO' | 'INAFECTO' | 'ICBPER' | 'GRAVADO_10_5'

interface TenantFiscalConfig {
 igvRate: number
 defaultIgvRegime: IgvRegime
 pricesIncludeIgv: boolean
 ruc?: string | null
 razonSocial?: string | null
 nombreComercial?: string | null
 direccion?: string | null
 name?: string | null
}

interface CheckoutLine {
 product: Product
 qty: number
 mtoValorVenta: number
 mtoIGV: number
 mtoImpItem: number
 regime: IgvRegime
}

function numberToWords(n: number): string {
 const ones = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
 const tens = ['', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
 const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

 if (n === 0) return 'CERO'
 if (n === 100) return 'CIEN'

 let result = ''
 const intPart = Math.floor(n)
 const cents = Math.round((n - intPart) * 100)

 if (intPart >= 1000) {
  const thousands = Math.floor(intPart / 1000)
  result += thousands === 1 ? 'MIL' : `${hundreds[thousands] || ''} MIL`.trim()
  const remainder = intPart % 1000
  if (remainder > 0) result += ' '
  if (remainder <= 30) {
   result += ones[remainder]
  } else {
   const t = Math.floor(remainder / 10)
   const o = remainder % 10
   result += tens[t]
   if (o > 0) result += ` Y ${ones[o]}`
  }
 } else if (intPart > 100) {
  const h = Math.floor(intPart / 100)
  result += hundreds[h]
  const remainder = intPart % 100
  if (remainder > 0) {
   result += ' '
   if (remainder <= 30) result += ones[remainder]
   else {
    const t = Math.floor(remainder / 10)
    const o = remainder % 10
    result += tens[t]
    if (o > 0) result += ` Y ${ones[o]}`
   }
  }
 } else if (intPart > 30) {
  const t = Math.floor(intPart / 10)
  const o = intPart % 10
  result += tens[t]
  if (o > 0) result += ` Y ${ones[o]}`
 } else {
  result += ones[intPart]
 }

 result += ' CON '
 if (cents === 0) result += '00'
 else if (cents <= 30) result += ones[cents].padStart(2, '0')
 else {
  const t = Math.floor(cents / 10)
  const o = cents % 10
  result += tens[t]
  if (o > 0) result += ` Y ${ones[o]}`
 }
 result += '/100'
 return result
}

interface RightCheckoutDrawerProps {
 open: boolean
 onClose: () => void
 cart: CartItem[]
 playzoneCharges: PlayzoneChargeLine[]
 /** warning: venta guardada pero con aviso (p.ej. comprobante pendiente de SUNAT) */
 onSaleComplete: (warning?: string) => void
}

interface SaleResultItem { productName: string; qty: number; unitPrice: string; lineTotal: string }

function apiErrorMessage(err: unknown, fallback: string): string {
 const e = err as { value?: { message?: string } | string; message?: string } | null
 if (typeof e?.value === 'string' && e.value) return e.value
 if (typeof e?.value === 'object' && e.value?.message) return e.value.message
 return fallback
}

function resolveRegime(productRegime: string | null | undefined, tenantDefault: IgvRegime): IgvRegime {
 const r = (productRegime ?? tenantDefault).toUpperCase()
 if (r === 'GRAVADO') return 'GRAVADO'
 if (r === 'INAFECTO') return 'INAFECTO'
 if (r === 'ICBPER') return 'ICBPER'
 if (r === 'GRAVADO_10_5') return 'GRAVADO_10_5'
 return 'EXONERADO'
}

function calculateLine(product: Product, qty: number, config: TenantFiscalConfig): CheckoutLine {
 const regime = resolveRegime(product.igvRegime, config.defaultIgvRegime)
 const unitPrice = product.price

 if (regime === 'EXONERADO' || regime === 'INAFECTO') {
 const mtoValorVenta = unitPrice * qty
 return { product, qty, mtoValorVenta, mtoIGV: 0, mtoImpItem: mtoValorVenta, regime }
 }

 const rate = regime === 'GRAVADO_10_5' ? 10.5 / 100 : (regime === 'ICBPER' ? config.igvRate / 100 : config.igvRate / 100)
 const mtoValorUnitario = config.pricesIncludeIgv ? unitPrice / (1 + rate) : unitPrice
 const mtoValorVenta = mtoValorUnitario * qty
 const mtoIGV = mtoValorVenta * rate
 const mtoImpItem = mtoValorVenta + mtoIGV

 return {
 product,
 qty,
 mtoValorVenta: Number(mtoValorVenta.toFixed(2)),
 mtoIGV: Number(mtoIGV.toFixed(2)),
 mtoImpItem: Number(mtoImpItem.toFixed(2)),
 regime,
 }
}

export function RightCheckoutDrawer({ open, onClose, cart, playzoneCharges, onSaleComplete }: RightCheckoutDrawerProps) {
 const { activeWorker, tenantId } = useAuthStore()
 const { recordPayment } = usePaymentLedgerStore()

 const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
 const [invoiceType, setInvoiceType] = useState<InvoiceType>('TICKET')
 const [clientDocNumber, setClientDocNumber] = useState('')
 const [clientName, setClientName] = useState('')
 const [clientAddress, setClientAddress] = useState('')
 const [clientDepartamento, setClientDepartamento] = useState('')
 const [clientProvincia, setClientProvincia] = useState('')
 const [clientDistrito, setClientDistrito] = useState('')
 const [cashGiven, setCashGiven] = useState('')
 const [yapeCode, setYapeCode] = useState('')
 const [referenceCode, setReferenceCode] = useState('')

 const [config, setConfig] = useState<TenantFiscalConfig>({
 igvRate: 18,
 defaultIgvRegime: 'EXONERADO',
 pricesIncludeIgv: false,
 ruc: null,
 razonSocial: null,
 nombreComercial: null,
 direccion: null,
 name: null,
 })

 const [loading, setLoading] = useState(false)
 const [querying, setQuerying] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const queryingRef = useRef(false)

 useEffect(() => {
 const fetchConfig = async () => {
 try {
 const { data, error } = await api.dashboard.settings.get({ query: { tenantId } })
 if (error) throw error
 if (data?.data) {
  const tenant = data.data as TenantFiscalConfig
  setConfig({
   igvRate: Number(tenant.igvRate ?? 18),
   defaultIgvRegime: (tenant.defaultIgvRegime as IgvRegime) ?? 'EXONERADO',
   pricesIncludeIgv: tenant.pricesIncludeIgv ?? false,
   ruc: tenant.ruc,
   razonSocial: tenant.razonSocial,
   nombreComercial: tenant.nombreComercial,
   direccion: tenant.direccion,
   name: tenant.name,
  })
 }
 } catch (err) {
 console.error('Failed to load tenant config:', err)
 }
 }

 if (open) fetchConfig()
 }, [open, tenantId])

 const lines = useMemo(
  () => cart.map((item) => calculateLine(item.product, item.quantity, config)),
  [cart, config]
 )

 const summary = useMemo(() => {
  const mtoIGV = lines.reduce((s, l) => s + l.mtoIGV, 0)
  const mtoImpVenta = lines.reduce((s, l) => s + l.mtoImpItem, 0)
  const playzoneSum = playzoneCharges.reduce((s, c) => s + c.total, 0)
  return { mtoIGV: Number(mtoIGV.toFixed(2)), mtoImpVenta: Number((mtoImpVenta + playzoneSum).toFixed(2)) }
 }, [lines, playzoneCharges])

 const totalToPay = summary.mtoImpVenta
 const cashGivenValue = Number(cashGiven) || 0
 const change = paymentMethod === 'efectivo' ? Math.max(0, cashGivenValue - totalToPay) : 0
 const canInvoice = Boolean(config.ruc)

 const printReceipt = (saleData: { tipoComprobante: string; serie: string | null; correlativo: string | null }, saleItems: SaleResultItem[], clientNameStr: string, method: PaymentMethod, total: number) => {
  const tipo = (saleData.tipoComprobante || 'TICKET').toUpperCase()
  const tipoLabel = tipo === 'BOLETA' ? 'BOLETA DE VENTA ELECTRONICA' : tipo === 'FACTURA' ? 'FACTURA DE VENTA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA'
  const correlativo = saleData.serie && saleData.correlativo ? `${saleData.serie}-${saleData.correlativo}` : `BW01-${Date.now().toString().slice(-8)}`
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
  <p>${businessRazonSocial}</p>
  <p>${businessDireccion}</p>
  <p>RUC: ${businessRuc}</p>
  ${businessNombreComercial ? `<p>${businessNombreComercial}</p>` : ''}
 </div>

 <div class="dashed-line"></div>

 <div>
  <p>${tipoLabel}: ${correlativo}</p>
  <p>Cuenta: Mesa: ${escapeHtml(clientNameStr || '-')}</p>
  <p>Fecha: ${dateStr} Hora: ${timeStr}</p>
  <p>Cajero: ${activeWorker?.name || 'Cajero'}</p>
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

 <p class="disclaimer">¡Aquí creamos sonrisas! Recuerda que la supervisión y responsabilidad ante cualquier accidente es exclusivamente de los papis.</p>

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

 const resetForm = () => {
 setPaymentMethod('efectivo')
 setInvoiceType('TICKET')
 setClientDocNumber('')
 setClientName('')
 setClientAddress('')
 setClientDepartamento('')
 setClientProvincia('')
 setClientDistrito('')
 setCashGiven('')
 setYapeCode('')
 setReferenceCode('')
 setError(null)
 }

 useEffect(() => {
 if (!open) resetForm()
 }, [open])

 // Auto-query when document number reaches required length
 useEffect(() => {
 if (queryingRef.current || !clientDocNumber) return
 if (invoiceType === 'FACTURA' && clientDocNumber.length === 11) {
 queryDocument()
 } else if (invoiceType === 'BOLETA' && clientDocNumber.length === 8) {
 queryDocument()
 }
 }, [clientDocNumber, invoiceType])

 const handleClose = () => {
 if (!loading) onClose()
 }

 const queryDocument = async () => {
 if (!clientDocNumber || queryingRef.current) return
 queryingRef.current = true
 setQuerying(true)
 setError(null)

 try {
 if (invoiceType === 'BOLETA' && clientDocNumber.length === 8) {
 const { data, error } = await api.apisperu.dni({ dni: clientDocNumber }).get({ query: { tenantId } })
 if (error) throw error
 const result = data?.data as { nombre?: string } | undefined
 setClientName(result?.nombre ?? '')
 } else if (invoiceType === 'FACTURA' && clientDocNumber.length === 11) {
 const { data, error } = await api.apisperu.ruc({ ruc: clientDocNumber }).get({ query: { tenantId } })
 if (error) throw error
 const result = data?.data as Record<string, unknown> | undefined
 console.log('[RUC Query] raw result:', result)
 setClientName((result?.razonSocial as string) ?? (result?.nombreComercial as string) ?? '')
 setClientAddress((result?.direccion as string) ?? '')
 setClientDepartamento((result?.departamento as string) ?? '')
 setClientProvincia((result?.provincia as string) ?? '')
 setClientDistrito((result?.distrito as string) ?? '')
 const hasAddress = Boolean((result?.direccion as string) || (result?.departamento as string))
 if (!hasAddress) {
 setError('Persona natural: la dirección no viene en el padrón. Ingresa la dirección manualmente.')
 }
 } else {
 setError('Número de documento inválido.')
 }
 } catch (err) {
 console.error('Document query failed:', err)
 setError('No se pudo consultar el documento.')
 } finally {
 queryingRef.current = false
 setQuerying(false)
 }
 }

 const finalizeSale = async () => {
 if (cart.length === 0 && playzoneCharges.length === 0) return
 if (!activeWorker) {
  setError('No hay un cajero activo. Vuelve a iniciar sesión.')
  return
 }

 if (invoiceType === 'FACTURA' && !clientDocNumber) {
  setError('El RUC es obligatorio para facturas.')
  return
 }

 if (paymentMethod === 'efectivo' && cashGivenValue < totalToPay) {
  setError('El efectivo recibido es menor al total.')
  return
 }

 setLoading(true)
 setError(null)

 try {
 const clientDocType = invoiceType === 'BOLETA' ? '1' : invoiceType === 'FACTURA' ? '6' : '-'
 const normalizedName = clientName.trim() || 'CLIENTE VARIOS'
 const normalizedDoc = clientDocNumber.trim() || '0'

 const saleItems = [
  // free-sale-* lines carry their own price/label; catalog and playzone lines are priced by the backend
  ...cart.map((item) => ({ productId: item.product.id, qty: item.quantity, unitPrice: item.product.price, label: item.product.name })),
  ...playzoneCharges.map((c) => ({ productId: c.id, qty: 1 })),
 ]

 const { data, error } = await api.pos.sales.post({
  tenantId,
  workerId: activeWorker.id,
  items: saleItems,
  tipoComprobante: invoiceType,
  paymentMethod,
  clientDocType: clientDocType as '1' | '6' | '-',
  clientDocNumber: invoiceType === 'TICKET' ? undefined : normalizedDoc,
  clientName: invoiceType === 'TICKET' ? undefined : normalizedName,
  clientAddress: invoiceType === 'FACTURA' ? [clientAddress, clientDistrito, clientProvincia, clientDepartamento].filter(Boolean).join(', ') : undefined,
 })

 if (error) {
  setError(apiErrorMessage(error, 'Error al procesar la venta.'))
  return
 }

 const saleResult = data?.data as { sale: { total: string; tipoComprobante: string; serie: string | null; correlativo: string | null; sunatStatus: string | null }; items: SaleResultItem[] }
 // The backend total is authoritative (playzone lines are re-priced server-side)
 const saleTotal = Number(saleResult.sale.total)
 recordPayment({ tenantId, workerId: activeWorker.id, method: paymentMethod, amount: saleTotal })
 printReceipt(saleResult.sale, saleResult.items, normalizedName, paymentMethod, saleTotal)

 const warnings: string[] = []
 if (Math.abs(saleTotal - totalToPay) >= 0.01) warnings.push(`El total cobrado según sistema es ${formatCurrency(saleTotal)} (en pantalla ${formatCurrency(totalToPay)}).`)
 if (saleResult.sale.tipoComprobante !== 'TICKET' && saleResult.sale.sunatStatus !== 'ACEPTADA') {
  warnings.push(saleResult.sale.sunatStatus === 'RECHAZADA'
   ? 'SUNAT rechazó el comprobante.'
   : 'El comprobante electrónico quedó pendiente de envío a SUNAT.')
 }
 onSaleComplete(warnings.length ? `Venta guardada. ${warnings.join(' ')}` : undefined)
 resetForm()
 } catch (err) {
 console.error('Failed to finalize sale:', err)
 setError('Error inesperado al procesar la venta.')
 } finally {
 setLoading(false)
 }
 }

 const paymentOptions: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
 { key: 'efectivo', label: 'Efectivo', icon: Banknote },
 { key: 'yape', label: 'Yape', icon: Smartphone },
 { key: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
 ]

 const invoiceOptions: { key: InvoiceType; label: string; icon: typeof Ticket }[] = [
 { key: 'TICKET', label: 'Ticket', icon: Ticket },
 { key: 'BOLETA', label: 'Boleta', icon: FileText },
 { key: 'FACTURA', label: 'Factura', icon: FileText },
 ]

 return (
 <Sheet open={open} onOpenChange={handleClose}>
  <SheetContent side="right" className="w-full sm:max-w-[480px] bg-white border-l border-gray-200 p-0 flex flex-col">
 <SheetHeader className="px-5 py-4 border-b border-gray-200">
 <SheetTitle className="text-lg font-bold text-gray-900">Cobrar</SheetTitle>
 </SheetHeader>

 <div className="flex-1 overflow-y-auto p-5 space-y-6">
 {/* Payment method */}
 <section>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Método de pago</h3>
 <div className="grid grid-cols-3 gap-2">
 {paymentOptions.map((opt) => (
 <button
 key={opt.key}
 onClick={() => setPaymentMethod(opt.key)}
 className={cn(
 'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium transition-all',
 paymentMethod === opt.key
 ? 'bg-brand-500 border-brand-500 text-gray-900'
 : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
 )}
 >
 <opt.icon className="w-5 h-5" />
 {opt.label}
 </button>
 ))}
 </div>

 {paymentMethod === 'efectivo' && (
 <div className="mt-3 space-y-2">
 <label className="text-xs text-gray-500">Recibido</label>
 <Input
 type="number"
 min={0}
 step={0.01}
 value={cashGiven}
 onChange={(e) => setCashGiven(e.target.value)}
 placeholder="0.00"
 className="bg-gray-50 border-gray-200"
 />
 {change > 0 && (
 <p className="text-sm text-secondary-500">Vuelto: {formatCurrency(change)}</p>
 )}
 </div>
 )}

 {paymentMethod === 'yape' && (
 <div className="mt-3 space-y-2">
 <label className="text-xs text-gray-500">Código de operación</label>
 <Input
 value={yapeCode}
 onChange={(e) => setYapeCode(e.target.value)}
 placeholder="Opcional"
 className="bg-gray-50 border-gray-200"
 />
 </div>
 )}

 {paymentMethod === 'tarjeta' && (
 <div className="mt-3 space-y-2">
 <label className="text-xs text-gray-500">Código de referencia</label>
 <Input
 value={referenceCode}
 onChange={(e) => setReferenceCode(e.target.value)}
 placeholder="Opcional"
 className="bg-gray-50 border-gray-200"
 />
 </div>
 )}
 </section>

 {/* Invoice type */}
 <section>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Comprobante</h3>
 <div className="grid grid-cols-3 gap-2">
 {invoiceOptions.map((opt) => (
 <button
 key={opt.key}
 onClick={() => {
 setInvoiceType(opt.key)
 setClientDocNumber('')
 setClientName('')
 setClientAddress('')
 setClientDepartamento('')
 setClientProvincia('')
 setClientDistrito('')
 }}
 disabled={opt.key !== 'TICKET' && !canInvoice}
 className={cn(
 'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium transition-all',
 invoiceType === opt.key
 ? 'bg-brand-500 border-brand-500 text-gray-900'
 : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100',
 opt.key !== 'TICKET' && !canInvoice && 'opacity-40 cursor-not-allowed'
 )}
 >
 <opt.icon className="w-5 h-5" />
 {opt.label}
 </button>
 ))}
 </div>

 {!canInvoice && (
 <p className="mt-2 text-xs text-yellow-500">
 Configure RUC y token APISPeru en Configuración para emitir boletas/facturas.
 </p>
 )}

 {invoiceType === 'BOLETA' && (
 <div className="mt-3 space-y-2">
 <label className="text-xs text-gray-500 flex items-center gap-1">
 <User className="w-3 h-3" /> DNI
 </label>
 <div className="flex gap-2">
 <Input
 value={clientDocNumber}
 onChange={(e) => setClientDocNumber(e.target.value)}
 placeholder="12345678"
 maxLength={8}
 className="bg-gray-50 border-gray-200"
 />
 <Button
 variant="outline"
 size="icon"
 onClick={queryDocument}
 disabled={querying || clientDocNumber.length !== 8}
 >
 {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
 </Button>
 </div>
 <Input
 value={clientName}
 onChange={(e) => setClientName(e.target.value)}
 placeholder="Nombre del cliente"
 className="bg-gray-50 border-gray-200"
 />
 </div>
 )}

 {invoiceType === 'FACTURA' && (
 <div className="mt-3 space-y-2">
 <label className="text-xs text-gray-500 flex items-center gap-1">
 <Building2 className="w-3 h-3" /> RUC
 </label>
 <div className="flex gap-2">
 <Input
 value={clientDocNumber}
 onChange={(e) => setClientDocNumber(e.target.value)}
 placeholder="20123456789"
 maxLength={11}
 className="bg-gray-50 border-gray-200"
 />
 <Button
 variant="outline"
 size="icon"
 onClick={queryDocument}
 disabled={querying || clientDocNumber.length !== 11}
 >
 {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
 </Button>
 </div>
 <Input
 value={clientName}
 onChange={(e) => setClientName(e.target.value)}
 placeholder="Razón social"
 className="bg-gray-50 border-gray-200"
 />
 <Input
 value={clientAddress}
 onChange={(e) => setClientAddress(e.target.value)}
 placeholder="Dirección"
 className="bg-gray-50 border-gray-200"
 />
 <div className="grid grid-cols-3 gap-2">
 <Input
 value={clientDepartamento}
 onChange={(e) => setClientDepartamento(e.target.value)}
 placeholder="Departamento"
 className="bg-gray-50 border-gray-200"
 />
 <Input
 value={clientProvincia}
 onChange={(e) => setClientProvincia(e.target.value)}
 placeholder="Provincia"
 className="bg-gray-50 border-gray-200"
 />
 <Input
 value={clientDistrito}
 onChange={(e) => setClientDistrito(e.target.value)}
 placeholder="Distrito"
 className="bg-gray-50 border-gray-200"
 />
 </div>
 </div>
 )}
 </section>

 {/* Items summary */}
 <section>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Resumen</h3>
 <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-zinc-800">
 {playzoneCharges.map((charge) => (
 <div key={charge.id} className="flex justify-between px-3 py-2 text-sm">
 <span className="text-amber-700">
  {charge.qty}x {charge.label}
 </span>
 <span className="font-medium">{formatCurrency(charge.total)}</span>
 </div>
 ))}
 {lines.map((line) => (
 <div key={line.product.id} className="flex justify-between px-3 py-2 text-sm">
 <span className="text-gray-600">
  {line.qty}x {line.product.name}
 </span>
 <span className="font-medium">{formatCurrency(line.mtoImpItem)}</span>
 </div>
 ))}
 <div className="px-3 py-2 space-y-1 text-xs text-gray-400">
 {summary.mtoIGV > 0 && (
  <div className="flex justify-between">
  <span>IGV ({config.igvRate}%)</span>
  <span>{formatCurrency(summary.mtoIGV)}</span>
  </div>
 )}
 </div>
 <div className="flex justify-between px-3 py-3 text-base font-bold">
 <span className="text-gray-900">Total</span>
 <span className="text-brand-500">{formatCurrency(totalToPay)}</span>
 </div>
 </div>
 </section>

 {error && (
 <div className="rounded-lg bg-brand-100 text-brand-500 px-3 py-2 text-sm">
 {error}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="border-t border-gray-200 p-5 space-y-3">
 <Button
 className="w-full h-12 bg-secondary-500 hover:bg-secondary-600 text-base font-bold"
 disabled={loading}
 onClick={finalizeSale}
 >
 {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Finalizar venta ${formatCurrency(totalToPay)}`}
 </Button>
 </div>
 </SheetContent>
 </Sheet>
 )
}

import { cn } from '@/lib/utils'

function escapeHtml(v: string): string {
 return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
