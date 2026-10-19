import { useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatPEN } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useCashStatusStore } from '@/store/cashStatusStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Banknote, DollarSign, ShoppingBag, Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { DateFilters, type DateRange, type FilterType } from './reports/DateFilters'
import { ShiftVoucherDialog } from './reports/ShiftVoucherDialog'
import { formatCurrencyUSD, formatDateKey, formatShiftTimeString, type CashCloseRecord, type ShiftItem } from './reports/helpers'
import { ExportButtons } from '@/components/ExportButtons'

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="shrink-0 rounded-lg bg-muted p-3 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
      </div>
    </div>
  )
}

export function ReportsScreen() {
  const { tenantId, activeWorker } = useAuthStore()
  // Today's open shift comes from the shared cash store (no own /cash/summary fetch).
  const shiftSummary = useCashStatusStore((s) => s.summary)

  const [filterType, setFilterType] = useState<FilterType>('today')
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date()
    return { start: today, end: today }
  })

  const [loading, setLoading] = useState(true)
  const [closedRecords, setClosedRecords] = useState<CashCloseRecord[]>([])
  const [closedTotal, setClosedTotal] = useState(0)
  const [closedUsd, setClosedUsd] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedShiftForPrint, setSelectedShiftForPrint] = useState<ShiftItem | null>(null)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const applyFilter = (type: 'today' | 'yesterday' | 'last7' | 'last30') => {
    setFilterType(type)
    setPage(1)
    const now = new Date()
    const back = (days: number) => {
      const d = new Date(now)
      d.setDate(d.getDate() - days)
      return d
    }
    if (type === 'today') setDateRange({ start: now, end: now })
    else if (type === 'yesterday') setDateRange({ start: back(1), end: back(1) })
    else setDateRange({ start: back(type === 'last7' ? 7 : 30), end: now })
  }

  const fetchData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      const historyRes = await api.cash.history.get({
        query: { tenantId, days: 90, from: formatDateKey(dateRange.start), to: formatDateKey(dateRange.end) },
      })
      if (historyRes.error) throw historyRes.error
      setClosedRecords((historyRes.data.data ?? []) as CashCloseRecord[])
      const t = (historyRes.data as unknown as { totals: { countedCash: number; usd: number } }).totals
      setClosedTotal(t.countedCash)
      setClosedUsd(t.usd)
      void useCashStatusStore.getState().refresh(tenantId)
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Error de conexión'))
    } finally {
      setLoading(false)
    }
  }, [tenantId, dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Unified shifts list (Active "En Curso" + Closed records)
  const allShifts = useMemo(() => {
    const items: ShiftItem[] = []
    // Today's shift while it has an opening and no close yet (totals from the backend)
    if (shiftSummary?.opening && !shiftSummary.close) {
      items.push({
        id: 'shift-current-open',
        dateKey: shiftSummary.date,
        isEnCurso: true,
        startTime: shiftSummary.opening.at,
        cajeroApertura: shiftSummary.opening.workerName,
        cajeroCierre: '',
        montoSoles: shiftSummary.expectedTotal,
        montoDolares: shiftSummary.shift.movements.inUSD - shiftSummary.shift.movements.outUSD,
      })
    }
    for (const r of closedRecords) {
      items.push({
        id: r.id,
        dateKey: r.closedDate,
        isEnCurso: false,
        startTime: r.createdAt,
        endTime: r.approvedAt || r.createdAt,
        cajeroApertura: '—', // the close record does not store who opened
        cajeroCierre: r.worker?.name ?? '—',
        montoSoles: Number(r.countedCash || r.totalExpected || 0),
        montoDolares: r.usd,
        rawRecord: r,
      })
    }
    return items
  }, [shiftSummary, closedRecords, activeWorker?.name])

  const filteredShifts = useMemo(() => {
    const startStr = formatDateKey(dateRange.start)
    const endStr = formatDateKey(dateRange.end)
    return allShifts.filter((s) => s.dateKey >= startStr && s.dateKey <= endStr)
  }, [allShifts, dateRange])

  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize))
  const paginatedShifts = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredShifts.slice(start, start + pageSize)
  }, [filteredShifts, page, pageSize])

  const startIndex = filteredShifts.length === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, filteredShifts.length)

  const th = 'px-6 py-4 text-xs font-semibold text-foreground'
  const td = 'px-6 py-3 text-xs font-normal text-foreground'
  const pagerBtn = 'rounded p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <TerminalShell activeSection="reports">
      <div className="flex min-h-full flex-col bg-muted p-4 text-foreground md:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reporte de cierre de turno</h1>
          <ExportButtons name="cierres-turno" disabled={loading || filteredShifts.length === 0} getRows={() => [
            ['Fecha', 'Hora', 'Cajero apertura', 'Cajero cierre', 'Monto S/', 'Monto $'],
            ...filteredShifts.map((x) => [x.dateKey, formatShiftTimeString(x.startTime, x.isEnCurso, x.endTime), x.cajeroApertura, x.cajeroCierre || '', Number(x.montoSoles), Number(x.montoDolares)]),
          ]} />
          <DateFilters
            filterType={filterType}
            dateRange={dateRange}
            onQuick={applyFilter}
            onCustom={(r) => {
              setDateRange(r)
              setFilterType('custom')
            }}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Kpi icon={<Banknote className="h-6 w-6 stroke-[1.5]" aria-hidden />} label="Total de caja en soles" value={formatPEN(closedTotal)} />
          <Kpi icon={<DollarSign className="h-6 w-6 stroke-[1.5]" aria-hidden />} label="Total de caja en dólares" value={formatCurrencyUSD(closedUsd)} />
          <Kpi icon={<ShoppingBag className="h-6 w-6 stroke-[1.5]" aria-hidden />} label="Cantidad de cierres" value={filteredShifts.length} />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="flex min-h-[260px] flex-col justify-between overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[24%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className={th}>Hora</th>
                  <th className={th}>Cajero apertura</th>
                  <th className={th}>Cajero cierre</th>
                  <th className={th}>Monto S/</th>
                  <th className={th}>Monto $</th>
                  <th className={`${th} text-center`}>Imprimir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="py-20 text-center text-sm text-muted-foreground">Cargando registros...</td></tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={6} role="alert" className="py-20 text-center text-sm text-destructive">
                      No se pudieron cargar los cierres: {loadError}{' '}
                      <button className="underline" onClick={fetchData}>Reintentar</button>
                    </td>
                  </tr>
                ) : paginatedShifts.length === 0 ? (
                  <tr><td colSpan={6} className="py-20 text-center text-sm text-muted-foreground">Sin cierres de turno en el periodo seleccionado</td></tr>
                ) : (
                  paginatedShifts.map((shift) => (
                    <tr key={shift.id} className="h-14 transition-colors hover:bg-muted">
                      <td className={`${td} truncate`}>{formatShiftTimeString(shift.startTime, shift.isEnCurso, shift.endTime)}</td>
                      <td className={`${td} truncate`}>{shift.cajeroApertura}</td>
                      <td className={`${td} truncate`}>{shift.cajeroCierre || ''}</td>
                      <td className={td}>{formatPEN(shift.montoSoles)}</td>
                      <td className={td}>{formatCurrencyUSD(shift.montoDolares)}</td>
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={() => setSelectedShiftForPrint(shift)}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Imprimir reporte de cierre"
                          title="Imprimir reporte de cierre"
                        >
                          <Printer className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t border-border px-6 py-3.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Label htmlFor="rep-page-size" className="text-xs font-normal text-muted-foreground">Artículo por página</Label>
              <Select
                id="rep-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="h-8 w-auto px-2 py-1 text-xs"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </Select>
            </div>
            <span>{filteredShifts.length === 0 ? '0 - 0 de 0' : `${startIndex} - ${endIndex} de ${filteredShifts.length}`}</span>
            <div className="flex items-center gap-1">
              <button aria-label="Página anterior" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={pagerBtn}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button aria-label="Página siguiente" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={pagerBtn}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <ShiftVoucherDialog shift={selectedShiftForPrint} onClose={() => setSelectedShiftForPrint(null)} />
      </div>
    </TerminalShell>
  )
}
