import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Printer,
  Inbox,
  HelpCircle,
  Loader2,
  X,
  CheckCircle2,
  Lock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PinPad } from '@/components/PinPad'

// ============================================================
// CashCloseScreen — Open Cash Register Dashboard & Close Flow
// ============================================================

interface TenantSettings {
  name: string
  ruc: string | null
  razonSocial: string | null
  nombreComercial: string | null
}

interface ShiftSummary {
  date: string
  opening: { amount: number; openedAt: string; workerName: string } | null
  sales: { efectivo: number; yape: number; tarjeta: number; other: number; total: number; count: number }
  cancelled: { count: number; amount: number }
  movements: { inPEN: number; outPEN: number; inUSD: number; outUSD: number; inCount: number; outCount: number }
  expected: { efectivo: number; yape: number; tarjeta: number; other: number; total: number }
  cashSales: Array<{ id: string; total: number; status: string; createdAt: string }>
  close: CashCloseRecord | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'

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
  closedDate: string
}

function formatSpanishDate(isoDate: string | null): string {
  const d = isoDate ? new Date(isoDate) : new Date()
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  const dayName = days[d.getDay()]
  const dayNum = d.getDate()
  const monthName = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${dayName} ${dayNum} ${monthName} ${year}, ${hours}:${mins}`
}

function formatPEN(val: number): string {
  return `S/ ${Number(val || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function CashCloseScreen() {
  const navigate = useNavigate()
  const { tenantId, activeWorker, logout } = useAuthStore()
  const { openedAt: cachedOpenedAt, clearOpening } = useCashDrawerStore()

  // State
  const [currencyTab, setCurrencyTab] = useState<'soles' | 'dolares'>('soles')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null)
  const [summary, setSummary] = useState<ShiftSummary | null>(null)

  // User input counts (empty = counted equals expected)
  const [countedEfectivo, setCountedEfectivo] = useState<string>('')
  const [countedYape, setCountedYape] = useState<string>('')
  const [countedTarjeta, setCountedTarjeta] = useState<string>('')

  // UI feedback & modals
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [pendingClose, setPendingClose] = useState<CashCloseRecord | null>(null)
  const [submittingClose, setSubmittingClose] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [successClose, setSuccessClose] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!activeWorker) {
      navigate('/')
    }
  }, [activeWorker, navigate])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // All totals come from the backend (GET /cash/summary): today's Lima day,
  // CANCELLED sales excluded, opening + manual movements read from the DB.
  const fetchData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      const [settingsRes, summaryRes] = await Promise.all([
        api.dashboard.settings.get({ query: { tenantId } }),
        api.cash.summary.get({ query: { tenantId } }),
      ])
      if (settingsRes.data?.data) {
        setTenantSettings(settingsRes.data.data as TenantSettings)
      }
      if (summaryRes.error) throw summaryRes.error
      setSummary(summaryRes.data.data as ShiftSummary)
    } catch (err) {
      setLoadError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const currentOpening = summary?.opening?.amount ?? 0
  const salesEfectivoTotal = summary?.sales.efectivo ?? 0
  const salesYapeTotal = summary?.sales.yape ?? 0
  const salesTarjetaTotal = summary?.sales.tarjeta ?? 0
  const totalNetSales = summary?.sales.total ?? 0
  const cancelledCount = summary?.cancelled.count ?? 0
  const cancelledAmount = summary?.cancelled.amount ?? 0
  const totalGrossSales = totalNetSales + cancelledAmount
  const totalTransactions = summary?.sales.count ?? 0
  const manualIngresosSoles = summary?.movements.inPEN ?? 0

  // Expected cash (same formula as the backend close)
  const totalCashIngresos = currentOpening + salesEfectivoTotal + manualIngresosSoles
  const totalCashSalidas = summary?.movements.outPEN ?? 0
  const expectedEfectivo = summary?.expected.efectivo ?? 0

  const valCountedEfectivo = countedEfectivo !== '' ? Number(countedEfectivo) : expectedEfectivo
  const diffEfectivo = valCountedEfectivo - expectedEfectivo

  const valCountedYape = countedYape !== '' ? Number(countedYape) : salesYapeTotal
  const diffYape = valCountedYape - salesYapeTotal

  const valCountedTarjeta = countedTarjeta !== '' ? Number(countedTarjeta) : salesTarjetaTotal
  const diffTarjeta = valCountedTarjeta - salesTarjetaTotal

  const totalDifference = diffEfectivo + diffYape + diffTarjeta
  const countsValid = [valCountedEfectivo, valCountedYape, valCountedTarjeta].every(
    (v) => Number.isFinite(v) && v >= 0
  )

  // Cash In / Cash Out counts
  const cashInCount =
    (summary?.cashSales ?? []).filter((s) => s.status !== 'CANCELLED').length +
    (summary?.opening ? 1 : 0) +
    (summary?.movements.inCount ?? 0)
  const cashOutCount = summary?.movements.outCount ?? 0

  // Handlers
  const handleOpenDrawer = () => {
    // shortcut: no cash-drawer hardware integration yet; only informs the user.
    showToast('Gaveta de dinero abierta')
  }

  const handleStartClose = async () => {
    if (!activeWorker || !tenantId) return
    if (!summary?.opening) {
      showToast('La caja de hoy no tiene apertura registrada')
      return
    }
    if (!countsValid) {
      showToast('Montos contados inválidos')
      return
    }
    setSubmittingClose(true)
    try {
      const { data, error } = await api.cash.close.post({
        tenantId,
        workerId: activeWorker.id,
        countedEfectivo: valCountedEfectivo,
        countedYape: valCountedYape,
        countedTarjeta: valCountedTarjeta,
      })
      if (error) throw error
      setPendingClose(data.data as CashCloseRecord)
      setShowCloseModal(true)
      setPinError(null)
    } catch (err) {
      showToast(`Error al solicitar cierre: ${apiErrorMessage(err)}`)
    } finally {
      setSubmittingClose(false)
    }
  }

  const handleApprovePin = async (pin: string) => {
    if (!pendingClose || !tenantId) return
    setApproving(true)
    setPinError(null)

    try {
      // The backend identifies the approving admin from the code (approval code or admin PIN)
      const { error } = await api.cash.close({ id: pendingClose.id }).approve.post({
        tenantId,
        approverCode: pin,
      })
      if (error) {
        setPinError(apiErrorMessage(error))
        return
      }

      setSuccessClose(true)
      clearOpening()

      setTimeout(() => {
        logout()
        navigate('/')
      }, 2000)
    } catch (err) {
      setPinError(apiErrorMessage(err))
    } finally {
      setApproving(false)
    }
  }

  const companyTitle = `Caja ${tenantSettings?.nombreComercial || tenantSettings?.name || 'Emiliani Pizzas karaoke'}`
  const companyLegal = tenantSettings?.razonSocial || 'EMILIANI PIZZAS Y PASTAS EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA'
  const openingTimeString = summary?.opening
    ? formatSpanishDate(summary.opening.openedAt)
    : cachedOpenedAt
      ? formatSpanishDate(cachedOpenedAt)
      : 'Sin apertura registrada'

  return (
    <TerminalShell activeSection="cash-close">
      <div className="flex min-h-full flex-col bg-gray-50/50 p-4 md:p-8 text-gray-900">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs text-white shadow-xl animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {toastMessage}
          </div>
        )}

        {/* ── Top Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            Apertura y cierre de caja
          </h1>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPrintModal(true)}
              className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50 h-10 px-4 text-xs font-semibold gap-2 shadow-2xs"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenDrawer}
              className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50 h-10 px-4 text-xs font-semibold gap-2 shadow-2xs"
            >
              <Inbox className="w-4 h-4" />
              Abrir gaveta
            </Button>
            <Button
              onClick={handleStartClose}
              disabled={submittingClose || loading || !summary || !countsValid}
              className="bg-red-600 hover:bg-red-700 text-white h-10 px-5 text-xs font-bold tracking-wide shadow-2xs transition-colors"
            >
              {submittingClose ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : null}
              Cerrar Caja
            </Button>
          </div>
        </div>

        {/* ── Status Banner Card (Hanging Open Sign) ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-2xs flex items-center gap-6">
          {/* Hanging "ABIERTO" Sign */}
          <div className="relative flex flex-col items-center select-none shrink-0">
            {/* Hanging Cord & Pin SVG */}
            <svg width="44" height="18" viewBox="0 0 44 18" className="overflow-visible">
              <circle cx="22" cy="2" r="2.5" fill="#9ca3af" />
              <circle cx="22" cy="2" r="1" fill="#4b5563" />
              <line x1="22" y1="2" x2="6" y2="18" stroke="#d1d5db" strokeWidth="1.5" />
              <line x1="22" y1="2" x2="38" y2="18" stroke="#d1d5db" strokeWidth="1.5" />
            </svg>
            <div className="bg-[#00c569] text-white font-extrabold text-xs tracking-wider px-3.5 py-1.5 rounded-sm shadow-xs">
              ABIERTO
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Caja Abierta</h2>
            <p className="text-xs md:text-sm text-gray-400 mt-0.5">
              ¡Qué tengas un excelente día lleno de ventas!
            </p>
            {loading && <p className="text-xs text-gray-400 mt-1">Cargando totales...</p>}
            {loadError && (
              <p className="text-xs text-red-600 mt-1">
                No se pudieron cargar los totales: {loadError}{' '}
                <button className="underline" onClick={fetchData}>Reintentar</button>
              </p>
            )}
            {summary?.close && (
              <p className="text-xs text-orange-600 mt-1">
                Cierre de hoy {summary.close.status === 'APPROVED' ? 'aprobado' : 'pendiente de aprobación'} ·
                diferencia {formatPEN(summary.close.difference)}. Volver a cerrar recalcula y requiere nueva aprobación.
              </p>
            )}
          </div>
        </div>

        {/* ── Company Metadata & Key Totals Card ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-2xs space-y-6">
          {/* Row 1: Company info & Opening Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-gray-100">
            {/* Col 1 */}
            <div>
              <h3 className="text-sm font-bold text-gray-900">{companyTitle}</h3>
              <p className="text-[11px] text-gray-400 font-medium uppercase mt-0.5 leading-snug">
                {companyLegal}
              </p>
            </div>

            {/* Col 2 */}
            <div>
              <p className="text-xs text-gray-400 font-medium">Hora de apertura</p>
              <p className="text-xs md:text-sm text-gray-700 font-medium mt-1">
                {openingTimeString}
              </p>
            </div>

            {/* Col 3 */}
            <div>
              <p className="text-xs text-gray-400 font-medium">Apertura de caja (S/)</p>
              <p className="text-xs md:text-sm text-gray-700 font-medium mt-1">
                {formatPEN(currentOpening)}
              </p>
            </div>

            {/* Col 4 */}
            <div>
              <p className="text-xs text-gray-400 font-medium">Apertura de caja ($)</p>
              <p className="text-xs md:text-sm text-gray-700 font-medium mt-1">$0.00</p>
            </div>
          </div>

          {/* Row 2: Sales Totals & Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Metric 1 */}
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                {formatPEN(currencyTab === 'soles' ? totalNetSales : 0)}
              </p>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Total de ventas neto soles
              </p>
              <span
                className={`inline-block mt-2 px-2.5 py-0.5 text-xs font-semibold rounded ${
                  diffEfectivo >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {diffEfectivo >= 0 ? '+ ' : '- '}
                {formatPEN(Math.abs(diffEfectivo))} de diferencia
              </span>
            </div>

            {/* Metric 2 */}
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                $0.00
              </p>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Total de ventas neto dólares
              </p>
              <span className="inline-block mt-2 px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded">
                + $0.00 de diferencia
              </span>
            </div>

            {/* Metric 3 */}
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                {totalTransactions}
              </p>
              <p className="text-xs text-gray-500 font-medium mt-1">Transacciones</p>
            </div>
          </div>
        </div>

        {/* ── Currency Tabs (Centered) ── */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-8 border-b border-gray-200 px-6">
            <button
              onClick={() => setCurrencyTab('soles')}
              className={`pb-2.5 text-xs md:text-sm font-semibold transition-colors relative ${
                currencyTab === 'soles'
                  ? 'text-emerald-700 font-bold border-b-2 border-emerald-500'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Soles
            </button>
            <button
              onClick={() => setCurrencyTab('dolares')}
              className={`pb-2.5 text-xs md:text-sm font-semibold transition-colors relative ${
                currencyTab === 'dolares'
                  ? 'text-emerald-700 font-bold border-b-2 border-emerald-500'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Dólares
            </button>
          </div>
        </div>

        {/* ── Main Data Sections ── */}
        <div className="space-y-6">
          {/* Section 1: Resultados de turno por método de pago */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-800 mb-4">
              Resultados de turno por método de pago
            </h3>

            <div className="overflow-x-auto">
              {/* Cash Table */}
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-medium">
                    <th className="pb-3 w-[24%]">-</th>
                    <th className="pb-3 w-[16%]">Ventas + ingresos</th>
                    <th className="pb-3 w-[16%]">Anulaciones + salidas</th>
                    <th className="pb-3 w-[16%]">Monto esperado</th>
                    <th className="pb-3 w-[14%]">Monto contado</th>
                    <th className="pb-3 w-[14%]">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  <tr className="h-14">
                    <td className="py-3 font-medium flex items-center gap-1">
                      <span>Efectivo en caja</span>
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 inline cursor-help" />
                    </td>
                    <td className="py-3">
                      <span>{formatPEN(totalCashIngresos)}</span>
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 inline ml-1 cursor-help" />
                    </td>
                    <td className="py-3">
                      <span>
                        {totalCashSalidas > 0 ? `-` : ''}
                        {formatPEN(totalCashSalidas)}
                      </span>
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 inline ml-1 cursor-help" />
                    </td>
                    <td className="py-3 font-medium">{formatPEN(expectedEfectivo)}</td>
                    <td className="py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={countedEfectivo}
                        onChange={(e) => setCountedEfectivo(e.target.value)}
                        placeholder="0.00"
                        className="w-28 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </td>
                    <td
                      className={`py-3 font-semibold ${
                        diffEfectivo >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatPEN(diffEfectivo)}
                    </td>
                  </tr>
                  <tr className="h-12 text-gray-500">
                    <td className="py-3">Redondeo total por vueltos</td>
                    <td className="py-3">S/ 0.00</td>
                    <td className="py-3">S/ 0.00</td>
                    <td className="py-3">S/ 0.00</td>
                    <td className="py-3">-</td>
                    <td className="py-3">-</td>
                  </tr>
                </tbody>
              </table>

              {/* Divider */}
              <div className="border-t border-gray-100 my-4" />

              {/* Digital Methods Table */}
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-medium">
                    <th className="pb-3 w-[24%]">-</th>
                    <th className="pb-3 w-[16%]">Ventas</th>
                    <th className="pb-3 w-[16%]">Anulaciones</th>
                    <th className="pb-3 w-[16%]">Monto esperado</th>
                    <th className="pb-3 w-[14%]">Monto contado</th>
                    <th className="pb-3 w-[14%]">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {/* QR YAPE */}
                  <tr className="h-14">
                    <td className="py-3 font-medium">QR YAPE</td>
                    <td className="py-3">{formatPEN(salesYapeTotal)}</td>
                    <td className="py-3">S/ 0.00</td>
                    <td className="py-3 font-medium">{formatPEN(salesYapeTotal)}</td>
                    <td className="py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={countedYape}
                        onChange={(e) => setCountedYape(e.target.value)}
                        placeholder="0.00"
                        className="w-28 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </td>
                    <td
                      className={`py-3 font-semibold ${
                        diffYape >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatPEN(diffYape)}
                    </td>
                  </tr>

                  {/* Tarjeta */}
                  <tr className="h-14">
                    <td className="py-3 font-medium">Tarjeta</td>
                    <td className="py-3">{formatPEN(salesTarjetaTotal)}</td>
                    <td className="py-3">S/ 0.00</td>
                    <td className="py-3 font-medium">{formatPEN(salesTarjetaTotal)}</td>
                    <td className="py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={countedTarjeta}
                        onChange={(e) => setCountedTarjeta(e.target.value)}
                        placeholder="0.00"
                        className="w-28 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </td>
                    <td
                      className={`py-3 font-semibold ${
                        diffTarjeta >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatPEN(diffTarjeta)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Section 2: Resumen del turno */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Resumen del turno</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-medium">
                    <th className="pb-3 w-[50%]">-</th>
                    <th className="pb-3 w-[25%]">Cantidad</th>
                    <th className="pb-3 w-[25%]">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  <tr className="h-10">
                    <td className="py-2.5 font-medium">Total de ventas bruto</td>
                    <td className="py-2.5">{totalTransactions}</td>
                    <td className="py-2.5">{formatPEN(totalGrossSales)}</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-medium">Descuentos</td>
                    <td className="py-2.5">0</td>
                    <td className="py-2.5">S/ 0.00</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-medium">Devoluciones (Nota de Crédito)</td>
                    <td className="py-2.5">0</td>
                    <td className="py-2.5">S/ 0.00</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-medium">Anulaciones</td>
                    <td className="py-2.5">{cancelledCount}</td>
                    <td className="py-2.5">{formatPEN(cancelledAmount)}</td>
                  </tr>
                  <tr className="h-10 font-bold text-gray-900 border-t border-gray-200">
                    <td className="py-2.5">Total de ventas neto</td>
                    <td className="py-2.5">-</td>
                    <td className="py-2.5">{formatPEN(totalNetSales)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Section 3: Movimientos de caja */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Movimientos de caja</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-medium">
                    <th className="pb-3 w-[50%]">-</th>
                    <th className="pb-3 w-[25%]">Cantidad</th>
                    <th className="pb-3 w-[25%]">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  <tr className="h-10">
                    <td className="py-2.5 font-medium">Entrada de dinero</td>
                    <td className="py-2.5">{cashInCount}</td>
                    <td className="py-2.5">{formatPEN(totalCashIngresos)}</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-medium">Salida de dinero</td>
                    <td className="py-2.5">{cashOutCount}</td>
                    <td className="py-2.5">{formatPEN(totalCashSalidas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ── Print Shift Voucher Modal ── */}
        {showPrintModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5 text-gray-800" />
                  <h2 className="text-base font-bold text-gray-900">
                    Reporte de Cierre de Caja
                  </h2>
                </div>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Printable Voucher Content */}
              <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-xs font-mono text-gray-800">
                <div className="text-center border-b border-dashed border-gray-300 pb-3">
                  <p className="font-bold text-sm text-gray-900 uppercase">
                    {companyTitle}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">{companyLegal}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    APERTURA: {openingTimeString}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    CAJERO: {activeWorker?.name || 'Administrador'}
                  </p>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Apertura Inicial:</span>
                    <span className="font-semibold">{formatPEN(currentOpening)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ventas Efectivo:</span>
                    <span className="font-semibold">{formatPEN(salesEfectivoTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ventas Yape:</span>
                    <span className="font-semibold">{formatPEN(salesYapeTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ventas Tarjeta:</span>
                    <span className="font-semibold">{formatPEN(salesTarjetaTotal)}</span>
                  </div>
                  <div className="border-t border-dashed border-gray-300 pt-1.5 flex justify-between font-bold">
                    <span>Total Ventas Neto:</span>
                    <span>{formatPEN(totalNetSales)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total Esperado Efectivo:</span>
                    <span>{formatPEN(expectedEfectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Efectivo Contado:</span>
                    <span className="font-semibold">{formatPEN(valCountedEfectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Diferencia Efectivo:</span>
                    <span
                      className={`font-bold ${
                        diffEfectivo >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatPEN(diffEfectivo)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPrintModal(false)}
                >
                  Cerrar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Cash Close PIN Approval Modal ── */}
        {showCloseModal && pendingClose && !successClose && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-md bg-white border-gray-200 rounded-2xl shadow-2xl p-6">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-red-600" />
                  Aprobación de Cierre de Caja
                </h3>
                <button
                  onClick={() => {
                    if (!approving) setShowCloseModal(false)
                  }}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="text-center text-xs text-gray-500 mb-6 space-y-1">
                <p>Ingrese el código de aprobación (6 dígitos) del administrador para confirmar el cierre.</p>
                <p className="font-semibold text-gray-800">
                  Diferencia total: {totalDifference >= 0 ? '+ ' : ''}
                  {formatPEN(totalDifference)}
                </p>
              </div>

              <PinPad
                onComplete={handleApprovePin}
                disabled={approving}
                hasError={!!pinError}
                length={6}
              />

              {pinError && (
                <p className="text-center text-xs text-red-600 font-medium mt-3">
                  {pinError}
                </p>
              )}

              {approving && (
                <div className="flex justify-center mt-4">
                  <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                </div>
              )}

              <Button
                variant="outline"
                className="w-full mt-6"
                onClick={() => {
                  if (!approving) setShowCloseModal(false)
                }}
                disabled={approving}
              >
                Cancelar
              </Button>
            </Card>
          </div>
        )}

        {/* ── Success Close Overlay ── */}
        {successClose && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-sm bg-white border-0 rounded-2xl shadow-2xl p-8 text-center">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-lg font-bold text-gray-900">Cierre de Caja Aprobado</p>
              <p className="text-xs text-gray-500 mt-1">
                El turno ha finalizado exitosamente. Redirigiendo...
              </p>
            </Card>
          </div>
        )}
      </div>
    </TerminalShell>
  )
}
