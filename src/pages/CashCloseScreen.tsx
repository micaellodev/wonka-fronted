import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Inbox, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useCashStatusStore } from '@/store/cashStatusStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { CountRow } from './cash-close/CountRow'
import { PrintVoucherDialog } from './cash-close/PrintVoucherDialog'
import { ApprovalDialog, CloseSuccessDialog } from './cash-close/ApprovalDialogs'
import { formatSpanishDate, type CashCloseRecord } from './cash-close/helpers'

// ============================================================
// CashCloseScreen — Open Cash Register Dashboard & Close Flow
// ============================================================

interface TenantSettings {
  name: string
  ruc: string | null
  razonSocial: string | null
  nombreComercial: string | null
}

const cardCls = 'rounded-xl border border-border bg-card p-6 shadow-2xs'
const theadCls = 'border-b border-border text-xs font-medium text-muted-foreground'
const tbodyCls = 'divide-y divide-border text-foreground'

function SimpleTable({ rows }: { rows: { label: string; qty: number | string; amount: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-xs">
        <thead>
          <tr className={theadCls}>
            <th className="w-[50%] pb-3"><span className="sr-only">Concepto</span></th>
            <th className="w-[25%] pb-3">Cantidad</th>
            <th className="w-[25%] pb-3">Monto</th>
          </tr>
        </thead>
        <tbody className={tbodyCls}>
          {rows.map((r) => (
            <tr key={r.label} className="h-10">
              <th scope="row" className="py-2.5 text-left font-medium">{r.label}</th>
              <td className="py-2.5">{r.qty}</td>
              <td className="py-2.5">{r.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CashCloseScreen() {
  const navigate = useNavigate()
  const { tenantId, activeWorker, logout } = useAuthStore()
  const { summary, error: summaryError, refresh } = useCashStatusStore()

  const [currencyTab, setCurrencyTab] = useState<'soles' | 'dolares'>('soles')
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null)

  // User input counts (empty = counted equals expected)
  const [countedEfectivo, setCountedEfectivo] = useState<string>('')
  const [countedYape, setCountedYape] = useState<string>('')
  const [countedTarjeta, setCountedTarjeta] = useState<string>('')

  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [pendingClose, setPendingClose] = useState<CashCloseRecord | null>(null)
  const [submittingClose, setSubmittingClose] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [successClose, setSuccessClose] = useState(false)

  useEffect(() => {
    if (!activeWorker) navigate('/')
  }, [activeWorker, navigate])

  // Totals come from the shared cash store (GET /cash/summary, auto-refreshed); settings only name the business.
  const fetchData = useCallback(async () => {
    if (!tenantId) return
    setSettingsError(null)
    try {
      const { data, error } = await api.dashboard.settings.get({ query: { tenantId } })
      if (error) throw error
      if (data?.data) setTenantSettings(data.data as TenantSettings)
    } catch (err) {
      setSettingsError(apiErrorMessage(err, 'Error de conexión'))
    }
    await refresh(tenantId)
  }, [tenantId, refresh])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const loading = !summary && !summaryError
  const loadError = summary ? null : summaryError ?? settingsError

  const currentOpening = summary?.opening?.amount ?? 0
  // Todo lo que se cuadra es del TURNO actual (igual al día si hubo una sola apertura)
  const shiftData = summary?.shift
  const salesEfectivoTotal = shiftData?.sales.byMethod.efectivo ?? 0
  const totalTransactions = shiftData?.sales.count ?? 0
  const salesYapeTotal = shiftData?.sales.byMethod.yape ?? 0
  const salesTarjetaTotal = shiftData?.sales.byMethod.tarjeta ?? 0
  const totalNetSales = shiftData?.sales.total ?? 0
  const cancelledCount = shiftData?.voided.count ?? 0
  const cancelledAmount = shiftData?.voided.total ?? 0
  const totalCashIngresos = summary?.cashInflow ?? 0
  const totalCashSalidas = shiftData?.movements.out ?? 0
  const expectedEfectivo = summary?.expectedCash ?? 0
  const usdIn = shiftData?.movements.inUSD ?? 0
  const usdOut = shiftData?.movements.outUSD ?? 0

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

  const handleOpenDrawer = () => {
    // shortcut: no cash-drawer hardware integration yet; only informs the user.
    toast.info('Gaveta de dinero abierta')
  }

  const handleStartClose = async () => {
    if (!activeWorker || !tenantId) return
    if (!summary?.opening) {
      toast.error('La caja de hoy no tiene apertura registrada')
      return
    }
    if (!countsValid) {
      toast.error('Montos contados inválidos')
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
      void refresh(tenantId)
      setShowCloseModal(true)
      setPinError(null)
    } catch (err) {
      toast.error(`Error al solicitar cierre: ${apiErrorMessage(err, 'Error de conexión')}`)
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
        setPinError(apiErrorMessage(error, 'Error de conexión'))
        return
      }
      setSuccessClose(true)
      void refresh(tenantId)
      setTimeout(() => {
        logout()
        navigate('/')
      }, 2000)
    } catch (err) {
      setPinError(apiErrorMessage(err, 'Error de conexión'))
    } finally {
      setApproving(false)
    }
  }

  const companyTitle = `Caja ${tenantSettings?.nombreComercial || tenantSettings?.name || ''}`.trim()
  const companyLegal = tenantSettings?.razonSocial ?? ''
  const openingTimeString = summary?.opening
    ? formatSpanishDate(summary.opening.at)
    : 'Sin apertura registrada'

  const banner = {
    SIN_DATOS: { tag: '...', sign: 'bg-muted-foreground', title: 'Estado de caja no disponible', text: 'Consultando al servidor...' },
    NO_ABIERTA: { tag: 'CERRADO', sign: 'bg-muted-foreground', title: 'Caja no abierta', text: 'Registra la apertura para empezar a vender.' },
    ABIERTA: { tag: 'ABIERTO', sign: 'bg-success', title: 'Caja Abierta', text: '¡Qué tengas un excelente día lleno de ventas!' },
    PENDIENTE: { tag: 'PENDIENTE', sign: 'bg-warning', title: 'Cierre pendiente de aprobación', text: 'Esperando la aprobación de un administrador.' },
    CERRADA: { tag: 'CERRADO', sign: 'bg-destructive', title: 'Caja Cerrada', text: 'El turno terminó. Puedes abrir un turno nuevo.' },
  }[summary?.cashStatus ?? 'SIN_DATOS']

  const tabCls = (active: boolean) =>
    cn(
      'relative pb-2.5 text-xs font-semibold transition-colors md:text-sm',
      active ? 'border-b-2 border-success font-bold text-success' : 'text-muted-foreground hover:text-foreground'
    )
  const outlineBtn = 'h-10 gap-2 border-border bg-card px-4 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted'

  return (
    <TerminalShell activeSection="cash-close">
      <div className="flex min-h-full flex-col bg-muted/50 p-4 text-foreground md:p-8">
        {/* ── Top Header ── */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Apertura y cierre de caja</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setShowPrintModal(true)} className={outlineBtn}>
              <Printer className="h-4 w-4" aria-hidden /> Imprimir
            </Button>
            {summary?.cashStatus === 'CERRADA' && (
              <Button onClick={() => navigate('/cash-guard')} className="h-10 px-5 text-xs font-bold tracking-wide">
                Abrir turno nuevo
              </Button>
            )}
            <Button variant="outline" onClick={handleOpenDrawer} className={outlineBtn}>
              <Inbox className="h-4 w-4" aria-hidden /> Abrir gaveta
            </Button>
            <Button
              onClick={handleStartClose}
              disabled={submittingClose || loading || !summary || !countsValid || !!summary.close}
              className="h-10 bg-primary px-5 text-xs font-bold tracking-wide text-primary-foreground shadow-2xs transition-colors hover:bg-primary/90"
            >
              {submittingClose ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
              Cerrar Caja
            </Button>
          </div>
        </div>

        {/* ── Status Banner Card: always reflects the backend cashStatus ── */}
        <div className={cn(cardCls, 'mb-6 flex items-center gap-6')}>
          <div className="relative flex shrink-0 select-none flex-col items-center" aria-hidden>
            <svg width="44" height="18" viewBox="0 0 44 18" className="overflow-visible">
              <circle cx="22" cy="2" r="2.5" className="fill-muted-foreground" />
              <circle cx="22" cy="2" r="1" className="fill-foreground" />
              <line x1="22" y1="2" x2="6" y2="18" className="stroke-border" strokeWidth="1.5" />
              <line x1="22" y1="2" x2="38" y2="18" className="stroke-border" strokeWidth="1.5" />
            </svg>
            <div className={cn(banner.sign, 'rounded-sm px-3.5 py-1.5 text-xs font-extrabold tracking-wider text-primary-foreground shadow-xs')}>
              {banner.tag}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight">{banner.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{banner.text}</p>
            {loading && <p className="mt-1 text-xs text-muted-foreground">Cargando totales...</p>}
            {loadError && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                No se pudieron cargar los totales: {loadError}{' '}
                <button className="underline" onClick={fetchData}>Reintentar</button>
              </p>
            )}
            {summary?.close && (
              <p className="mt-1 text-xs text-warning">
                Cierre del turno {summary.close.status === 'APPROVED' ? 'aprobado' : 'pendiente de aprobación'} ·
                diferencia {formatPEN(summary.close.difference)}
              </p>
            )}
          </div>
        </div>

        {/* ── Company Metadata & Key Totals Card ── */}
        <div className={cn(cardCls, 'mb-6 space-y-6')}>
          <div className="grid grid-cols-1 gap-6 border-b border-border pb-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <h3 className="text-sm font-bold">{companyTitle}</h3>
              <p className="mt-0.5 text-[11px] font-medium uppercase leading-snug text-muted-foreground">{companyLegal}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hora de apertura</p>
              <p className="mt-1 text-xs font-medium md:text-sm">{openingTimeString}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Apertura de caja (S/)</p>
              <p className="mt-1 text-xs font-medium md:text-sm">{formatPEN(currentOpening)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="text-2xl font-black tracking-tight md:text-3xl">{formatPEN(totalNetSales)}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">Total de ventas neto soles</p>
              <span
                className={cn(
                  'mt-2 inline-block rounded px-2.5 py-0.5 text-xs font-semibold',
                  totalDifference >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive'
                )}
              >
                {totalDifference >= 0 ? '+ ' : '- '}
                {formatPEN(Math.abs(totalDifference))} de diferencia
              </span>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight md:text-3xl">{totalTransactions}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">Transacciones</p>
            </div>
          </div>
        </div>

        {/* ── Currency Tabs (Centered) ── */}
        <div className="mb-6 flex justify-center">
          <div role="tablist" aria-label="Moneda" className="flex items-center gap-8 border-b border-border px-6">
            <button role="tab" aria-selected={currencyTab === 'soles'} onClick={() => setCurrencyTab('soles')} className={tabCls(currencyTab === 'soles')}>
              Soles
            </button>
            <button role="tab" aria-selected={currencyTab === 'dolares'} onClick={() => setCurrencyTab('dolares')} className={tabCls(currencyTab === 'dolares')}>
              Dólares
            </button>
          </div>
        </div>

        {/* ── Main Data Sections ── */}
        {currencyTab === 'dolares' ? (
          <Card className={cardCls}>
            <h3 className="mb-4 text-sm font-bold">Movimientos de caja en dólares</h3>
            <SimpleTable
              rows={[
                { label: 'Entrada de dinero', qty: '-', amount: `$ ${usdIn.toFixed(2)}` },
                { label: 'Salida de dinero', qty: '-', amount: `$ ${usdOut.toFixed(2)}` },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">Las ventas se registran solo en soles.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className={cardCls}>
              <h3 className="mb-4 text-sm font-bold">Resultados de turno por método de pago</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className={theadCls}>
                      <th className="w-[24%] pb-3"><span className="sr-only">Método</span></th>
                      <th className="w-[16%] pb-3">Ventas + ingresos</th>
                      <th className="w-[16%] pb-3">Salidas</th>
                      <th className="w-[16%] pb-3">Monto esperado</th>
                      <th className="w-[14%] pb-3">Monto contado</th>
                      <th className="w-[14%] pb-3">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyCls}>
                    <CountRow
                      id="counted-efectivo"
                      label="Efectivo en caja"
                      income={totalCashIngresos}
                      outcome={totalCashSalidas}
                      expected={expectedEfectivo}
                      counted={countedEfectivo}
                      onCounted={setCountedEfectivo}
                      diff={diffEfectivo}
                    />
                  </tbody>
                </table>

                <div className="my-4 border-t border-border" />

                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className={theadCls}>
                      <th className="w-[24%] pb-3"><span className="sr-only">Método</span></th>
                      <th className="w-[16%] pb-3">Ventas</th>
                      <th className="w-[16%] pb-3">Monto esperado</th>
                      <th className="w-[14%] pb-3">Monto contado</th>
                      <th className="w-[14%] pb-3">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyCls}>
                    <CountRow id="counted-yape" label="QR YAPE" income={salesYapeTotal} expected={salesYapeTotal} counted={countedYape} onCounted={setCountedYape} diff={diffYape} />
                    <CountRow id="counted-tarjeta" label="Tarjeta" income={salesTarjetaTotal} expected={salesTarjetaTotal} counted={countedTarjeta} onCounted={setCountedTarjeta} diff={diffTarjeta} />
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className={cardCls}>
              <h3 className="mb-4 text-sm font-bold">Resumen del turno</h3>
              <SimpleTable
                rows={[
                  { label: 'Anulaciones', qty: cancelledCount, amount: formatPEN(cancelledAmount) },
                  { label: 'Total de ventas neto', qty: totalTransactions, amount: formatPEN(totalNetSales) },
                ]}
              />
            </Card>

            <Card className={cardCls}>
              <h3 className="mb-4 text-sm font-bold">Movimientos de caja</h3>
              <SimpleTable
                rows={[
                  { label: 'Entrada de dinero', qty: shiftData?.movements.inCount ?? 0, amount: formatPEN(shiftData?.movements.in ?? 0) },
                  { label: 'Salida de dinero', qty: summary?.movements.outCount ?? 0, amount: formatPEN(totalCashSalidas) },
                ]}
              />
            </Card>
          </div>
        )}

        <PrintVoucherDialog
          open={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          companyTitle={companyTitle}
          companyLegal={companyLegal}
          openingTime={openingTimeString}
          cashier={activeWorker?.name || 'Administrador'}
          opening={currentOpening}
          salesEfectivo={salesEfectivoTotal}
          salesYape={salesYapeTotal}
          salesTarjeta={salesTarjetaTotal}
          totalNet={totalNetSales}
          expected={expectedEfectivo}
          counted={valCountedEfectivo}
          diff={diffEfectivo}
        />
        <ApprovalDialog
          open={showCloseModal && !!pendingClose && !successClose}
          onClose={() => setShowCloseModal(false)}
          onPin={handleApprovePin}
          approving={approving}
          pinError={pinError}
          totalDifference={totalDifference}
        />
        <CloseSuccessDialog open={successClose} />
      </div>
    </TerminalShell>
  )
}
