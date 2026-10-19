import { useCashStatusStore } from '@/store/cashStatusStore'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Eye, EyeOff, PlusCircle, MinusCircle, Loader2, ChevronLeft, ChevronRight, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ExportButtons } from '@/components/ExportButtons'

// ============================================================
// CashMovementsScreen — Cash Movements Ledger & Registration
// ============================================================

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

const MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'set.', 'oct.', 'nov.', 'dic.']

function formatMovementDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

function formatUSD(val: number): string {
  return `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BalanceCard({ label, value, hidden, onToggle, mask }: { label: string; value: string; hidden: boolean; onToggle: () => void; mask: string }) {
  return (
    <Card className="relative rounded-xl border border-border bg-card p-6 shadow-2xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          onClick={onToggle}
          className="p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
          aria-pressed={hidden}
        >
          {hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <p className="text-2xl font-black tracking-tight text-foreground md:text-3xl">{hidden ? mask : value}</p>
    </Card>
  )
}

export function CashMovementsScreen() {
  const { tenantId, activeWorker } = useAuthStore()
  const summary = useCashStatusStore((s) => s.summary)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const montoCajaSoles = summary?.expectedCash ?? 0
  const montoCajaDolares = summary ? summary.movements.inUSD - summary.movements.outUSD : 0
  const [apiMovements, setApiMovements] = useState<ApiCashMovement[]>([])

  const [hideSoles, setHideSoles] = useState(false)
  const [hideDolares, setHideDolares] = useState(false)

  const [modalType, setModalType] = useState<'IN' | 'OUT' | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [reasonInput, setReasonInput] = useState('')
  const [currencyInput, setCurrencyInput] = useState<'PEN' | 'USD'>('PEN')
  const [savingMovement, setSavingMovement] = useState(false)

  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const fetchAll = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setLoadError(null)
    const todayStr = limaToday() // recomputed per fetch so a screen left open past midnight follows the new day
    try {
      // Cash figures come from the shared store (refreshed below); only the ledger is fetched here
      const movementsRes = await api.cash.movements.get({ query: { tenantId, date: todayStr } })
      if (movementsRes.error) throw movementsRes.error
      setApiMovements(movementsRes.data.data as ApiCashMovement[])
      void useCashStatusStore.getState().refresh(tenantId)
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Error de conexión'))
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const allMovements = useMemo(() => {
    const list: UnifiedMovement[] = apiMovements.map((m) => ({
      id: m.id,
      type: m.type === 'OUT' ? 'OUT' : 'IN',
      time: m.createdAt,
      reason: m.type === 'OPENING' ? 'Apertura de caja' : m.reason,
      amount: Number(m.amount || 0),
      currency: m.currency as 'PEN' | 'USD',
      source: m.type === 'OPENING' ? 'OPENING' : 'MANUAL',
    }))
    return list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [apiMovements])

  const totalItems = allMovements.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * pageSize
    return allMovements.slice(start, start + pageSize)
  }, [allMovements, page, pageSize])

  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, totalItems)

  const openModal = (type: 'IN' | 'OUT') => {
    setModalType(type)
    setSaveError(null)
    setCurrencyInput('PEN')
    setAmountInput('')
    setReasonInput('')
  }

  const handleSaveMovement = async () => {
    const val = Math.round(parseFloat(amountInput) * 100) / 100
    if (!val || val <= 0 || !reasonInput.trim() || !modalType || !activeWorker) return
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
      setSaveError(apiErrorMessage(err, 'Error de conexión'))
    } finally {
      setSavingMovement(false)
    }
  }

  const currencyBtn = (cur: 'PEN' | 'USD', text: string) => (
    <button
      type="button"
      aria-pressed={currencyInput === cur}
      onClick={() => setCurrencyInput(cur)}
      className={cn(
        'rounded-lg border py-2 text-xs font-bold transition-colors',
        currencyInput === cur ? 'border-success bg-success-soft text-success' : 'border-border bg-card text-foreground hover:bg-muted'
      )}
    >
      {text}
    </button>
  )

  const pagerBtn = 'rounded p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <TerminalShell activeSection="movimientos-caja">
      <div className="flex min-h-full flex-col bg-muted/50 p-4 text-foreground md:p-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Movimientos de caja</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">Registra tus movimientos de efectivo del día</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExportButtons name="movimientos-caja" disabled={allMovements.length === 0} getRows={() => [
              ['Fecha', 'Tipo', 'Concepto', 'Moneda', 'Monto'],
              ...allMovements.map((m) => [formatMovementDateTime(m.time), m.type === 'IN' ? 'Ingreso' : 'Salida', m.reason, m.currency, m.amount]),
            ]} />
            <Button onClick={() => openModal('OUT')} className="h-10 bg-primary px-5 text-xs font-bold tracking-wide text-primary-foreground shadow-2xs hover:bg-primary/90">
              Salida de dinero
            </Button>
            <Button onClick={() => openModal('IN')} className="h-10 bg-success px-5 text-xs font-bold tracking-wide text-success-foreground shadow-2xs hover:bg-success/90">
              Ingreso de dinero
            </Button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <BalanceCard label="Monto en caja en soles" value={formatPEN(montoCajaSoles)} hidden={hideSoles} onToggle={() => setHideSoles((v) => !v)} mask="S/ ••••••" />
          <BalanceCard label="Monto en caja en dólares" value={formatUSD(montoCajaDolares)} hidden={hideDolares} onToggle={() => setHideDolares((v) => !v)} mask="$••••••" />
        </div>

        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          <div className="flex min-h-[300px] flex-col justify-between overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[25%]" />
                <col className="w-[45%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-card font-semibold text-foreground">
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Hora</th>
                  <th className="px-6 py-4">Motivo</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" aria-hidden />
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={4} role="alert" className="py-20 text-center text-destructive">
                      No se pudieron cargar los movimientos: {loadError}{' '}
                      <button className="underline" onClick={fetchAll}>Reintentar</button>
                    </td>
                  </tr>
                ) : paginatedMovements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-muted-foreground">Sin movimientos de caja registrados hoy</td>
                  </tr>
                ) : (
                  paginatedMovements.map((item) => (
                    <tr key={item.id} className="h-14 transition-colors hover:bg-muted/70">
                      <td className="px-6 py-3">
                        {item.type === 'IN' ? (
                          <span className="inline-flex select-none items-center gap-1.5 rounded-md border border-success/40 bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                            <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" aria-hidden /> Entrada
                          </span>
                        ) : (
                          <span className="inline-flex select-none items-center gap-1.5 rounded-md border border-destructive/40 bg-danger-soft px-2 py-0.5 text-xs font-semibold text-destructive">
                            <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0" aria-hidden /> Salida
                          </span>
                        )}
                      </td>
                      <td className="truncate px-6 py-3">{formatMovementDateTime(item.time)}</td>
                      <td className="truncate px-6 py-3" title={item.reason}>{item.reason}</td>
                      <td className="px-6 py-3 text-right font-medium">
                        {item.type === 'OUT' ? '- ' : ''}
                        {item.currency === 'PEN' ? formatPEN(item.amount) : formatUSD(item.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t border-border px-6 py-3.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Label htmlFor="mov-page-size" className="text-xs font-normal text-muted-foreground">Movimientos por página</Label>
              <Select
                id="mov-page-size"
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
            <span>{totalItems === 0 ? '0 - 0 de 0' : `${startIndex}-${endIndex} de ${totalItems}`}</span>
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

        <Dialog open={!!modalType} onOpenChange={(o) => !o && !savingMovement && setModalType(null)}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {modalType === 'IN' ? (
                  <PlusCircle className="h-5 w-5 text-success" aria-hidden />
                ) : (
                  <MinusCircle className="h-5 w-5 text-destructive" aria-hidden />
                )}
                {modalType === 'IN' ? 'Registrar Ingreso de Dinero' : 'Registrar Salida de Dinero'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <span id="mov-currency-label" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Moneda</span>
                <div role="group" aria-labelledby="mov-currency-label" className="grid grid-cols-2 gap-2">
                  {currencyBtn('PEN', 'Soles (S/)')}
                  {currencyBtn('USD', 'Dólares ($)')}
                </div>
              </div>
              <div>
                <Label htmlFor="mov-amount" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Monto ({currencyInput === 'PEN' ? 'S/' : '$'})
                </Label>
                <Input
                  id="mov-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="font-semibold"
                />
              </div>
              <div>
                <Label htmlFor="mov-reason" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Motivo</Label>
                <Textarea
                  id="mov-reason"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder={modalType === 'IN' ? 'Ej: Ingreso por sencillo adicional' : 'Ej: Pago a proveedor de insumos'}
                  rows={3}
                  maxLength={200}
                  className="resize-none text-xs"
                />
              </div>
              {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" className="flex-1" onClick={() => setModalType(null)} disabled={savingMovement}>Cancelar</Button>
              <Button
                onClick={handleSaveMovement}
                disabled={savingMovement || !amountInput || parseFloat(amountInput) <= 0 || !reasonInput.trim()}
                className={cn(
                  'flex-1 text-xs font-bold',
                  modalType === 'IN'
                    ? 'bg-success text-success-foreground hover:bg-success/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {savingMovement ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                {modalType === 'IN' ? 'Guardar Ingreso' : 'Guardar Salida'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TerminalShell>
  )
}
