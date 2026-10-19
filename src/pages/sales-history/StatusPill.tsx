import { cn } from '@/lib/utils'

/** Emitido / Anulado pill; clickable when `onClick` is given. */
export function StatusPill({ cancelled, onClick, className }: { cancelled: boolean; onClick?: () => void; className?: string }) {
  const cls = cn(
    'inline-block select-none rounded-full px-3 py-0.5 text-[11px] font-semibold',
    cancelled ? 'bg-danger-soft text-destructive' : 'bg-success-soft text-success',
    onClick && 'cursor-pointer transition-opacity hover:opacity-80',
    className
  )
  const text = cancelled ? 'Anulado' : 'Emitido'
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} aria-label={`${text}: ver detalle`}>
      {text}
    </button>
  ) : (
    <span className={cls}>{text}</span>
  )
}
