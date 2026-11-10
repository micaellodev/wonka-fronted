import { useComboDiscount, useComboStore } from '@/store/comboStore'
import { useEffect, useState } from 'react'
import { ShoppingCart, CreditCard, XCircle, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'
import { CASH_LABEL, useCashStatusStore } from '@/store/cashStatusStore'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { RightCheckoutDrawer } from '@/components/RightCheckoutDrawer'
import { CartRow } from '@/pages/pos/CatalogParts'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'

// ============================================================
// TicketPanel — carrito + cobro, compartido por POS y Juegos
// ============================================================

function useClock() {
 const [now, setNow] = useState(new Date())
 useEffect(() => {
 const id = setInterval(() => setNow(new Date()), 1000)
 return () => clearInterval(id)
 }, [])
 return now
}

export function TicketPanel({ onSaleComplete, className }: { onSaleComplete?: () => void; className?: string }) {
 const { tenantId, activeWorker } = useAuthStore()
 const { items, total, addItem, decrementItem, removeItem, setDiscount, clearCart } = useCartStore()
 const { charges: playzoneCharges, total: playzoneTotal, clearAllCharges, removeCharge } = usePlayzoneTicketStore()
 const [checkoutOpen, setCheckoutOpen] = useState(false)
 const timeStr = useClock().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
 const hasCart = items.length > 0 || playzoneCharges.length > 0
 const comboResult = useComboDiscount()
 useEffect(() => { if (tenantId) void useComboStore.getState().load(tenantId) }, [tenantId])
 const cashStatus = useCashStatusStore((st) => st.summary?.cashStatus)
 const cashBlocked = !!cashStatus && cashStatus !== 'ABIERTA'

 // Con la caja cerrada el botón sigue activo para poder avisar el porqué (un botón desactivado no dice nada)
 const tryCharge = () => {
 if (!hasCart) return
 if (cashBlocked) {
 toast.error(`La caja está ${CASH_LABEL[cashStatus!].toLowerCase()}. Abre la caja en "Apertura y cierre" para poder cobrar.`)
 return
 }
 setCheckoutOpen(true)
 }

 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); tryCharge() }
 }
 window.addEventListener('keydown', onKey)
 return () => window.removeEventListener('keydown', onKey)
 }, [hasCart, cashBlocked, cashStatus])

 // Quitar el tiempo (base) o el acompañante (comp) cancela la sesión pendiente y saca ambas líneas del ticket
 const handleRemoveCharge = async (charge: { id: string; sessionId: string; kind: string }) => {
  if (charge.kind === 'ext') {
   // pz-ext-<sesión>~<min>~<total>: devuelve los minutos añadidos antes de sacar la línea
   const minutes = Number(charge.id.split('~')[1])
   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route param typing
   const r = await (api.playzone.sessions as any)({ id: charge.sessionId }).extend.delete(undefined, { query: { tenantId, minutes } })
   if (r.error) toast.error('No se pudo revertir el tiempo agregado; se quitó solo del ticket.')
   return removeCharge(charge.id)
  }
  if (charge.kind !== 'base' && charge.kind !== 'comp') return removeCharge(charge.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route param typing
  const res = await (api.playzone.sessions as any)({ id: charge.sessionId }).cancel.delete(undefined, { query: { tenantId } })
  if (res.error) toast.error('No se pudo cancelar la sesión; se quitó solo del ticket.')
  playzoneCharges.filter((c) => c.sessionId === charge.sessionId).forEach((c) => removeCharge(c.id))
 }

 const handleCancel = () => {
 if (!hasCart) return
 clearCart()
 clearAllCharges()
 toast.info('Orden cancelada')
 }

 const handleSaleComplete = (warning?: string) => {
 clearCart()
 clearAllCharges()
 if (warning) toast.info(warning)
 else toast.success('Venta procesada correctamente.')
 onSaleComplete?.()
 setCheckoutOpen(false)
 }

 return (
 <>
 <aside className={cn('flex min-h-0 flex-col rounded-xl border border-border bg-background', className)}>
 <div className="border-b border-border px-4 py-4">
 <h2 className="text-sm font-bold text-foreground tracking-widest uppercase">Ticket</h2>
 <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">
 {timeStr} · {activeWorker?.name}
 </p>
 </div>

 {hasCart && (
  <div className="flex justify-between border-b border-border px-4 py-2 text-[11px] font-mono font-bold uppercase text-muted-foreground">
  <span className="flex-1">Descripción</span>
  <span className="w-16 text-center">Cant</span>
  <span className="w-20 text-right">Importe</span>
  <span className="w-7" aria-hidden />
  </div>
 )}

 <div className="flex-1 overflow-y-auto bg-muted p-2">
 {!hasCart ? (
 <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-12">
 <ShoppingCart className="w-10 h-10 opacity-30" />
 <p className="text-xs font-bold uppercase tracking-widest text-center">
 Ticket vacío
 </p>
 </div>
 ) : (
 <div className="space-y-1">
 {playzoneCharges.map((charge) => (
 <div key={charge.id} className="flex items-center gap-2 px-2 py-2 border-b border-border hover:bg-muted bg-warning-soft">
 <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
 <p className="text-xs font-bold text-foreground leading-tight uppercase truncate">{charge.label}</p>
 <p className="text-[11px] font-mono text-warning">PLAYZONE</p>
 </div>
 <div className="w-20 flex flex-col items-center shrink-0">
 <span className="text-xs font-black font-mono text-foreground">{charge.qty}</span>
 </div>
 <div className="w-20 text-right shrink-0">
 <span className="text-sm font-black font-mono text-secondary-500 tracking-tighter">
 {formatPEN(charge.total)}
 </span>
 </div>
 <button
 onClick={() => handleRemoveCharge(charge)}
 aria-label="Quitar del ticket"
 title="Quitar del ticket"
 className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger-soft hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus:outline-none"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 ))}
 {items.map((item) => (
 <CartRow
  key={item.product.id}
  item={item}
  onDecrement={() => decrementItem(item.product.id)}
  onIncrement={() => addItem(item.product)}
  onRemove={() => removeItem(item.product.id)}
  onDiscount={(d) => setDiscount(item.product.id, d)}
 />
 ))}
 </div>
 )}
 </div>

  <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-background p-4">
 {comboResult.applied.map((a) => (
 <div key={a.comboId} className="flex items-center justify-between rounded-md bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
 <span>Combo: {a.name}{a.times > 1 ? ` ×${a.times}` : ''}</span>
 <span className="font-mono">-{formatPEN(a.discount)}</span>
 </div>
 ))}
 <div className="flex items-center justify-between">
 <span className="text-sm font-black uppercase tracking-widest text-foreground">
 Total a pagar
 </span>
 <span className="text-3xl font-black text-secondary-500 font-mono tracking-tighter">
 {formatPEN(total + playzoneTotal - comboResult.total)}
 </span>
 </div>

 <div className="flex gap-2">
 <Button
  variant="outline"
  className="flex-[0.35] h-14 border-border text-muted-foreground hover:bg-muted"
  onClick={handleCancel}
  aria-label="Cancelar orden"
  title="Cancelar orden"
  disabled={!hasCart}
 >
  <XCircle className="w-5 h-5" />
 </Button>
 <Button
  className="flex-1 h-14 bg-secondary-500 hover:bg-secondary-600 text-base font-black uppercase tracking-widest"
  disabled={!hasCart}
  onClick={tryCharge}
 >
  <CreditCard className="w-5 h-5 mr-2" />
  Cobrar
 </Button>
 </div>
 </div>
 </aside>

 <RightCheckoutDrawer
 open={checkoutOpen}
 onClose={() => setCheckoutOpen(false)}
 cart={items}
 playzoneCharges={playzoneCharges}
 onSaleComplete={handleSaleComplete}
 />
 </>
 )
}
