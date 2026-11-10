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

const SUNAT: Record<string, [string, string]> = {
  ACEPTADA: ['SUNAT ✓', 'bg-success-soft text-success'],
  RECHAZADA: ['SUNAT rechazó', 'bg-danger-soft text-destructive'],
  PENDING_SUNAT: ['SUNAT pendiente', 'bg-warning-soft text-warning'],
  ENVIANDO: ['SUNAT pendiente', 'bg-warning-soft text-warning'],
}

/** Estado de envío a SUNAT de una boleta/factura; los tickets no se envían. */
export function SunatPill({ tipo, sunatStatus, className }: { tipo: string; sunatStatus?: string | null; className?: string }) {
  if (tipo === 'TICKET') return null
  const [text, color] = SUNAT[sunatStatus ?? 'PENDING_SUNAT'] ?? SUNAT['PENDING_SUNAT']!
  return <span className={cn('inline-block select-none rounded-full px-3 py-0.5 text-[11px] font-semibold', color, className)}>{text}</span>
}
