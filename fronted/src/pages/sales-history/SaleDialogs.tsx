import { Printer, Mail, Ban, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatPEN } from '@/lib/format'
import { formatTableDateTime, getCorrelativo, getDocumentTypeLabel, getPaymentMethodLabel, printReceipt, type Sale } from './helpers'

const closeOn = (fn: () => void, busy = false) => (o: boolean) => {
  if (!o && !busy) fn()
}

export function PrintDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  return (
    <Dialog open={!!sale} onOpenChange={closeOn(onClose)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" aria-hidden /> Comprobante de Venta
          </DialogTitle>
        </DialogHeader>
        {sale && (
          <div className="space-y-4 rounded-xl border border-border bg-muted p-4 font-mono text-xs text-foreground">
            <div className="border-b border-dashed border-border pb-3 text-center">
              <p className="text-sm font-bold uppercase">WONKA POS</p>
              <p className="text-[11px] uppercase text-muted-foreground">
                {getDocumentTypeLabel(sale.tipoComprobante)} {getCorrelativo(sale)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatTableDateTime(sale.createdAt)}</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-semibold">{sale.clientName || 'CLIENTE VARIOS'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Método de pago:</span><span className="font-semibold">{getPaymentMethodLabel(sale.paymentMethod)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estado:</span><span className="font-semibold">{sale.status === 'CANCELLED' ? 'ANULADO' : 'EMITIDO'}</span></div>
              <div className="flex justify-between border-t border-dashed border-border pt-2 text-sm font-bold"><span>TOTAL:</span><span>{formatPEN(sale.total)}</span></div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button className="gap-1.5 bg-success text-success-foreground hover:bg-success/90" onClick={() => sale && printReceipt(sale)}>
            <Printer className="h-4 w-4" aria-hidden /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VoidDialog({ sale, reason, onReason, error, submitting, onConfirm, onClose }: {
  sale: Sale | null
  reason: string
  onReason: (v: string) => void
  error: string | null
  submitting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={!!sale} onOpenChange={closeOn(onClose, submitting)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" aria-hidden /> Anular Venta / Nota de Crédito
          </DialogTitle>
        </DialogHeader>
        {sale && (
          <div className="space-y-3 text-xs">
            <div className="space-y-1 rounded-lg border border-border bg-muted p-3">
              <p className="font-semibold text-foreground">{getDocumentTypeLabel(sale.tipoComprobante)} {getCorrelativo(sale)}</p>
              <p className="text-muted-foreground">Monto: {formatPEN(sale.total)}</p>
              <p className="text-muted-foreground">Cliente: {sale.clientName || 'Sin cliente'}</p>
            </div>
            <div>
              <Label htmlFor="void-reason" className="mb-1 block text-xs font-semibold">Motivo de anulación *</Label>
              <Textarea
                id="void-reason"
                value={reason}
                onChange={(e) => onReason(e.target.value)}
                placeholder="Ej: Error en digitación del cliente o devolución de producto"
                rows={3}
                aria-invalid={!!error}
                className="resize-none p-2.5 text-xs"
              />
              {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button className="flex-1 bg-destructive font-bold text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm} disabled={!reason.trim() || submitting}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
            Confirmar Anulación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MailDialog({ sale, email, onEmail, sending, success, onSubmit, onClose }: {
  sale: Sale | null
  email: string
  onEmail: (v: string) => void
  sending: boolean
  success: boolean
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  return (
    <Dialog open={!!sale} onOpenChange={closeOn(onClose)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" aria-hidden /> Enviar Comprobante por Correo
          </DialogTitle>
        </DialogHeader>
        {sale && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="text-xs text-muted-foreground">
              <p>Comprobante: <span className="font-semibold text-foreground">{getCorrelativo(sale)}</span></p>
              <p>Total: <span className="font-semibold text-foreground">{formatPEN(sale.total)}</span></p>
            </div>
            <div>
              <Label htmlFor="mail-to" className="mb-1 block text-xs font-semibold">Correo electrónico del cliente</Label>
              <Input id="mail-to" type="email" required value={email} onChange={(e) => onEmail(e.target.value)} placeholder="cliente@ejemplo.com" className="text-xs" />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button type="submit" className="flex-1 bg-success font-bold text-success-foreground hover:bg-success/90" disabled={!email.trim() || success || sending}>
                {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : success ? <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden /> : <Mail className="mr-1.5 h-4 w-4" aria-hidden />}
                {sending ? 'Enviando...' : success ? 'Enviado' : 'Enviar Comprobante'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function GuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={closeOn(onClose)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-info" aria-hidden /> ¿Cómo realizar una nota de crédito?
          </DialogTitle>
          <DialogDescription className="sr-only">Pasos para anular un comprobante</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs text-muted-foreground">
          <p>Para emitir una <strong>Nota de Crédito</strong> o anular un comprobante electrónico:</p>
          <ol className="list-decimal space-y-2 pl-4">
            <li>Busque la venta en la tabla por número correlativo o nombre de cliente.</li>
            <li>
              En la columna <strong>Acciones</strong>, haga clic en el botón de prohibido/anular{' '}
              <Ban className="mx-0.5 inline h-3.5 w-3.5 text-destructive" aria-hidden />.
            </li>
            <li>Ingrese el motivo de la anulación (devolución total, error en RUC/DNI, etc.).</li>
            <li>El sistema registrará la nota de crédito y restablecerá el stock del inventario automáticamente.</li>
          </ol>
        </div>
        <DialogFooter>
          <Button className="w-full bg-success text-success-foreground hover:bg-success/90" onClick={onClose}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
