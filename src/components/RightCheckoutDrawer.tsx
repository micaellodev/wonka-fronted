import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Smartphone, CreditCard, Search, Loader2, Ticket, FileText, User, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { CASH_LABEL, useCashStatusStore } from '@/store/cashStatusStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatPEN } from '@/lib/format'
import type { CartItem } from '@/types'
import type { PlayzoneChargeLine } from '@/store/playzoneTicketStore'
import { printReceipt } from './checkout/receipt'
import { calculateLine, type IgvRegime, type InvoiceType, type PaymentMethod, type SaleResultItem, type TenantFiscalConfig } from './checkout/fiscal'
import { apiErrorMessage } from '@/lib/api-error'

// ============================================================
// RightCheckoutDrawer — Right-side checkout with invoicing
// ============================================================


interface RightCheckoutDrawerProps {
 open: boolean
 onClose: () => void
 cart: CartItem[]
 playzoneCharges: PlayzoneChargeLine[]
 /** warning: venta guardada pero con aviso (p.ej. comprobante pendiente de SUNAT) */
 onSaleComplete: (warning?: string) => void
}


export function RightCheckoutDrawer({ open, onClose, cart, playzoneCharges, onSaleComplete }: RightCheckoutDrawerProps) {
 const { activeWorker, tenantId } = useAuthStore()

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
   receiptFooter: tenant.receiptFooter,
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
 const cashStatus = useCashStatusStore((st) => st.summary?.cashStatus)
 const refreshCash = useCashStatusStore((st) => st.refresh)
 // Only block when the backend said so; the API enforces it again (CASH_NOT_OPEN)
 const cashBlocked = !!cashStatus && cashStatus !== 'ABIERTA'
 const cashGivenValue = Number(cashGiven) || 0
 const change = paymentMethod === 'efectivo' ? Math.max(0, cashGivenValue - totalToPay) : 0
 const canInvoice = Boolean(config.ruc)


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
 if (cashBlocked) {
  setError(`La caja está ${CASH_LABEL[cashStatus!].toLowerCase()}. No se puede vender.`)
  return
 }
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
  setError(typeof (error as { value?: unknown }).value === 'string' ? (error as { value: string }).value : apiErrorMessage(error, 'Error al procesar la venta.'))
  void refreshCash(tenantId)
  return
 }
 void refreshCash(tenantId)

 const saleResult = data?.data as { sale: { total: string; tipoComprobante: string; serie: string | null; correlativo: string | null; sunatStatus: string | null }; items: SaleResultItem[] }
 // The backend total is authoritative (playzone lines are re-priced server-side)
 const saleTotal = Number(saleResult.sale.total)
 printReceipt({ saleData: saleResult.sale, saleItems: saleResult.items, clientNameStr: normalizedName, method: paymentMethod, total: saleTotal, config, lines, summary, playzoneCharges, activeWorker })

 const warnings: string[] = []
 if (Math.abs(saleTotal - totalToPay) >= 0.01) warnings.push(`El total cobrado según sistema es ${formatPEN(saleTotal)} (en pantalla ${formatPEN(totalToPay)}).`)
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
  <SheetContent side="right" className="w-full sm:max-w-[480px] bg-background border-l border-border p-0 flex flex-col">
 <SheetHeader className="px-5 py-4 border-b border-border">
 <SheetTitle className="text-lg font-bold text-foreground">Cobrar</SheetTitle>
 </SheetHeader>

 <div className="flex-1 overflow-y-auto p-5 space-y-6">
 {/* Payment method */}
 <section>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Método de pago</h3>
 <div className="grid grid-cols-3 gap-2">
 {paymentOptions.map((opt) => (
 <button
 key={opt.key}
 onClick={() => setPaymentMethod(opt.key)}
 className={cn(
 'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium transition-all',
 paymentMethod === opt.key
 ? 'bg-primary border-primary text-primary-foreground'
 : 'bg-background border-border text-muted-foreground hover:bg-muted'
 )}
 >
 <opt.icon className="w-5 h-5" />
 {opt.label}
 </button>
 ))}
 </div>

 {paymentMethod === 'efectivo' && (
 <div className="mt-3 space-y-2">
 <Label className="text-xs text-muted-foreground">Recibido</Label>
 <Input
 type="number"
 min={0}
 step={0.01}
 value={cashGiven}
 onChange={(e) => setCashGiven(e.target.value)}
 placeholder="0.00" aria-label="0.00"

 />
 {change > 0 && (
 <p className="text-sm text-success">Vuelto: {formatPEN(change)}</p>
 )}
 </div>
 )}

 {paymentMethod === 'yape' && (
 <div className="mt-3 space-y-2">
 <Label className="text-xs text-muted-foreground">Código de operación</Label>
 <Input
 value={yapeCode}
 onChange={(e) => setYapeCode(e.target.value)}
 placeholder="Opcional" aria-label="Opcional"

 />
 </div>
 )}

 {paymentMethod === 'tarjeta' && (
 <div className="mt-3 space-y-2">
 <Label className="text-xs text-muted-foreground">Código de referencia</Label>
 <Input
 value={referenceCode}
 onChange={(e) => setReferenceCode(e.target.value)}
 placeholder="Opcional" aria-label="Opcional"

 />
 </div>
 )}
 </section>

 {/* Invoice type */}
 <section>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Comprobante</h3>
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
 ? 'bg-primary border-primary text-primary-foreground'
 : 'bg-background border-border text-muted-foreground hover:bg-muted',
 opt.key !== 'TICKET' && !canInvoice && 'opacity-40 cursor-not-allowed'
 )}
 >
 <opt.icon className="w-5 h-5" />
 {opt.label}
 </button>
 ))}
 </div>

 {!canInvoice && (
 <p className="mt-2 text-xs text-warning">
 Configure RUC y token APISPeru en Configuración para emitir boletas/facturas.
 </p>
 )}

 {invoiceType === 'BOLETA' && (
 <div className="mt-3 space-y-2">
 <Label className="text-xs text-muted-foreground flex items-center gap-1">
 <User className="w-3 h-3" /> DNI
 </Label>
 <div className="flex gap-2">
 <Input
 value={clientDocNumber}
 onChange={(e) => setClientDocNumber(e.target.value)}
 placeholder="12345678" aria-label="12345678"
 maxLength={8}

 />
 <Button
 variant="outline"
 size="icon"
 onClick={queryDocument}
 aria-label="Consultar documento"
 disabled={querying || clientDocNumber.length !== 8}
 >
 {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
 </Button>
 </div>
 <Input
 value={clientName}
 onChange={(e) => setClientName(e.target.value)}
 placeholder="Nombre del cliente" aria-label="Nombre del cliente"

 />
 </div>
 )}

 {invoiceType === 'FACTURA' && (
 <div className="mt-3 space-y-2">
 <Label className="text-xs text-muted-foreground flex items-center gap-1">
 <Building2 className="w-3 h-3" /> RUC
 </Label>
 <div className="flex gap-2">
 <Input
 value={clientDocNumber}
 onChange={(e) => setClientDocNumber(e.target.value)}
 placeholder="20123456789" aria-label="20123456789"
 maxLength={11}

 />
 <Button
 variant="outline"
 size="icon"
 onClick={queryDocument}
 aria-label="Consultar documento"
 disabled={querying || clientDocNumber.length !== 11}
 >
 {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
 </Button>
 </div>
 <Input
 value={clientName}
 onChange={(e) => setClientName(e.target.value)}
 placeholder="Razón social" aria-label="Razón social"

 />
 <Input
 value={clientAddress}
 onChange={(e) => setClientAddress(e.target.value)}
 placeholder="Dirección" aria-label="Dirección"

 />
 <div className="grid grid-cols-3 gap-2">
 <Input
 value={clientDepartamento}
 onChange={(e) => setClientDepartamento(e.target.value)}
 placeholder="Departamento" aria-label="Departamento"

 />
 <Input
 value={clientProvincia}
 onChange={(e) => setClientProvincia(e.target.value)}
 placeholder="Provincia" aria-label="Provincia"

 />
 <Input
 value={clientDistrito}
 onChange={(e) => setClientDistrito(e.target.value)}
 placeholder="Distrito" aria-label="Distrito"

 />
 </div>
 </div>
 )}
 </section>

 {/* Items summary */}
 <section>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Resumen</h3>
 <div className="rounded-xl border border-border bg-muted divide-y divide-border">
 {playzoneCharges.map((charge) => (
 <div key={charge.id} className="flex justify-between px-3 py-2 text-sm">
 <span className="text-warning">
  {charge.qty}x {charge.label}
 </span>
 <span className="font-medium">{formatPEN(charge.total)}</span>
 </div>
 ))}
 {lines.map((line) => (
 <div key={line.product.id} className="flex justify-between px-3 py-2 text-sm">
 <span className="text-muted-foreground">
  {line.qty}x {line.product.name}
 </span>
 <span className="font-medium">{formatPEN(line.mtoImpItem)}</span>
 </div>
 ))}
 <div className="px-3 py-2 space-y-1 text-xs text-muted-foreground">
 {summary.mtoIGV > 0 && (
  <div className="flex justify-between">
  <span>IGV ({config.igvRate}%)</span>
  <span>{formatPEN(summary.mtoIGV)}</span>
  </div>
 )}
 </div>
 <div className="flex justify-between px-3 py-3 text-base font-bold">
 <span className="text-foreground">Total</span>
 <span className="text-primary">{formatPEN(totalToPay)}</span>
 </div>
 </div>
 </section>

 {cashBlocked && (
 <div role="alert" className="rounded-lg bg-danger-soft text-destructive px-3 py-2 text-sm">
 La caja está {CASH_LABEL[cashStatus!].toLowerCase()}: no se puede vender hasta abrir la caja.
 </div>
 )}

 {error && (
 <div role="alert" className="rounded-lg bg-danger-soft text-destructive px-3 py-2 text-sm">
 {error}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="border-t border-border p-5 space-y-3">
 <Button
 className="w-full h-12 text-base font-bold"
 disabled={loading || cashBlocked}
 onClick={finalizeSale}
 >
 {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Finalizar venta ${formatPEN(totalToPay)}`}
 </Button>
 </div>
 </SheetContent>
 </Sheet>
 )
}

import { cn } from '@/lib/utils'

