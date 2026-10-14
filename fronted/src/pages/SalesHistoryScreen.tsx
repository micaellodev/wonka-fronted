import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search,
  Printer,
  Mail,
  Banknote,
  DollarSign,
  ShoppingBag,
  Calendar as CalendarIcon,
  HelpCircle,
  X,
  FileText,
  Ban,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
// Eden treaty no tipa estas rutas dinámicas; respuesta JSON laxa a propósito
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

// ============================================================
// SalesHistoryScreen — Sales History & Invoicing Register
// ============================================================

interface Sale {
  id: string
  total: number
  tipoComprobante: string
  serie: string | null
  correlativo: string | null
  createdAt: string
  status: string
  paymentMethod: string
  clientName: string | null
  clientDocNumber?: string | null
  worker: { name: string }
  items?: Array<{
    qty: number
    product: { name: string; sku?: string }
    unitPrice: number
  }>
}

/** YYYY-MM-DD of `date` in Lima (business timezone, same as the backend). */
function formatDateKey(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

/** Picker value (YYYY-MM-DD) as noon in Lima, so formatDateKey returns the same day anywhere. */
const fromDateKey = (val: string) => new Date(`${val}T12:00:00-05:00`)

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: Loose): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'


function formatLongDateLabel(start: Date, end: Date): string {
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ]
  const sMonth = months[start.getMonth()]
  const sDay = start.getDate()
  const sYear = start.getFullYear()

  const eMonth = months[end.getMonth()]
  const eDay = end.getDate()
  const eYear = end.getFullYear()

  return `${sMonth} ${sDay}, ${sYear} ~ ${eMonth} ${eDay}, ${eYear}`
}

function formatTableDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  let hours = d.getHours()
  const mins = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12

  return `${y}-${m}-${day} ${hours}:${mins} ${ampm}`
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

function getCorrelativo(sale: Sale): string {
  if (sale.serie && sale.correlativo) return `${sale.serie}-${sale.correlativo}`
  if (sale.tipoComprobante === 'TICKET') return `BW01-${sale.id.slice(-8)}`
  return `BW01-${sale.id.slice(-8)}`
}

function getPaymentMethodLabel(method: string): string {
  const lower = (method || '').toLowerCase()
  if (lower === 'efectivo') return 'Efectivo'
  if (lower === 'yape' || lower === 'plin' || lower === 'qr') return 'Qr'
  if (lower === 'tarjeta') return 'Tarjeta'
  if (lower === 'mixto') return 'Mixto'
  return 'Efectivo'
}

function getDocumentTypeLabel(tipo: string): string {
  const upper = (tipo || '').toUpperCase()
  if (upper === 'BOLETA') return 'Boleta'
  if (upper === 'FACTURA') return 'Factura'
  if (upper === 'TICKET') return 'Ticket'
  if (upper === 'NOTA_CREDITO' || upper === 'CREDIT_NOTE') return 'Nota de Crédito'
  return 'Boleta'
}

export function SalesHistoryScreen() {
  const { tenantId, activeWorker } = useAuthStore()

  // Filters state
  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'last7' | 'last30' | 'custom'>('today')
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date()
    return { start: now, end: now }
  })
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [documentFilter, setDocumentFilter] = useState<'ALL' | 'BOLETA' | 'FACTURA' | 'TICKET'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  // Data & Loading
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [sales, setSales] = useState<Sale[]>([])

  // Modals & Actions
  const [selectedSaleForPrint, setSelectedSaleForPrint] = useState<Sale | null>(null)
  const [selectedSaleForVoid, setSelectedSaleForVoid] = useState<Sale | null>(null)
  const [selectedSaleForMail, setSelectedSaleForMail] = useState<Sale | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidSubmitting, setVoidSubmitting] = useState(false)
  const [mailInput, setMailInput] = useState('')
  const [mailSuccess, setMailSuccess] = useState(false)
  const [mailSending, setMailSending] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Detail modal
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const openSaleDetail = async (sale: Sale) => {
    setDetailLoading(true)
    setSelectedSaleDetail(sale)
    try {
      const { data, error } = await api.pos.sales({ id: sale.id }).get({ query: { tenantId: tenantId! } })
      if (error) throw error
      if (data?.data) setSelectedSaleDetail(data.data as Sale)
    } catch {
      // Keep the basic sale data from the list
    } finally {
      setDetailLoading(false)
    }
  }

  // Filter application
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

  // Fetch the selected Lima date range from the backend (no page-size truncation)
  const fromKey = formatDateKey(dateRange.start)
  const toKey = formatDateKey(dateRange.end)
  const fetchSalesData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await api.dashboard['sales-report'].get({
        query: { tenantId, from: fromKey <= toKey ? fromKey : toKey, to: fromKey <= toKey ? toKey : fromKey },
      })
      if (error) throw error
      setSales((data.data as Sale[]) || [])
    } catch (err) {
      setLoadError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tenantId, fromKey, toKey])

  useEffect(() => {
    fetchSalesData()
  }, [fetchSalesData])

  // Filtered sales by search and document type (date range is applied by the backend)
  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return sales.filter((sale) => {
      // Document filter
      if (documentFilter !== 'ALL') {
        const tipo = (sale.tipoComprobante || '').toUpperCase()
        if (tipo !== documentFilter) return false
      }

      // Search term filter
      if (term) {
        const correlativo = getCorrelativo(sale).toLowerCase()
        const client = (sale.clientName || 'sin cliente').toLowerCase()
        const totalStr = String(sale.total)
        if (
          !correlativo.includes(term) &&
          !client.includes(term) &&
          !totalStr.includes(term)
        ) {
          return false
        }
      }

      return true
    })
  }, [sales, documentFilter, searchTerm])

  // KPIs
  const totalSalesSoles = useMemo(
    () =>
      filteredSales
        .filter((s) => s.status !== 'CANCELLED')
        .reduce((sum, s) => sum + Number(s.total || 0), 0),
    [filteredSales]
  )
  const totalCountSales = filteredSales.filter((s) => s.status !== 'CANCELLED').length

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize))
  const paginatedSales = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredSales.slice(start, start + pageSize)
  }, [filteredSales, page, pageSize])

  const startIndex = filteredSales.length === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, filteredSales.length)

  // Void / Credit Note Action
  const handleRequestVoid = async () => {
    if (!selectedSaleForVoid || !activeWorker || !tenantId || !voidReason.trim()) return
    setVoidSubmitting(true)
    setVoidError(null)
    try {
      const { error } = await api.pos.sales({ id: selectedSaleForVoid.id }).void.post({
        tenantId,
        workerId: activeWorker.id,
        reason: voidReason.trim(),
      })
      if (error) throw error
      showToast('Solicitud de anulación enviada: queda pendiente de aprobación del administrador')
      setSelectedSaleForVoid(null)
      setVoidReason('')
      fetchSalesData()
    } catch (err) {
      setVoidError(apiErrorMessage(err))
    } finally {
      setVoidSubmitting(false)
    }
  }

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mailInput.trim() || !selectedSaleForMail || !tenantId) return
    setMailSending(true)
    try {
      const { error } = await api.pos.sales({ id: selectedSaleForMail.id }).email.post({
        tenantId,
        email: mailInput.trim(),
      })
      if (error) throw error
      setMailSuccess(true)
      setTimeout(() => {
        setMailSuccess(false)
        setSelectedSaleForMail(null)
        setMailInput('')
        showToast('Comprobante enviado por correo exitosamente')
      }, 1200)
    } catch (err) {
      showToast(`Error al enviar correo: ${apiErrorMessage(err)}`)
    } finally {
      setMailSending(false)
    }
  }

  const dateLabel = formatLongDateLabel(dateRange.start, dateRange.end)

  return (
    <TerminalShell activeSection="sales-history">
      <div className="flex min-h-full flex-col bg-gray-50/50 p-4 md:p-8 text-gray-900">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs text-white shadow-xl animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {toastMessage}
          </div>
        )}

        {/* ── Top Header & Filters ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
              Historial de ventas
            </h1>
            <button
              onClick={() => setShowGuideModal(true)}
              className="text-xs text-[#0088cc] hover:underline flex items-center gap-1.5 mt-1 cursor-pointer font-medium"
            >
              <FileText className="w-3.5 h-3.5" />
              ¿Cómo realizar una nota de crédito?
            </button>
          </div>

          {/* Quick Date Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyFilter('today')}
              className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors ${
                filterType === 'today'
                  ? 'border-[#00c569] bg-[#e6fcf5] text-[#00c569]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => applyFilter('yesterday')}
              className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors ${
                filterType === 'yesterday'
                  ? 'border-[#00c569] bg-[#e6fcf5] text-[#00c569]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => applyFilter('last7')}
              className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors ${
                filterType === 'last7'
                  ? 'border-[#00c569] bg-[#e6fcf5] text-[#00c569]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Últimos 7 días
            </button>
            <button
              onClick={() => applyFilter('last30')}
              className={`h-9 px-3.5 text-xs font-semibold rounded-lg border transition-colors ${
                filterType === 'last30'
                  ? 'border-[#00c569] bg-[#e6fcf5] text-[#00c569]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Últimos 30 días
            </button>

            {/* Custom Date Picker */}
            <div className="relative">
              <button
                onClick={() => setShowCustomPicker((v) => !v)}
                className="flex h-9 w-[285px] items-center justify-between rounded-lg border border-gray-200 bg-white px-3.5 text-xs text-gray-700 hover:bg-gray-50 select-none shadow-2xs"
              >
                <span className="truncate">{dateLabel}</span>
                <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0 ml-2" />
              </button>

              {showCustomPicker && (
                <div className="absolute right-0 mt-2 z-30 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-3">
                    <span className="text-xs font-bold text-gray-800">
                      Rango personalizado
                    </span>
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-gray-500 block mb-1">
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
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-500 block mb-1">
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
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                    onClick={() => setShowCustomPicker(false)}
                  >
                    Aplicar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sub-tab "Ventas" ── */}
        <div className="border-b border-gray-200 mb-6">
          <button className="pb-2 text-xs md:text-sm font-bold text-emerald-700 border-b-2 border-[#00c569] transition-colors">
            Ventas
          </button>
        </div>

        {/* ── Full Width Search & Filter Bar ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 mb-6 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 px-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar correlativo o cliente"
              className="w-full text-xs md:text-sm text-gray-800 bg-transparent focus:outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="border-l border-gray-200 pl-3">
            <select
              value={documentFilter}
              onChange={(e) => {
                setDocumentFilter(e.target.value as Loose)
                setPage(1)
              }}
              className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer pr-2"
            >
              <option value="ALL">General</option>
              <option value="BOLETA">Boleta</option>
              <option value="FACTURA">Factura</option>
              <option value="TICKET">Ticket</option>
            </select>
          </div>
        </div>

        {/* ── 3 Summary KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Card 1: Total en soles */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs flex items-center gap-4">
            <div className="rounded-lg bg-gray-100 p-3 text-gray-600 shrink-0">
              <Banknote className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                Total de ventas en soles
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              </p>
              <p className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">
                {formatPEN(totalSalesSoles)}
              </p>
            </div>
          </Card>

          {/* Card 2: Total en dólares */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs flex items-center gap-4">
            <div className="rounded-lg bg-gray-100 p-3 text-gray-600 shrink-0">
              <DollarSign className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                Total de ventas en dólares
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              </p>
              <p className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">
                {formatUSD(0)}
              </p>
            </div>
          </Card>

          {/* Card 3: Cantidad de ventas */}
          <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-2xs flex items-center gap-4">
            <div className="rounded-lg bg-gray-100 p-3 text-gray-600 shrink-0">
              <ShoppingBag className="h-6 w-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Cantidad de ventas</p>
              <p className="text-2xl font-black tracking-tight text-gray-900 mt-0.5">
                {totalCountSales}
              </p>
            </div>
          </Card>
        </div>

        {/* ── Table Container ── */}
        <Card className="rounded-xl border border-gray-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto min-h-[360px] flex flex-col justify-between">
            <table className="w-full text-left text-xs table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-white text-gray-700 font-semibold">
                  <th className="py-4 px-6">Fecha y hora ▾</th>
                  <th className="py-4 px-6">Tipo de documento</th>
                  <th className="py-4 px-6">Correlativo</th>
                  <th className="py-4 px-6">Cliente</th>
                  <th className="py-4 px-6">Monto</th>
                  <th className="py-4 px-6">Tipo de pago</th>
                  <th className="py-4 px-6 text-center">Estado</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400" />
                      Cargando ventas...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center text-red-600">
                      No se pudieron cargar las ventas: {loadError}{' '}
                      <button className="underline" onClick={fetchSalesData}>Reintentar</button>
                    </td>
                  </tr>
                ) : paginatedSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center text-gray-400">
                      Sin ventas registradas en el periodo seleccionado
                    </td>
                  </tr>
                ) : (
                  paginatedSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-gray-50/70 transition-colors h-14"
                    >
                      {/* Fecha y hora */}
                      <td className="py-3 px-6 text-gray-800 font-normal truncate">
                        {formatTableDateTime(sale.createdAt)}
                      </td>

                      {/* Tipo de documento */}
                      <td className="py-3 px-6 text-gray-700 font-normal truncate">
                        {getDocumentTypeLabel(sale.tipoComprobante)}
                      </td>

                      {/* Correlativo */}
                      <td className="py-3 px-6 text-gray-800 font-normal truncate">
                        {getCorrelativo(sale)}
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-6 text-gray-600 font-normal truncate">
                        {sale.clientName || 'Sin cliente'}
                      </td>

                      {/* Monto */}
                      <td className="py-3 px-6 font-semibold text-gray-900">
                        {formatPEN(sale.total)}
                      </td>

                      {/* Tipo de pago */}
                      <td className="py-3 px-6 text-gray-700 font-normal">
                        {getPaymentMethodLabel(sale.paymentMethod)}
                      </td>

                      {/* Estado Badge */}
                      <td className="py-3 px-6 text-center">
                        {sale.status === 'CANCELLED' ? (
                          <button
                            onClick={() => openSaleDetail(sale)}
                            className="inline-block rounded-full bg-[#ffe3e3] px-3 py-0.5 text-[11px] font-semibold text-[#e03131] select-none cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            Anulado
                          </button>
                        ) : (
                          <button
                            onClick={() => openSaleDetail(sale)}
                            className="inline-block rounded-full bg-[#d3f9d8] px-3 py-0.5 text-[11px] font-semibold text-[#2b8a3e] select-none cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            Emitido
                          </button>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-6 text-center">
                        <div className="inline-flex items-center justify-center gap-1">
                          {/* 1. Anular / Nota de crédito */}
                          <button
                            onClick={() => {
                              setSelectedSaleForVoid(sale)
                              setVoidReason('')
                              setVoidError(null)
                            }}
                            disabled={sale.status === 'CANCELLED'}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                            title="Anular o emitir nota de crédito"
                          >
                            <Ban className="w-4 h-4" />
                          </button>

                          {/* 2. Imprimir comprobante */}
                          <button
                            onClick={() => setSelectedSaleForPrint(sale)}
                            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            title="Imprimir comprobante"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* 3. Enviar por correo */}
                          <button
                            onClick={() => {
                              setSelectedSaleForMail(sale)
                              setMailInput('')
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            title="Enviar por correo"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        </div>
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
              <span>Ventas por página</span>
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
              {filteredSales.length === 0
                ? '0 - 0 de 0'
                : `${startIndex}-${endIndex} de ${filteredSales.length}`}
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

        {/* ── Modal 1: Print Voucher ── */}
        {selectedSaleForPrint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5 text-gray-800" />
                  <h2 className="text-base font-bold text-gray-900">
                    Comprobante de Venta
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedSaleForPrint(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Printable Receipt Preview */}
              <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-xs font-mono text-gray-800">
                <div className="text-center border-b border-dashed border-gray-300 pb-3">
                  <p className="font-bold text-sm text-gray-900 uppercase">
                    WONKA POS
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">
                    {getDocumentTypeLabel(selectedSaleForPrint.tipoComprobante)} {getCorrelativo(selectedSaleForPrint)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {formatTableDateTime(selectedSaleForPrint.createdAt)}
                  </p>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cliente:</span>
                    <span className="font-semibold">
                      {selectedSaleForPrint.clientName || 'CLIENTE VARIOS'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Método de pago:</span>
                    <span className="font-semibold">
                      {getPaymentMethodLabel(selectedSaleForPrint.paymentMethod)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Estado:</span>
                    <span className="font-semibold">
                      {selectedSaleForPrint.status === 'CANCELLED' ? 'ANULADO' : 'EMITIDO'}
                    </span>
                  </div>

                  <div className="border-t border-dashed border-gray-300 pt-2 flex justify-between font-bold text-sm text-gray-900">
                    <span>TOTAL:</span>
                    <span>{formatPEN(selectedSaleForPrint.total)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedSaleForPrint(null)}
                >
                  Cerrar
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  onClick={() => {
                    const receiptHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Comprobante Wonka</title>
<style>
  body{font-family:monospace;max-width:320px;margin:20px auto;color:#1a1a1a;font-size:12px}
  .center{text-align:center;border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .total{border-top:1px dashed #ccc;margin-top:8px;padding-top:8px;font-weight:800;font-size:14px;text-align:right}
</style></head><body>
  <div class="center">
    <strong>WONKA POS</strong><br>
    ${getDocumentTypeLabel(selectedSaleForPrint.tipoComprobante)} ${getCorrelativo(selectedSaleForPrint)}<br>
    <small>${formatTableDateTime(selectedSaleForPrint.createdAt)}</small>
  </div>
  <div class="row"><span>Cliente:</span><span>${escapeHtml(selectedSaleForPrint.clientName || 'CLIENTE VARIOS')}</span></div>
  <div class="row"><span>Pago:</span><span>${getPaymentMethodLabel(selectedSaleForPrint.paymentMethod)}</span></div>
  <div class="row"><span>Estado:</span><span>${selectedSaleForPrint.status === 'CANCELLED' ? 'ANULADO' : 'EMITIDO'}</span></div>
  <div class="total">TOTAL: ${formatPEN(selectedSaleForPrint.total)}</div>
</body></html>`;
                    const w = window.open('', '_blank', 'width=400,height=500');
                    if (w) { w.document.write(receiptHtml); w.document.close(); w.print(); }
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal 2: Void / Nota de Crédito ── */}
        {selectedSaleForVoid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-red-600" />
                  <h2 className="text-base font-bold text-gray-900">
                    Anular Venta / Nota de Crédito
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedSaleForVoid(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 mb-4 text-xs">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <p className="font-semibold text-gray-900">
                    {getDocumentTypeLabel(selectedSaleForVoid.tipoComprobante)} {getCorrelativo(selectedSaleForVoid)}
                  </p>
                  <p className="text-gray-500">Monto: {formatPEN(selectedSaleForVoid.total)}</p>
                  <p className="text-gray-500">Cliente: {selectedSaleForVoid.clientName || 'Sin cliente'}</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Motivo de anulación *
                  </label>
                  <textarea
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Ej: Error en digitación del cliente o devolución de producto"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  />
                  {voidError && <p className="mt-1 text-xs text-red-600">{voidError}</p>}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedSaleForVoid(null)}
                  disabled={voidSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
                  onClick={handleRequestVoid}
                  disabled={!voidReason.trim() || voidSubmitting}
                >
                  {voidSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : null}
                  Confirmar Anulación
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal 3: Send Mail ── */}
        {selectedSaleForMail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-gray-800" />
                  <h2 className="text-base font-bold text-gray-900">
                    Enviar Comprobante por Correo
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedSaleForMail(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSendMail} className="space-y-4">
                <div className="text-xs text-gray-500">
                  <p>
                    Comprobante:{' '}
                    <span className="font-semibold text-gray-800">
                      {getCorrelativo(selectedSaleForMail)}
                    </span>
                  </p>
                  <p>
                    Total:{' '}
                    <span className="font-semibold text-gray-800">
                      {formatPEN(selectedSaleForMail.total)}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Correo electrónico del cliente
                  </label>
                  <input
                    type="email"
                    required
                    value={mailInput}
                    onChange={(e) => setMailInput(e.target.value)}
                    placeholder="cliente@ejemplo.com"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedSaleForMail(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[#00c569] hover:bg-[#00b05e] text-white font-bold"
                    disabled={!mailInput.trim() || mailSuccess || mailSending}
                  >
                    {mailSending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : mailSuccess ? (
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    ) : (
                      <Mail className="w-4 h-4 mr-1.5" />
                    )}
                    {mailSending ? 'Enviando...' : mailSuccess ? 'Enviado' : 'Enviar Comprobante'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal 4: Credit Note Guide ── */}
        {showGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-sky-600" />
                  <h2 className="text-base font-bold text-gray-900">
                    ¿Cómo realizar una nota de crédito?
                  </h2>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-gray-600">
                <p>
                  Para emitir una <strong>Nota de Crédito</strong> o anular un comprobante electrónico:
                </p>
                <ol className="list-decimal pl-4 space-y-2">
                  <li>
                    Busque la venta en la tabla por número correlativo o nombre de cliente.
                  </li>
                  <li>
                    En la columna <strong>Acciones</strong>, haga clic en el botón de prohibido/anular{' '}
                    <Ban className="w-3.5 h-3.5 inline text-red-600 mx-0.5" />.
                  </li>
                  <li>
                    Ingrese el motivo de la anulación (devolución total, error en RUC/DNI, etc.).
                  </li>
                  <li>
                    El sistema registrará la nota de crédito y restablecerá el stock del inventario automáticamente.
                  </li>
                </ol>
              </div>

              <div className="mt-6">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setShowGuideModal(false)}
                >
                  Entendido
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal 5: Sale Detail ── */}
        {selectedSaleDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {getDocumentTypeLabel(selectedSaleDetail.tipoComprobante)} {getCorrelativo(selectedSaleDetail)}
                  </h2>
                  {selectedSaleDetail.status === 'CANCELLED' ? (
                    <span className="inline-block rounded-full bg-[#ffe3e3] px-3 py-0.5 text-[11px] font-semibold text-[#e03131] select-none mt-1">
                      Anulado
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-[#d3f9d8] px-3 py-0.5 text-[11px] font-semibold text-[#2b8a3e] select-none mt-1">
                      Emitido
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!selectedSaleDetail) return
                      const s = selectedSaleDetail
                      const receiptHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Comprobante Wonka</title>
<style>
  body{font-family:monospace;max-width:320px;margin:20px auto;color:#1a1a1a;font-size:12px}
  .center{text-align:center;border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .total{border-top:1px dashed #ccc;margin-top:8px;padding-top:8px;font-weight:800;font-size:14px;text-align:right}
</style></head><body>
  <div class="center">
    <strong>WONKA POS</strong><br>
    ${getDocumentTypeLabel(s.tipoComprobante)} ${getCorrelativo(s)}<br>
    <small>${formatTableDateTime(s.createdAt)}</small>
  </div>
  <div class="row"><span>Cliente:</span><span>${escapeHtml(s.clientName || 'CLIENTE VARIOS')}</span></div>
  <div class="row"><span>Pago:</span><span>${getPaymentMethodLabel(s.paymentMethod)}</span></div>
  <div class="row"><span>Estado:</span><span>${s.status === 'CANCELLED' ? 'ANULADO' : 'EMITIDO'}</span></div>
  <div class="total">TOTAL: ${formatPEN(s.total)}</div>
</body></html>`;
                      const w = window.open('', '_blank', 'width=400,height=500');
                      if (w) { w.document.write(receiptHtml); w.document.close(); w.print(); }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir boleta
                  </button>
                  {selectedSaleDetail?.status !== 'CANCELLED' && (
                    <button
                      onClick={() => {
                        setSelectedSaleForVoid(selectedSaleDetail)
                        setVoidReason('')
                        setVoidError(null)
                        setSelectedSaleDetail(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                    >
                      Anular con nota de crédito
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedSaleDetail(null)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {detailLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    <span className="ml-2 text-xs text-gray-500">Cargando detalle...</span>
                  </div>
                )}

                {/* Información de la venta */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Información de la venta</h3>
                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-lg bg-white border border-gray-200 p-2 text-gray-500 shrink-0">
                          <Banknote className="h-4 w-4 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500">Monto</p>
                          <p className="text-sm font-bold text-gray-900">{formatPEN(selectedSaleDetail.total)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-lg bg-white border border-gray-200 p-2 text-gray-500 shrink-0">
                          <FileText className="h-4 w-4 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500">Tipo de documento</p>
                          <p className="text-sm font-bold text-gray-900">{getDocumentTypeLabel(selectedSaleDetail.tipoComprobante)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-lg bg-white border border-gray-200 p-2 text-gray-500 shrink-0">
                          <CalendarIcon className="h-4 w-4 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500">Fecha de venta</p>
                          <p className="text-sm font-bold text-gray-900">{formatTableDateTime(selectedSaleDetail.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-lg bg-white border border-gray-200 p-2 text-gray-500 shrink-0">
                          <DollarSign className="h-4 w-4 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500">Cliente</p>
                          <p className="text-sm font-bold text-gray-900">{selectedSaleDetail.clientName || 'No registrado'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-lg bg-white border border-gray-200 p-2 text-gray-500 shrink-0">
                          <HelpCircle className="h-4 w-4 stroke-[1.5]" />
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500">Cajero</p>
                          <p className="text-sm font-bold text-gray-900">{selectedSaleDetail.worker.name}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Productos */}
                {selectedSaleDetail.items && selectedSaleDetail.items.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-3">Productos</h3>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-semibold">
                            <th className="py-2.5 px-5">Cantidad</th>
                            <th className="py-2.5 px-5">Producto</th>
                            <th className="py-2.5 px-5">Precio unitario</th>
                            <th className="py-2.5 px-5">Descuento</th>
                            <th className="py-2.5 px-5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700">
                          {selectedSaleDetail.items.map((item, idx) => (
                            <tr key={item.product?.sku || idx} className="hover:bg-gray-50/50">
                              <td className="py-2.5 px-5">{item.qty}</td>
                              <td className="py-2.5 px-5 font-medium">{item.product.name}</td>
                              <td className="py-2.5 px-5">{formatPEN(Number(item.unitPrice))}</td>
                              <td className="py-2.5 px-5">{formatPEN(0)}</td>
                              <td className="py-2.5 px-5 text-right font-semibold">{formatPEN(Number(item.unitPrice) * item.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detalle del pago */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Detalle del pago</h3>
                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-gray-400">Pago #1</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Banknote className="w-4 h-4 text-gray-400" />
                          <div>
                            <p className="text-[11px] text-gray-500">Medio de pago</p>
                            <p className="text-sm font-bold text-gray-900">{getPaymentMethodLabel(selectedSaleDetail.paymentMethod)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500">Monto total recibido</p>
                        <p className="text-lg font-black text-gray-900">{formatPEN(selectedSaleDetail.total)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TerminalShell>
  )
}
