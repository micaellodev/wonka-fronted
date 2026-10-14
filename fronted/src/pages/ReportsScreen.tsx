import { useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import {
  Banknote,
  DollarSign,
  ShoppingBag,
  Printer,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface CashCloseRecord {
  id: string
  openingBalance: number
  totalSales: number
  expectedEfectivo: number
  expectedYape: number
  expectedTarjeta: number
  expectedUnknown: number
  totalExpected: number
  countedCash: number
  difference: number
  status: string
  approvedByWorkerId?: string | null
  approvedAt?: string | null
  closedDate: string
  createdAt: string
  worker: {
    id: string
    name: string
  }
}

interface ShiftItem {
  id: string
  /** Lima business day (YYYY-MM-DD) used by the date filters */
  dateKey: string
  isEnCurso: boolean
  startTime: string
  endTime?: string
  cajeroApertura: string
  cajeroCierre: string
  montoSoles: number
  montoDolares: number
  rawRecord?: CashCloseRecord
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMonthName(date: Date) {
  const allMonths = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return allMonths[date.getMonth()]
}

function formatCurrencyPEN(v: number) {
  return `S/ ${Number(v || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatCurrencyUSD(v: number) {
  return `$${Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatLongDate(date: Date) {
  const m = getMonthName(date)
  const d = date.getDate()
  const y = date.getFullYear()
  return `${m} ${d}, ${y}`
}

/** YYYY-MM-DD of `date` in Lima (business timezone, same as the backend). */
function formatDateKey(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

/** Picker value (YYYY-MM-DD) as noon in Lima, so formatDateKey returns the same day anywhere. */
const fromDateKey = (val: string) => new Date(`${val}T12:00:00-05:00`)

interface ShiftSummary {
  date: string
  opening: { amount: number; openedAt: string; workerName: string } | null
  expected: { total: number }
  close: { id: string } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'


function formatShiftTimeString(startIso: string, isEnCurso: boolean, endIso?: string) {
  const start = new Date(startIso)
  const dd = String(start.getDate()).padStart(2, '0')
  const mm = String(start.getMonth() + 1).padStart(2, '0')
  const yyyy = start.getFullYear()
  const hh = String(start.getHours()).padStart(2, '0')
  const min = String(start.getMinutes()).padStart(2, '0')

  if (isEnCurso) {
    return `${dd}-${mm}-${yyyy} | ${hh}:${min} - En Curso`
  }

  if (endIso) {
    const end = new Date(endIso)
    const ehh = String(end.getHours()).padStart(2, '0')
    const emin = String(end.getMinutes()).padStart(2, '0')
    return `${dd}-${mm}-${yyyy} | ${hh}:${min} - ${ehh}:${emin}`
  }

  return `${dd}-${mm}-${yyyy} | ${hh}:${min} - Cerrado`
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ReportsScreen() {
  const { tenantId, activeWorker } = useAuthStore()

  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'last7' | 'last30' | 'custom'>('today')
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const today = new Date()
    return { start: today, end: today }
  })
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  const [loading, setLoading] = useState(true)
  const [closedRecords, setClosedRecords] = useState<CashCloseRecord[]>([])
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedShiftForPrint, setSelectedShiftForPrint] = useState<ShiftItem | null>(null)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  // Quick filter changes
  const applyFilter = (type: 'today' | 'yesterday' | 'last7' | 'last30') => {
    setFilterType(type)
    setShowCustomPicker(false)
    setPage(1)
    const now = new Date()

    if (type === 'today') {
      setDateRange({ start: now, end: now })
    } else if (type === 'yesterday') {
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      setDateRange({ start: yesterday, end: yesterday })
    } else if (type === 'last7') {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      setDateRange({ start, end: now })
    } else if (type === 'last30') {
      const start = new Date(now)
      start.setDate(start.getDate() - 30)
      setDateRange({ start, end: now })
    }
  }

  // Fetch closed cash reports & today's open sales
  const fetchData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      const [historyRes, summaryRes] = await Promise.all([
        api.cash.history.get({ query: { tenantId, days: 90 } }),
        api.cash.summary.get({ query: { tenantId } }),
      ])
      if (historyRes.error) throw historyRes.error
      if (summaryRes.error) throw summaryRes.error
      setClosedRecords((historyRes.data.data ?? []) as CashCloseRecord[])
      setShiftSummary(summaryRes.data.data as ShiftSummary)
    } catch (err) {
      setLoadError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Build unified shifts list (Active "En Curso" + Closed records)
  const allShifts = useMemo(() => {
    const items: ShiftItem[] = []

    // Today's shift while it has an opening and no close yet (totals from the backend)
    if (shiftSummary?.opening && !shiftSummary.close) {
      items.push({
        id: 'shift-current-open',
        dateKey: shiftSummary.date,
        isEnCurso: true,
        startTime: shiftSummary.opening.openedAt,
        cajeroApertura: shiftSummary.opening.workerName,
        cajeroCierre: '',
        montoSoles: shiftSummary.expected.total,
        montoDolares: 0,
      })
    }

    // Add closed records
    for (const r of closedRecords) {
      items.push({
        id: r.id,
        dateKey: r.closedDate,
        isEnCurso: false,
        startTime: r.createdAt,
        endTime: r.approvedAt || r.createdAt,
        cajeroApertura: `Caja Principal`,
        cajeroCierre: r.worker?.name || activeWorker?.name || 'Cajero',
        montoSoles: Number(r.countedCash || r.totalExpected || 0),
        montoDolares: 0,
        rawRecord: r,
      })
    }

    return items
  }, [shiftSummary, closedRecords, activeWorker?.name])

  // Filter shifts by date range
  const filteredShifts = useMemo(() => {
    const startStr = formatDateKey(dateRange.start)
    const endStr = formatDateKey(dateRange.end)

    return allShifts.filter((s) => s.dateKey >= startStr && s.dateKey <= endStr)
  }, [allShifts, dateRange])

  // KPI Calculations
  const totalSoles = useMemo(
    () => filteredShifts.reduce((sum, s) => sum + s.montoSoles, 0),
    [filteredShifts]
  )
  const totalDolares = useMemo(
    () => filteredShifts.reduce((sum, s) => sum + s.montoDolares, 0),
    [filteredShifts]
  )
  const cantidadCierres = filteredShifts.length

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize))
  const paginatedShifts = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredShifts.slice(start, start + pageSize)
  }, [filteredShifts, page, pageSize])

  const startIndex = filteredShifts.length === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, filteredShifts.length)

  // Date range label
  const dateRangeLabel = `${formatLongDate(dateRange.start)} ~ ${formatLongDate(dateRange.end)}`

  return (
    <TerminalShell activeSection="reports">
      <div className="flex min-h-full flex-col bg-muted text-foreground p-4 md:p-8">
        {/* ── Top Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Reporte de cierre de turno
          </h1>

          {/* Filters on top right */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyFilter('today')}
              className={`h-9 px-3.5 text-xs md:text-sm rounded-lg border select-none ${
                filterType === 'today'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => applyFilter('yesterday')}
              className={`h-9 px-3.5 text-xs md:text-sm rounded-lg border select-none ${
                filterType === 'yesterday'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => applyFilter('last7')}
              className={`h-9 px-3.5 text-xs md:text-sm rounded-lg border select-none ${
                filterType === 'last7'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Últimos 7 días
            </button>
            <button
              onClick={() => applyFilter('last30')}
              className={`h-9 px-3.5 text-xs md:text-sm rounded-lg border select-none ${
                filterType === 'last30'
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              Últimos 30 días
            </button>

            {/* Date range display with fixed width to eliminate layout shift */}
            <div className="relative">
              <button
                onClick={() => setShowCustomPicker((v) => !v)}
                className="flex h-9 w-[285px] items-center justify-between rounded-lg border border-border bg-card px-3.5 text-xs text-foreground hover:bg-muted select-none"
              >
                <span className="truncate">{dateRangeLabel}</span>
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
              </button>

              {/* Custom Date Picker Dropdown */}
              {showCustomPicker && (
                <div className="absolute right-0 mt-2 z-30 w-72 rounded-xl border border-border bg-card p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-border mb-3">
                    <span className="text-xs font-bold text-foreground">Rango personalizado</span>
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      className="text-muted-foreground hover:text-muted-foreground p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Fecha inicio
                      </label>
                      <input
                        type="date"
                        value={formatDateKey(dateRange.start)}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            setDateRange((prev) => ({
                              ...prev,
                              start: fromDateKey(val),
                            }))
                            setFilterType('custom')
                          }
                        }}
                        className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Fecha fin
                      </label>
                      <input
                        type="date"
                        value={formatDateKey(dateRange.end)}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            setDateRange((prev) => ({
                              ...prev,
                              end: fromDateKey(val),
                            }))
                            setFilterType('custom')
                          }
                        }}
                        className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white text-xs h-8"
                    onClick={() => setShowCustomPicker(false)}
                  >
                    Aplicar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3 Summary KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Card 1: Total en soles */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="rounded-lg bg-muted p-3 text-muted-foreground shrink-0">
              <Banknote className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total de caja en soles</p>
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {formatCurrencyPEN(totalSoles)}
              </p>
            </div>
          </div>

          {/* Card 2: Total en dólares */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="rounded-lg bg-muted p-3 text-muted-foreground shrink-0">
              <DollarSign className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total de caja en dólares</p>
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {formatCurrencyUSD(totalDolares)}
              </p>
            </div>
          </div>

          {/* Card 3: Cantidad de cierres */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="rounded-lg bg-muted p-3 text-muted-foreground shrink-0">
              <ShoppingBag className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Cantidad de cierres</p>
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {cantidadCierres}
              </p>
            </div>
          </div>
        </div>

        {/* ── Table Container ── */}
        <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto min-h-[260px] flex flex-col justify-between">
            <table className="w-full text-left text-sm table-fixed">
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
                  <th className="py-4 px-6 font-semibold text-foreground text-xs">Hora</th>
                  <th className="py-4 px-6 font-semibold text-foreground text-xs">
                    Cajero apertura
                  </th>
                  <th className="py-4 px-6 font-semibold text-foreground text-xs">
                    Cajero cierre
                  </th>
                  <th className="py-4 px-6 font-semibold text-foreground text-xs">Monto S/</th>
                  <th className="py-4 px-6 font-semibold text-foreground text-xs">Monto $</th>
                  <th className="py-4 px-6 font-semibold text-foreground text-xs text-center">
                    Imprimir
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-muted-foreground text-sm">
                      Cargando registros...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-red-600 text-sm">
                      No se pudieron cargar los cierres: {loadError}{' '}
                      <button className="underline" onClick={fetchData}>Reintentar</button>
                    </td>
                  </tr>
                ) : paginatedShifts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-muted-foreground text-sm">
                      Sin cierres de turno en el periodo seleccionado
                    </td>
                  </tr>
                ) : (
                  paginatedShifts.map((shift) => (
                    <tr key={shift.id} className="hover:bg-muted transition-colors h-14">
                      <td className="py-3 px-6 text-xs text-foreground font-normal truncate">
                        {formatShiftTimeString(shift.startTime, shift.isEnCurso, shift.endTime)}
                      </td>
                      <td className="py-3 px-6 text-xs text-foreground font-normal truncate">
                        {shift.cajeroApertura}
                      </td>
                      <td className="py-3 px-6 text-xs text-foreground font-normal truncate">
                        {shift.cajeroCierre || ''}
                      </td>
                      <td className="py-3 px-6 text-xs text-foreground font-normal">
                        {formatCurrencyPEN(shift.montoSoles)}
                      </td>
                      <td className="py-3 px-6 text-xs text-foreground font-normal">
                        {formatCurrencyUSD(shift.montoDolares)}
                      </td>
                      <td className="py-3 px-6 text-center">
                        <button
                          onClick={() => setSelectedShiftForPrint(shift)}
                          className="inline-flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                          title="Imprimir reporte de cierre"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Table Footer / Pagination ── */}
          <div className="flex items-center justify-end gap-6 border-t border-border px-6 py-3.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Artículo por página</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <span>
              {filteredShifts.length === 0 ? '0 - 0 de 0' : `${startIndex} - ${endIndex} de ${filteredShifts.length}`}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent text-muted-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent text-muted-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Print Voucher Modal ── */}
        {selectedShiftForPrint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border">
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5 text-foreground" />
                  <h2 className="text-base font-bold text-foreground">
                    Comprobante de Cierre de Turno
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedShiftForPrint(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Receipt Preview */}
              <div
                id="printable-shift-voucher"
                className="space-y-4 rounded-xl border border-border bg-muted p-4 text-xs font-mono text-foreground"
              >
                <div className="text-center border-b border-dashed border-border pb-3">
                  <p className="font-bold text-sm text-foreground uppercase">WONKA POS</p>
                  <p className="text-[10px] text-muted-foreground">CIERRE Y ARQUEO DE CAJA</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatShiftTimeString(
                      selectedShiftForPrint.startTime,
                      selectedShiftForPrint.isEnCurso,
                      selectedShiftForPrint.endTime
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-semibold">{selectedShiftForPrint.cajeroApertura}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cajero Cierre:</span>
                    <span className="font-semibold">
                      {selectedShiftForPrint.cajeroCierre || 'En Curso'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estado:</span>
                    <span className="font-semibold">
                      {selectedShiftForPrint.isEnCurso ? 'EN CURSO' : 'CERRADO'}
                    </span>
                  </div>
                </div>

                {selectedShiftForPrint.rawRecord && (
                  <div className="border-t border-dashed border-border pt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Apertura:</span>
                      <span>{formatCurrencyPEN(selectedShiftForPrint.rawRecord.openingBalance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas totales:</span>
                      <span>{formatCurrencyPEN(selectedShiftForPrint.rawRecord.totalSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Efectivo esperado:</span>
                      <span>
                        {formatCurrencyPEN(selectedShiftForPrint.rawRecord.expectedEfectivo)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas Yape:</span>
                      <span>{formatCurrencyPEN(selectedShiftForPrint.rawRecord.expectedYape)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas Tarjeta:</span>
                      <span>
                        {formatCurrencyPEN(selectedShiftForPrint.rawRecord.expectedTarjeta)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1 font-bold">
                      <span>Total Esperado:</span>
                      <span>{formatCurrencyPEN(selectedShiftForPrint.rawRecord.totalExpected)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>Total Contado:</span>
                      <span>{formatCurrencyPEN(selectedShiftForPrint.rawRecord.countedCash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Diferencia:</span>
                      <span
                        className={
                          selectedShiftForPrint.rawRecord.difference === 0
                            ? 'text-success font-bold'
                            : selectedShiftForPrint.rawRecord.difference > 0
                            ? 'text-info font-bold'
                            : 'text-red-600 font-bold'
                        }
                      >
                        {formatCurrencyPEN(selectedShiftForPrint.rawRecord.difference)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="border-t border-dashed border-border pt-2 flex justify-between font-bold text-sm">
                  <span>MONTO TOTAL:</span>
                  <span>{formatCurrencyPEN(selectedShiftForPrint.montoSoles)}</span>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedShiftForPrint(null)}
                >
                  Cerrar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5"
                  onClick={() => {
                    window.print()
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TerminalShell>
  )
}
