import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatShiftTimeString, type ShiftItem } from './helpers'

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={cn('flex justify-between', bold && 'font-bold')}>
      <span className={bold ? undefined : 'text-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function ShiftVoucherDialog({ shift, onClose }: { shift: ShiftItem | null; onClose: () => void }) {
  const r = shift?.rawRecord
  return (
    <Dialog open={!!shift} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" aria-hidden /> Comprobante de Cierre de Turno
          </DialogTitle>
        </DialogHeader>
        {shift && (
          <div id="printable-shift-voucher" className="space-y-4 rounded-xl border border-border bg-muted p-4 font-mono text-xs text-foreground">
            <div className="border-b border-dashed border-border pb-3 text-center">
              <p className="text-sm font-bold uppercase">WONKA POS</p>
              <p className="text-[11px] text-muted-foreground">CIERRE Y ARQUEO DE CAJA</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatShiftTimeString(shift.startTime, shift.isEnCurso, shift.endTime)}</p>
            </div>

            <div className="space-y-1.5">
              <Row label="Caja:" value={<span className="font-semibold">{shift.cajeroApertura}</span>} />
              <Row label="Cajero Cierre:" value={<span className="font-semibold">{shift.cajeroCierre || 'En Curso'}</span>} />
              <Row label="Estado:" value={<span className="font-semibold">{shift.isEnCurso ? 'ABIERTA' : r?.status === 'APPROVED' ? 'CERRADA' : 'PENDIENTE'}</span>} />
            </div>

            {r && (
              <div className="space-y-1 border-t border-dashed border-border pt-2">
                <Row label="Apertura:" value={formatPEN(r.openingBalance)} />
                <Row label="Ventas totales:" value={formatPEN(r.totalSales)} />
                <Row label="Efectivo esperado:" value={formatPEN(r.expectedEfectivo)} />
                <Row label="Ventas Yape:" value={formatPEN(r.expectedYape)} />
                <Row label="Ventas Tarjeta:" value={formatPEN(r.expectedTarjeta)} />
                <div className="border-t border-border pt-1">
                  <Row bold label="Total Esperado:" value={formatPEN(r.totalExpected)} />
                </div>
                <Row bold label="Total Contado:" value={formatPEN(r.countedCash)} />
                <Row
                  label="Diferencia:"
                  value={
                    <span className={cn('font-bold', r.difference === 0 ? 'text-success' : r.difference > 0 ? 'text-info' : 'text-destructive')}>
                      {formatPEN(r.difference)}
                    </span>
                  }
                />
              </div>
            )}

            <div className="border-t border-dashed border-border pt-2 text-sm">
              <Row bold label="MONTO TOTAL:" value={formatPEN(shift.montoSoles)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
