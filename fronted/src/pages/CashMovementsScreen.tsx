import { useEffect, useMemo, useState, useCallback } from 'react'
import { Eye, EyeOff, X, PlusCircle, MinusCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// ============================================================
// CashMovementsScreen — Cash Movements Ledger & Registration
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'

/** Today's date (YYYY-MM-DD) in Lima, the business timezone used by the backend. */
const limaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

interface ApiCashMovement {
  id: string
  tenantId: string
  workerId: string
  type: string
  amount: number
  currency: string
  reason: string
  createdAt: string
  worker: { id: string; name: string }
}

interface UnifiedMovement {
  id: string
  type: 'IN' | 'OUT'
  time: string
  reason: string
  amount: number
  currency: 'PEN' | 'USD'
  source: 'OPENING' | 'MANUAL'
}

function formatMovementDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  const day = d.getDate()
  const months = [
    'ene.',
    'feb.',
    'mar.',
    'abr.',
    'may.',
    'jun.',
    'jul.',
    'ago.',
    'set.',
    'oct.',
    'nov.',
    'dic.',
  ]
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year}, ${hours}:${mins}`
}

function formatPEN(val: number): string {
  return `S/ ${Number(val || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatUSD(val: number): string {
  return `$${Number(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function CashMovementsScreen() {
  const { tenantId, activeWorker } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ expectedCash: number; movements: { inUSD: number; outUSD: number } } | null>(null)
  const montoCajaSoles = summary?.expectedCash ?? 0
  const montoCajaDolares = summary ? summary.movements.inUSD - summary.movements.outUSD : 0
  const [apiMovements, setApiMovements] = useState<ApiCashMovement[]>([])

  // Visibility toggle for KPI balances
  const [showBalanceSoles, setShowBalanceSoles] = useState(true)
  const [showBalanceDolares, setShowBalanceDolares] = useState(true)

  // Modals for adding movement
  const [modalType, setModalType] = useState<'IN' | 'OUT' | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [reasonInput, setReasonInput] = useState('')
  const [currencyInput, setCurrencyInput] = useState<'PEN' | 'USD'>('PEN')
  const [savingMovement, setSavingMovement] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const todayStr = useMemo(limaToday, [])

  const fetchAll = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      // Cash sales come from the backend shift summary (today in Lima, all of them, no page limit)
      const [summaryRes, movementsRes] = await Promise.all([
        api.cash.summary.get({ query: { tenantId } }),
        api.cash.movements.get({ query: { tenantId, date: todayStr } }),
      ])
      if (summaryRes.error) throw summaryRes.error
      if (movementsRes.error) throw movementsRes.error
      setSummary(summaryRes.data.data as unknown as { expectedCash: number; movements: { inUSD: number; outUSD: number } })
      setApiMovements(movementsRes.data.data as ApiCashMovement[])
    } catch (err) {
      setLoadError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tenantId, todayStr])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Compile all unified movements
  const allMovements = useMemo(() => {
    const list: UnifiedMovement[] = []

    // 2. Opening + manual movements (persisted in the backend)
    for (const m of apiMovements) {
      list.push({
        id: m.id,
        type: m.type === 'OUT' ? 'OUT' : 'IN',
        time: m.createdAt,
        reason: m.type === 'OPENING' ? 'Apertura de caja' : m.reason,
        amount: Number(m.amount || 0),
        currency: m.currency as 'PEN' | 'USD',
        source: m.type === 'OPENING' ? 'OPENING' : 'MANUAL',
      })
    }

    // Sort newest first
    return list.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    )
  }, [apiMovements])

  // Pagination logic
  const totalItems = allMovements.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * pageSize
    return allMovements.slice(start, start + pageSize)
  }, [allMovements, page, pageSize])

  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, totalItems)

  const handleSaveMovement = async () => {
    const val = Math.round(parseFloat(amountInput) * 100) / 100
    if (!val || val <= 0 || !reasonInput.trim() || !modalType || !activeWorker) {
      return
    }
    setSavingMovement(true)
    setSaveError(null)
    try {
      const { error } = await api.cash.movements.post({
        tenantId,
        workerId: activeWorker.id,
        type: modalType,
        amount: val,
        currency: currencyInput,
        reason: reasonInput.trim(),
      })
      if (error) throw error
      setModalType(null)
      setAmountInput('')
      setReasonInput('')
      fetchAll()
    } catch (err) {
      setSaveError(apiErrorMessage(err))
    } finally {
      setSavingMovement(false)
    }
  }

  return (
    <TerminalShell activeSection="movimientos-caja">
      <div className="flex min-h-full flex-col bg-gray-50/50 p-4 md:p-8 text-gray-900">
        {/* ── Top Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
              Movimientos de caja
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              Registra tus movimientos de efectivo del día
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                setModalType('OUT')
                setSaveError(null)
                setCurrencyInput('PEN')
                setAmountInput('')
                setReasonInput('')
              }}
              className="bg-red-600 hover:bg-red-700 text-white h-10 px-5 text-xs font-bold tracking-wide shadow-2xs transition-colors"
            >
              Salida de dinero
            </Button>
            <Button
              onClick={() => {
                setModalType('IN')
                setSaveError(null)
                setCurrencyInput('PEN')
                setAmountInput('')
                setReasonInput('')
              }}
              className="bg-[#00c569] hover:bg-[#00b05e] text-white h-10 px-5 text-xs font-bold tracking-wide shadow-2xs transition-colors"
            >
              Ingreso de dinero
            </Button>
          </div>
        </div>

        {/* ── 2 Balance KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Card 1: Monto en caja en soles */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400">
                Monto en caja en soles
              </span>
              <button
                onClick={() => setShowBalanceSoles((v) => !v)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                title={showBalanceSoles ? 'Ocultar saldo' : 'Mostrar saldo'}
              >
                {showBalanceSoles ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              {showBalanceSoles ? formatPEN(montoCajaSoles) : 'S/ ••••••'}
            </p>
          </Card>

          {/* Card 2: Monto en caja en dólares */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400">
                Monto en caja en dólares
              </span>
              <button
                onClick={() => setShowBalanceDolares((v) => !v)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                title={showBalanceDolares ? 'Ocultar saldo' : 'Mostrar saldo'}
              >
                {showBalanceDolares ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              {showBalanceDolares ? formatUSD(montoCajaDolares) : '$••••••'}
            </p>
          </Card>
        </div>

        {/* ── Table Container ── */}
        <Card className="rounded-xl border border-gray-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto min-h-[300px] flex flex-col justify-between">
            <table className="w-full text-left text-xs table-fixed">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[25%]" />
                <col className="w-[45%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-white text-gray-700 font-semibold">
                  <th className="py-4 px-6">Tipo</th>
                  <th className="py-4 px-6">Hora</th>
                  <th className="py-4 px-6">Motivo</th>
                  <th className="py-4 px-6 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400" />
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-red-600">
                      No se pudieron cargar los movimientos: {loadError}{' '}
                      <button className="underline" onClick={fetchAll}>Reintentar</button>
                    </td>
                  </tr>
                ) : paginatedMovements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-gray-400">
                      Sin movimientos de caja registrados hoy
                    </td>
                  </tr>
                ) : (
                  paginatedMovements.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50/70 transition-colors h-14"
                    >
                      {/* Tipo Badge */}
                      <td className="py-3 px-6">
                        {item.type === 'IN' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/60 bg-emerald-50/70 px-2 py-0.5 text-xs font-semibold text-emerald-700 select-none">
                            <svg
                              className="w-3.5 h-3.5 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect width="18" height="18" x="3" y="3" rx="2" />
                              <path d="m8 12 4 4 4-4" />
                              <path d="M12 8v8" />
                            </svg>
                            Entrada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-red-400/60 bg-red-50/70 px-2 py-0.5 text-xs font-semibold text-red-700 select-none">
                            <svg
                              className="w-3.5 h-3.5 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect width="18" height="18" x="3" y="3" rx="2" />
                              <path d="m16 12-4-4-4 4" />
                              <path d="M12 16V8" />
                            </svg>
                            Salida
                          </span>
                        )}
                      </td>

                      {/* Hora */}
                      <td className="py-3 px-6 text-gray-700 font-normal truncate">
                        {formatMovementDateTime(item.time)}
                      </td>

                      {/* Motivo */}
                      <td className="py-3 px-6 text-gray-700 font-normal truncate">
                        {item.reason}
                      </td>

                      {/* Monto */}
                      <td className="py-3 px-6 text-right font-medium text-gray-900">
                        {item.type === 'OUT' ? '- ' : ''}
                        {item.currency === 'PEN'
                          ? formatPEN(item.amount)
                          : formatUSD(item.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Table Footer & Pagination ── */}
          <div className="flex items-center justify-end gap-6 border-t border-gray-200 px-6 py-3.5 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <span>Movimientos por página</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <span>
              {totalItems === 0
                ? '0 - 0 de 0'
                : `${startIndex}-${endIndex} de ${totalItems}`}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </Card>

        {/* ── Modal for New Cash Movement (Ingreso / Salida) ── */}
        {modalType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  {modalType === 'IN' ? (
                    <PlusCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <MinusCircle className="w-5 h-5 text-red-600" />
                  )}
                  <h2 className="text-base font-bold text-gray-900">
                    {modalType === 'IN'
                      ? 'Registrar Ingreso de Dinero'
                      : 'Registrar Salida de Dinero'}
                  </h2>
                </div>
                <button
                  onClick={() => setModalType(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Currency selector */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Moneda
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrencyInput('PEN')}
                      className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                        currencyInput === 'PEN'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Soles (S/)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrencyInput('USD')}
                      className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                        currencyInput === 'USD'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Dólares ($)
                    </button>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Monto ({currencyInput === 'PEN' ? 'S/' : '$'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Reason input */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Motivo
                  </label>
                  <textarea
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder={
                      modalType === 'IN'
                        ? 'Ej: Ingreso por sencillo adicional'
                        : 'Ej: Pago a proveedor de insumos'
                    }
                    rows={3}
                    maxLength={200}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
                {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              </div>

              <div className="mt-6 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setModalType(null)}
                  disabled={savingMovement}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveMovement}
                  disabled={
                    savingMovement ||
                    !amountInput ||
                    parseFloat(amountInput) <= 0 ||
                    !reasonInput.trim()
                  }
                  className={`flex-1 text-white text-xs font-bold ${
                    modalType === 'IN'
                      ? 'bg-[#00c569] hover:bg-[#00b05e]'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {savingMovement ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : null}
                  {modalType === 'IN' ? 'Guardar Ingreso' : 'Guardar Salida'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TerminalShell>
  )
}