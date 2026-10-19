import { useState } from 'react'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatDateKey, formatLongDate, fromDateKey } from './helpers'

export type FilterType = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'
export type DateRange = { start: Date; end: Date }

const QUICK: { type: Exclude<FilterType, 'custom'>; label: string }[] = [
  { type: 'today', label: 'Hoy' },
  { type: 'yesterday', label: 'Ayer' },
  { type: 'last7', label: 'Últimos 7 días' },
  { type: 'last30', label: 'Últimos 30 días' },
]

interface Props {
  filterType: FilterType
  dateRange: DateRange
  onQuick: (t: Exclude<FilterType, 'custom'>) => void
  onCustom: (r: DateRange) => void
}

export function DateFilters({ filterType, dateRange, onQuick, onCustom }: Props) {
  const [open, setOpen] = useState(false)
  const label = `${formatLongDate(dateRange.start)} ~ ${formatLongDate(dateRange.end)}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      {QUICK.map((q) => (
        <button
          key={q.type}
          aria-pressed={filterType === q.type}
          onClick={() => {
            setOpen(false)
            onQuick(q.type)
          }}
          className={cn(
            'h-9 select-none rounded-lg border px-3.5 text-xs md:text-sm',
            filterType === q.type ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border bg-card text-foreground hover:bg-muted'
          )}
        >
          {q.label}
        </button>
      ))}

      <div className="relative w-full sm:w-72">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-9 w-full select-none items-center justify-between rounded-lg border border-border bg-card px-3.5 text-xs text-foreground hover:bg-muted"
        >
          <span className="truncate">{label}</span>
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-2 w-full min-w-64 rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-bold text-foreground">Rango personalizado</span>
              <button onClick={() => setOpen(false)} aria-label="Cerrar selector de fechas" className="p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="rep-from" className="mb-1 block text-[11px] text-muted-foreground">Fecha inicio</Label>
                <Input
                  id="rep-from"
                  type="date"
                  value={formatDateKey(dateRange.start)}
                  onChange={(e) => e.target.value && onCustom({ ...dateRange, start: fromDateKey(e.target.value) })}
                  className="h-9 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="rep-to" className="mb-1 block text-[11px] text-muted-foreground">Fecha fin</Label>
                <Input
                  id="rep-to"
                  type="date"
                  value={formatDateKey(dateRange.end)}
                  onChange={(e) => e.target.value && onCustom({ ...dateRange, end: fromDateKey(e.target.value) })}
                  className="h-9 px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
            <Button size="sm" className="mt-4 h-8 w-full bg-primary text-xs text-primary-foreground hover:bg-primary/90" onClick={() => setOpen(false)}>
              Aplicar
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
