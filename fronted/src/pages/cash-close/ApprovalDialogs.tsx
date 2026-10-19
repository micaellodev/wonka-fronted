import { CheckCircle2, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PinPad } from '@/components/PinPad'
import { formatPEN } from '@/lib/format'

interface ApprovalProps {
  open: boolean
  onClose: () => void
  onPin: (pin: string) => void
  approving: boolean
  pinError: string | null
  totalDifference: number
}

export function ApprovalDialog({ open, onClose, onPin, approving, pinError, totalDifference }: ApprovalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !approving && onClose()}>
      <DialogContent size="md" showCloseButton={!approving}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" aria-hidden /> Aprobación de Cierre de Caja
          </DialogTitle>
          <DialogDescription>
            Ingrese el código de aprobación (6 dígitos) del administrador para confirmar el cierre.
          </DialogDescription>
        </DialogHeader>
        <p className="text-center text-sm font-semibold text-foreground">
          Diferencia total: {totalDifference >= 0 ? '+ ' : ''}{formatPEN(totalDifference)}
        </p>
        <PinPad onComplete={onPin} disabled={approving} hasError={!!pinError} length={6} />
        {pinError && <p role="alert" className="text-center text-xs font-medium text-destructive">{pinError}</p>}
        {approving && (
          <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Aprobando" /></div>
        )}
        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={onClose} disabled={approving}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CloseSuccessDialog({ open }: { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent size="sm" showCloseButton={false} className="items-center text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </div>
        <DialogTitle>Cierre de Caja Aprobado</DialogTitle>
        <DialogDescription>El turno ha finalizado exitosamente. Redirigiendo...</DialogDescription>
      </DialogContent>
    </Dialog>
  )
}
