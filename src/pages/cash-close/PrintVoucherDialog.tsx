import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  companyTitle: string
  companyLegal: string
  openingTime: string
  cashier: string
  opening: number
  salesEfectivo: number
  salesYape: number
  salesTarjeta: number
  totalNet: number
  expected: number
  counted: number
  diff: number
}

export function PrintVoucherDialog(p: Props) {
  const row = (label: string, value: number, strong = false) => (
    <div className={cn('flex justify-between', strong && 'font-bold')}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className={strong ? undefined : 'font-semibold'}>{formatPEN(value)}</span>
    </div>
  )
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" aria-hidden /> Reporte de Cierre de Caja
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 rounded-xl border border-border bg-muted p-4 font-mono text-xs text-foreground">
          <div className="border-b border-dashed border-border pb-3 text-center">
            <p className="text-sm font-bold uppercase">{p.companyTitle}</p>
            <p className="text-[11px] uppercase text-muted-foreground">{p.companyLegal}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">APERTURA: {p.openingTime}</p>
            <p className="text-[11px] text-muted-foreground">CAJERO: {p.cashier}</p>
          </div>
          <div className="space-y-1.5">
            {row('Apertura Inicial:', p.opening)}
            {row('Ventas Efectivo:', p.salesEfectivo)}
            {row('Ventas Yape:', p.salesYape)}
            {row('Ventas Tarjeta:', p.salesTarjeta)}
            <div className="border-t border-dashed border-border pt-1.5">{row('Total Ventas Neto:', p.totalNet, true)}</div>
            {row('Total Esperado Efectivo:', p.expected, true)}
            {row('Efectivo Contado:', p.counted)}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diferencia Efectivo:</span>
              <span className={cn('font-bold', p.diff >= 0 ? 'text-success' : 'text-destructive')}>{formatPEN(p.diff)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={p.onClose}>Cerrar</Button>
          <Button className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
