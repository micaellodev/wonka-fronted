import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Calendar, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw, Lock, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TerminalShell } from '@/components/TerminalShell'
import { PinPad } from '@/components/PinPad'

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
 createdAt: string
 worker: {
 id: string
 name: string
 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiErrorMessage = (e: any): string => e?.value?.message ?? e?.value?.error ?? 'Error de conexión'

interface CashCloseHistoryScreenProps {
 title?: string
 subtitle?: string
 section?: 'cash-history' | 'movimientos-caja'
}

export function CashCloseHistoryScreen({
 title = 'Historial de Arqueos',
 subtitle = 'Cierre de caja diario',
 section = 'cash-history',
}: CashCloseHistoryScreenProps = {}) {
 const { tenantId, activeWorker } = useAuthStore()
 const isAdmin = activeWorker?.role?.name === 'ADMIN' || activeWorker?.role?.name === 'ADMINISTRADOR'
 const navigate = useNavigate()

 const [records, setRecords] = useState<CashCloseRecord[]>([])
 const [totals, setTotals] = useState({ totalSales: 0, totalExpected: 0, countedCash: 0, difference: 0 })
 const [loading, setLoading] = useState(true)
 const [days, setDays] = useState<number>(30)
 const [approvingRecord, setApprovingRecord] = useState<CashCloseRecord | null>(null)
 const [approving, setApproving] = useState(false)
 const [approvePinError, setApprovePinError] = useState<string | null>(null)
 const [loadError, setLoadError] = useState<string | null>(null)

 const fetchHistory = useCallback(async () => {
 if (!tenantId) return
 setLoading(true)
 setLoadError(null)
 try {
 const response = await api.cash.history.get({
 query: { tenantId, days },
 })
 if (response.error) throw response.error
 setRecords((response.data.data as CashCloseRecord[]) || [])
 setTotals((response.data as unknown as { totals: typeof totals }).totals)
 } catch (error) {
 setLoadError(apiErrorMessage(error))
 } finally {
 setLoading(false)
 }
 }, [tenantId, days])

 useEffect(() => {
 fetchHistory()
 }, [fetchHistory])


 const recordsWithBalance = records.map((r) => ({
 ...r,
 balance: r.difference === 0 ? 'Cuadrado' : r.difference > 0 ? 'Sobrante' : 'Faltante',
 balanceClass:
 r.difference === 0
 ? 'text-success bg-success-soft'
 : r.difference > 0
 ? 'text-info bg-info-soft'
 : 'text-destructive bg-danger-soft',
 }))

 function formatCurrency(v: number) {
 return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(v)
 }

 function formatDate(value: string | Date) {
 // closedDate is a plain YYYY-MM-DD (Lima day); Eden may already hand it over as a Date at UTC midnight
 const d = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`)
 return d.toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' })
 }

 const handleApprovePin = async (pin: string) => {
 if (!approvingRecord || !tenantId) return
 setApproving(true)
 setApprovePinError(null)
 try {
 // Backend resolves the approving admin from the code (approval code or admin PIN)
 const { error } = await api.cash.close({ id: approvingRecord.id }).approve.post({
 tenantId,
 approverCode: pin,
 })
 if (error) {
 setApprovePinError(apiErrorMessage(error))
 return
 }
 setApprovingRecord(null)
 fetchHistory()
 } catch (err) {
 setApprovePinError(apiErrorMessage(err))
 } finally {
 setApproving(false)
 }
 }

 return (
 <TerminalShell activeSection={section}>
 <div className="flex h-full min-h-0 min-w-0 flex-col bg-transparent text-foreground">
 <header className="px-6 py-4 bg-card border-b flex items-center justify-between shrink-0">
 <div className="flex items-center gap-4">
 <Button
 onClick={() => navigate(isAdmin ? '/admin' : '/pos')}
 variant="outline"
 className={isAdmin ? 'hidden' : ''}
 >
 Volver
 </Button>
 <div>
 <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
 <Calendar className="w-5 h-5 text-accent-500" /> {title}
 </h1>
 <p className="text-xs text-muted-foreground uppercase tracking-widest">{subtitle}</p>
 </div>
 </div>
 <Button
 onClick={fetchHistory}
 variant="outline"
 className="inline-flex items-center gap-2"
 >
 <RefreshCw className="w-4 h-4" /> Actualizar
 </Button>
 </header>

 <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
 {/* Period Selector */}
 <div className="flex items-center gap-2">
 <span className="text-sm text-muted-foreground">Periodo:</span>
 {[7, 14, 30, 90].map((d) => (
 <Button
 key={d}
 onClick={() => setDays(d)}
 size="sm"
 variant={days === d ? 'default' : 'secondary'}
 >
 {d} dias
 </Button>
 ))}
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
 <Card>
 <CardHeader>
 <CardDescription>Total Vendido</CardDescription>
 <CardTitle className="text-2xl text-secondary-500">{formatCurrency(totals.totalSales)}</CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-muted-foreground">{records.length} cierres registrados</CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardDescription>Total Esperado</CardDescription>
 <CardTitle className="text-2xl text-accent-500">{formatCurrency(totals.totalExpected)}</CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-muted-foreground">Apertura + ventas</CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardDescription>Total Contado</CardDescription>
 <CardTitle className="text-2xl text-secondary-500">{formatCurrency(totals.countedCash)}</CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-muted-foreground">Efectivo fisico</CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardDescription>Diferencia Total</CardDescription>
 <CardTitle
 className={`text-2xl ${totals.difference === 0 ? 'text-secondary-500' : totals.difference > 0 ? 'text-secondary-500' : 'text-brand-400'
 }`}
 >
 {formatCurrency(totals.difference)}
 </CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-muted-foreground">
 {totals.difference === 0 ? 'Cuadrado' : totals.difference > 0 ? 'Sobrante' : 'Faltante'}
 </CardContent>
 </Card>
 </div>

 {/* History Table */}
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <TrendingUp className="w-4 h-4 text-gray-600" />
 Historial Detallado
 </CardTitle>
 <CardDescription>Récord de cada cierre de caja por dia</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b">
 <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Fecha</th>
 <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Cajero</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Apertura</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Ventas</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Esperado</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Esperado Efectivo</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Esperado Yape</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Esperado Tarjeta</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Contado</th>
 <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Diferencia</th>
 <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Estado</th>
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr>
 <td colSpan={11} className="py-8 text-center text-muted-foreground">
 Cargando...
 </td>
 </tr>
 ) : loadError ? (
 <tr>
 <td colSpan={11} className="py-8 text-center text-destructive">
 No se pudo cargar el historial: {loadError}
 </td>
 </tr>
 ) : recordsWithBalance.length === 0 ? (
 <tr>
 <td colSpan={11} className="py-8 text-center text-muted-foreground">
 Sin registros para mostrar
 </td>
 </tr>
 ) : (
 recordsWithBalance.map((record) => (
 <tr key={record.id} className="border-b hover:bg-muted/50">
 <td className="py-3 px-4">{formatDate(record.closedDate)}</td>
 <td className="py-3 px-4">{record.worker.name}</td>
 <td className="py-3 px-4 text-right">{formatCurrency(record.openingBalance)}</td>
 <td className="py-3 px-4 text-right">{formatCurrency(record.totalSales)}</td>
 <td className="py-3 px-4 text-right font-semibold text-accent-500">{formatCurrency(record.totalExpected)}</td>
 <td className="py-3 px-4 text-right text-secondary-500">{formatCurrency(record.expectedEfectivo)}</td>
 <td className="py-3 px-4 text-right text-accent-500">{formatCurrency(record.expectedYape)}</td>
 <td className="py-3 px-4 text-right text-secondary-500">{formatCurrency(record.expectedTarjeta)}</td>
 <td className="py-3 px-4 text-right font-semibold text-secondary-500">{formatCurrency(record.countedCash)}</td>
 <td className={`py-3 px-4 text-right font-semibold ${record.difference === 0 ? 'text-secondary-500' : record.difference > 0 ? 'text-secondary-500' : 'text-brand-400'}`}>
 {formatCurrency(record.difference)}
 </td>
 <td className="py-3 px-4 text-center">
 {record.status === 'PENDING_APPROVAL' ? (
 <button
 onClick={() => { setApprovingRecord(record); setApprovePinError(null) }}
 className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-warning-soft text-warning hover:bg-warning-soft/70 transition-colors"
 title="Pendiente — clic para aprobar"
 >
 <Lock className="w-3.5 h-3.5" /> Pendiente
 </button>
 ) : (
 <div className="flex justify-center items-center gap-1.5 text-xs font-bold text-success" title={record.difference === 0 ? 'Sin diferencia' : 'Con diferencia'}>
 Cerrada
 {record.difference === 0 ? (
 <CheckCircle2 className="w-5 h-5 text-secondary-500" />
 ) : (
 <AlertTriangle className={`w-5 h-5 ${record.difference > 0 ? 'text-secondary-500' : 'text-brand-500'}`} />
 )}
 </div>
 )}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>
 </main>

 {/* Pending close approval modal */}
 {approvingRecord && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
 <Card className="w-full max-w-md bg-white border-gray-200 rounded-2xl shadow-2xl p-6">
 <div className="flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
 <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
 <Lock className="w-4 h-4 text-orange-600" />
 Aprobar Cierre Pendiente
 </h3>
 <button
 onClick={() => { if (!approving) setApprovingRecord(null) }}
 className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
 >
 <X className="h-5 w-5" />
 </button>
 </div>

 <div className="text-center text-xs text-gray-500 mb-6 space-y-1">
 <p>Ingrese el código de aprobación (6 dígitos) del administrador para aprobar este cierre.</p>
 <p className="font-semibold text-gray-800">
 {formatDate(approvingRecord.closedDate)} · {approvingRecord.worker.name} · Diferencia: {formatCurrency(approvingRecord.difference)}
 </p>
 </div>

 <PinPad onComplete={handleApprovePin} disabled={approving} hasError={!!approvePinError} length={6} />

 {approvePinError && (
 <p className="text-center text-xs text-destructive font-medium mt-3">
 {approvePinError}
 </p>
 )}

 {approving && (
 <div className="flex justify-center mt-4">
 <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
 </div>
 )}
 </Card>
 </div>
 )}
 </div>
 </TerminalShell>
 )
}

