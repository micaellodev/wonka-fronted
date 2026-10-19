import type { ReactNode } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ErrorBox({ message }: { message: string }) {
 if (!message) return null
 return <p role="alert" data-testid="form-error" className="rounded-md border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">{message}</p>
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
 return (
  <label className={cn('block', className)}>
   <span className="mb-1.5 block text-sm font-semibold text-foreground">{label}</span>
   {children}
   {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
  </label>
 )
}

export function Modal({ title, subtitle, onClose, children, wide, testId }: {
 title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; testId: string
}) {
 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
   <div role="dialog" aria-modal="true" aria-label={title} data-testid={testId}
    className={cn('flex max-h-[92vh] w-full flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
    <div className="flex items-start justify-between gap-3">
     <div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
     </div>
     <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={onClose} data-testid={`${testId}-close`}><X /></Button>
    </div>
    {children}
   </div>
  </div>
 )
}

export function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
 return (
  <div role="alert" data-testid="load-error" className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">
   <span>{message}</span>
   <Button size="sm" variant="outline" onClick={onRetry} data-testid="retry">Reintentar</Button>
  </div>
 )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
 return (
  <div className="space-y-2 p-4" data-testid="skeleton">
   {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
  </div>
 )
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
 const pages = Math.max(1, Math.ceil(total / limit))
 return (
  <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground" data-testid="pager">
   <span data-testid="pager-total">{total} {total === 1 ? 'resultado' : 'resultados'}</span>
   <div className="flex items-center gap-2">
    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior" data-testid="pager-prev"><ChevronLeft /></Button>
    <span data-testid="pager-page">Página {page} de {pages}</span>
    <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Página siguiente" data-testid="pager-next"><ChevronRight /></Button>
   </div>
  </div>
 )
}

export function ConfirmModal({ title, message, confirmLabel, destructive, busy, error, onConfirm, onClose }: {
 title: string; message: string; confirmLabel: string; destructive?: boolean; busy: boolean; error?: string
 onConfirm: () => void; onClose: () => void
}) {
 return (
  <Modal title={title} onClose={onClose} testId="confirm-modal">
   <p className="text-sm text-muted-foreground">{message}</p>
   <ErrorBox message={error ?? ''} />
   <div className="flex justify-end gap-2">
    <Button variant="secondary" onClick={onClose} disabled={busy} data-testid="confirm-cancel">Cancelar</Button>
    <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy} data-testid="confirm-ok">
     {busy ? 'Procesando...' : confirmLabel}
    </Button>
   </div>
  </Modal>
 )
}

