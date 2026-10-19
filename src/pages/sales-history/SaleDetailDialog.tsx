import { Banknote, DollarSign, Calendar as CalendarIcon, FileText, Loader2, Printer, User } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { formatPEN } from '@/lib/format'
import { StatusPill } from './StatusPill'
import { formatTableDateTime, getCorrelativo, getDocumentTypeLabel, getPaymentMethodLabel, printReceipt, type Sale } from './helpers'

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 rounded-lg border border-border bg-card p-2 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  )
}

export function SaleDetailDialog({ sale, loading, onClose, onVoid }: {
  sale: Sale | null
  loading: boolean
  onClose: () => void
  onVoid: (s: Sale) => void
}) {
  const icon = 'h-4 w-4 stroke-[1.5]'
  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" className="gap-0 p-0">
        {sale && (
          <>
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-6 py-4 pr-12">
              <div>
                <DialogTitle className="text-lg font-bold">
                  {getDocumentTypeLabel(sale.tipoComprobante)} {getCorrelativo(sale)}
                </DialogTitle>
                <DialogDescription className="sr-only">Detalle de la venta</DialogDescription>
                <StatusPill cancelled={sale.status === 'CANCELLED'} className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printReceipt(sale)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimir boleta
                </button>
                {sale.status !== 'CANCELLED' && (
                  <button
                    onClick={() => onVoid(sale)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                  >
                    Anular con nota de crédito
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6 p-6">
              {loading && (
                <div className="flex items-center justify-center py-8" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                  <span className="ml-2 text-xs text-muted-foreground">Cargando detalle...</span>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-sm font-bold">Información de la venta</h3>
                <div className="rounded-xl border border-border bg-muted/50 p-5">
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                    <Info icon={<Banknote className={icon} aria-hidden />} label="Monto" value={formatPEN(sale.total)} />
                    <Info icon={<FileText className={icon} aria-hidden />} label="Tipo de documento" value={getDocumentTypeLabel(sale.tipoComprobante)} />
                    <Info icon={<CalendarIcon className={icon} aria-hidden />} label="Fecha de venta" value={formatTableDateTime(sale.createdAt)} />
                    <Info icon={<User className={icon} aria-hidden />} label="Cliente" value={sale.clientName || 'No registrado'} />
                    <Info icon={<User className={icon} aria-hidden />} label="Cajero" value={sale.worker.name} />
                  </div>
                </div>
              </div>

              {sale.items && sale.items.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-bold">Productos</h3>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted font-semibold text-muted-foreground">
                          <th className="px-5 py-2.5">Cantidad</th>
                          <th className="px-5 py-2.5">Producto</th>
                          <th className="px-5 py-2.5">Precio unitario</th>
                          <th className="px-5 py-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-foreground">
                        {sale.items.map((item, idx) => (
                          <tr key={`${item.product?.sku ?? ''}-${idx}`} className="hover:bg-muted/50">
                            <td className="px-5 py-2.5">{item.qty}</td>
                            <td className="px-5 py-2.5 font-medium">{item.product.name}</td>
                            <td className="px-5 py-2.5">{formatPEN(Number(item.unitPrice))}</td>
                            <td className="px-5 py-2.5 text-right font-semibold">{formatPEN(Number(item.unitPrice) * item.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-sm font-bold">Detalle del pago</h3>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-5">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Pago #1</p>
                    <div className="mt-1 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <div>
                        <p className="text-[11px] text-muted-foreground">Medio de pago</p>
                        <p className="text-sm font-bold">{getPaymentMethodLabel(sale.paymentMethod)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Monto total recibido</p>
                    <p className="text-lg font-black">{formatPEN(sale.total)}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
