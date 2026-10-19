import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Printer, Mail, Banknote, ShoppingBag, FileText, Ban, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatPEN } from '@/lib/format'
import { ExportButtons } from '@/components/ExportButtons'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { DateFilters, type DateRange, type FilterType } from './reports/DateFilters'
import { formatDateKey } from './reports/helpers'
import { MailDialog, PrintDialog, VoidDialog, GuideDialog } from './sales-history/SaleDialogs'
import { SaleDetailDialog } from './sales-history/SaleDetailDialog'
import { StatusPill } from './sales-history/StatusPill'
import { formatTableDateTime, getCorrelativo, getDocumentTypeLabel, getPaymentMethodLabel, type Sale } from './sales-history/helpers'

// ============================================================
// SalesHistoryScreen — Sales History & Invoicing Register
// ============================================================

type StatusFilter = 'ALL' | 'ACTIVE' | 'CANCELLED'
type DocFilter = 'ALL' | 'BOLETA' | 'FACTURA' | 'TICKET'

const rowBtn = 'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
const pagerBtn = 'rounded p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent'
const barSelect = 'h-8 w-auto cursor-pointer border-0 bg-transparent px-1 py-0 text-xs font-semibold shadow-none'
const th = 'px-6 py-4'
const td = 'px-6 py-3 font-normal'

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-2xs">
      <div className="shrink-0 rounded-lg bg-muted p-3 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-black tracking-tight text-foreground">{value}</p>
      </div>
    </Card>
  )
}

export function SalesHistoryScreen() {
  const { tenantId, activeWorker } = useAuthStore()
  // Filtros desde el panel admin: ?date=hoy (por defecto) y ?status=CANCELLED
  const [searchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    searchParams.get('status') === 'CANCELLED' ? 'CANCELLED' : searchParams.get('status') === 'ACTIVE' ? 'ACTIVE' : 'ALL'
  )

  const [filterType, setFilterType] = useState<FilterType>('today')
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date()
    return { start: now, end: now }
  })
  const [documentFilter, setDocumentFilter] = useState<DocFilter>('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [sales, setSales] = useState<Sale[]>([])

  const [selectedSaleForPrint, setSelectedSaleForPrint] = useState<Sale | null>(null)
  const [selectedSaleForVoid, setSelectedSaleForVoid] = useState<Sale | null>(null)
  const [selectedSaleForMail, setSelectedSaleForMail] = useState<Sale | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidSubmitting, setVoidSubmitting] = useState(false)
  const [mailInput, setMailInput] = useState('')
  const [mailSuccess, setMailSuccess] = useState(false)
  const [mailSending, setMailSending] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)

  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

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

  // Fetch the selected Lima date range from the backend (no page-size truncation)
  const fromKey = formatDateKey(dateRange.start)
  const toKey = formatDateKey(dateRange.end)
  const fetchSalesData = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    try {
      // shortcut: una sola página de 500 ventas por rango; paginar en servidor si un rango supera eso
      const { data, error } = await api.pos.sales.get({
        query: {
          tenantId, limit: 500, page: 1,
          dateFrom: fromKey <= toKey ? fromKey : toKey, dateTo: fromKey <= toKey ? toKey : fromKey,
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        },
      })
      if (error) throw error
      setSales(((data.data as Sale[]) || []).map((s) => ({ ...s, total: Number(s.total) })))
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Error de conexión'))
    } finally {
      setLoading(false)
    }
  }, [tenantId, fromKey, toKey, statusFilter])

  useEffect(() => {
    fetchSalesData()
  }, [fetchSalesData])

  // Search + document type (date range is applied by the backend)
  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return sales.filter((sale) => {
      if (documentFilter !== 'ALL' && (sale.tipoComprobante || '').toUpperCase() !== documentFilter) return false
      if (term) {
        const client = (sale.clientName || 'sin cliente').toLowerCase()
        if (!getCorrelativo(sale).toLowerCase().includes(term) && !client.includes(term) && !String(sale.total).includes(term)) return false
      }
      return true
    })
  }, [sales, documentFilter, searchTerm])

  const exportRows = () => [
    ['Fecha', 'Comprobante', 'Tipo', 'Cliente', 'Documento', 'Pago', 'Cajero', 'Estado', 'Total'],
    ...filteredSales.map((s) => [
      formatTableDateTime(s.createdAt), getCorrelativo(s), getDocumentTypeLabel(s.tipoComprobante), s.clientName ?? '', s.clientDocNumber ?? '',
      getPaymentMethodLabel(s.paymentMethod), s.worker?.name ?? '', s.status === 'CANCELLED' ? 'Anulada' : 'Activa', Number(Number(s.total).toFixed(2)),
    ]),
  ]

  const activeSales = useMemo(() => filteredSales.filter((s) => s.status !== 'CANCELLED'), [filteredSales])
  const totalSalesSoles = useMemo(() => activeSales.reduce((sum, s) => sum + Number(s.total || 0), 0), [activeSales])

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize))
  const paginatedSales = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredSales.slice(start, start + pageSize)
  }, [filteredSales, page, pageSize])
  const startIndex = filteredSales.length === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, filteredSales.length)

  const openVoid = (sale: Sale) => {
    setSelectedSaleForVoid(sale)
    setVoidReason('')
    setVoidError(null)
  }

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
      toast.success('Solicitud de anulación enviada: queda pendiente de aprobación del administrador')
      setSelectedSaleForVoid(null)
      setVoidReason('')
      fetchSalesData()
    } catch (err) {
      setVoidError(apiErrorMessage(err, 'Error de conexión'))
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
        toast.success('Comprobante enviado por correo exitosamente')
      }, 1200)
    } catch (err) {
      toast.error(`Error al enviar correo: ${apiErrorMessage(err, 'Error de conexión')}`)
    } finally {
      setMailSending(false)
    }
  }

  return (
    <TerminalShell activeSection="sales-history">
      <div className="flex min-h-full flex-col bg-muted/50 p-4 text-foreground md:p-8">
        <div className="mb-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Historial de ventas</h1>
            <button
              onClick={() => setShowGuideModal(true)}
              className="mt-1 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-info hover:underline"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              ¿Cómo realizar una nota de crédito?
            </button>
          </div>
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

        <div className="mb-6 border-b border-border">
          <h2 className="inline-block border-b-2 border-success pb-2 text-xs font-bold text-success md:text-sm">Ventas</h2>
        </div>

        {/* ── Search & filter bar ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-2.5 shadow-2xs">
          <div className="flex min-w-48 flex-1 items-center gap-2 px-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="text"
              aria-label="Buscar correlativo o cliente"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar correlativo o cliente"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
            />
          </div>
          <div className="border-l border-border pl-3">
            <Select
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter)
                setPage(1)
              }}
              className={barSelect}
            >
              <option value="ALL">Todos los estados</option>
              <option value="ACTIVE">Activas</option>
              <option value="CANCELLED">Anuladas</option>
            </Select>
          </div>
          <div className="border-l border-border pl-3">
            <Select
              aria-label="Filtrar por tipo de documento"
              value={documentFilter}
              onChange={(e) => {
                setDocumentFilter(e.target.value as DocFilter)
                setPage(1)
              }}
              className={barSelect}
            >
              <option value="ALL">General</option>
              <option value="BOLETA">Boleta</option>
              <option value="FACTURA">Factura</option>
              <option value="TICKET">Ticket</option>
            </Select>
          </div>
          <div className="border-l border-border pl-3">
            <ExportButtons name="ventas" getRows={exportRows} disabled={filteredSales.length === 0} />
          </div>
        </div>

        {/* Ventas son solo en soles (el backend no registra ventas en USD) */}
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Kpi icon={<Banknote className="h-6 w-6 stroke-[1.5]" aria-hidden />} label="Total de ventas en soles" value={formatPEN(totalSalesSoles)} />
          <Kpi icon={<ShoppingBag className="h-6 w-6 stroke-[1.5]" aria-hidden />} label="Cantidad de ventas" value={activeSales.length} />
        </div>

        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          <div className="flex min-h-[360px] flex-col justify-between overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed text-left text-xs">
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
                <tr className="border-b border-border bg-card font-semibold text-foreground">
                  <th className={th}>Fecha y hora ▾</th>
                  <th className={th}>Tipo de documento</th>
                  <th className={th}>Correlativo</th>
                  <th className={th}>Cliente</th>
                  <th className={th}>Monto</th>
                  <th className={th}>Tipo de pago</th>
                  <th className={`${th} text-center`}>Estado</th>
                  <th className={`${th} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" aria-hidden />
                      Cargando ventas...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={8} role="alert" className="py-24 text-center text-destructive">
                      No se pudieron cargar las ventas: {loadError}{' '}
                      <button className="underline" onClick={fetchSalesData}>Reintentar</button>
                    </td>
                  </tr>
                ) : paginatedSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center text-muted-foreground">Sin ventas registradas en el periodo seleccionado</td>
                  </tr>
                ) : (
                  paginatedSales.map((sale) => (
                    <tr key={sale.id} className="h-14 transition-colors hover:bg-muted/70">
                      <td className={`${td} truncate`}>{formatTableDateTime(sale.createdAt)}</td>
                      <td className={`${td} truncate`}>{getDocumentTypeLabel(sale.tipoComprobante)}</td>
                      <td className={`${td} truncate`}>{getCorrelativo(sale)}</td>
                      <td className={`${td} truncate text-muted-foreground`}>{sale.clientName || 'Sin cliente'}</td>
                      <td className="px-6 py-3 font-semibold">{formatPEN(sale.total)}</td>
                      <td className={td}>{getPaymentMethodLabel(sale.paymentMethod)}</td>
                      <td className="px-6 py-3 text-center">
                        <StatusPill cancelled={sale.status === 'CANCELLED'} onClick={() => openSaleDetail(sale)} />
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            onClick={() => openVoid(sale)}
                            disabled={sale.status === 'CANCELLED'}
                            className={`${rowBtn} hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground`}
                            aria-label="Anular o emitir nota de crédito"
                            title="Anular o emitir nota de crédito"
                          >
                            <Ban className="h-4 w-4" aria-hidden />
                          </button>
                          <button onClick={() => setSelectedSaleForPrint(sale)} className={rowBtn} aria-label="Imprimir comprobante" title="Imprimir comprobante">
                            <Printer className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSaleForMail(sale)
                              setMailInput('')
                            }}
                            className={rowBtn}
                            aria-label="Enviar por correo"
                            title="Enviar por correo"
                          >
                            <Mail className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t border-border px-6 py-3.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Label htmlFor="sales-page-size" className="text-xs font-normal text-muted-foreground">Ventas por página</Label>
              <Select
                id="sales-page-size"
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
            <span>{filteredSales.length === 0 ? '0 - 0 de 0' : `${startIndex}-${endIndex} de ${filteredSales.length}`}</span>
            <div className="flex items-center gap-1">
              <button aria-label="Página anterior" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={pagerBtn}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button aria-label="Página siguiente" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={pagerBtn}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </Card>

        <PrintDialog sale={selectedSaleForPrint} onClose={() => setSelectedSaleForPrint(null)} />
        <VoidDialog
          sale={selectedSaleForVoid}
          reason={voidReason}
          onReason={setVoidReason}
          error={voidError}
          submitting={voidSubmitting}
          onConfirm={handleRequestVoid}
          onClose={() => setSelectedSaleForVoid(null)}
        />
        <MailDialog
          sale={selectedSaleForMail}
          email={mailInput}
          onEmail={setMailInput}
          sending={mailSending}
          success={mailSuccess}
          onSubmit={handleSendMail}
          onClose={() => setSelectedSaleForMail(null)}
        />
        <GuideDialog open={showGuideModal} onClose={() => setShowGuideModal(false)} />
        <SaleDetailDialog
          sale={selectedSaleDetail}
          loading={detailLoading}
          onClose={() => setSelectedSaleDetail(null)}
          onVoid={(s) => {
            openVoid(s)
            setSelectedSaleDetail(null)
          }}
        />
      </div>
    </TerminalShell>
  )
}
