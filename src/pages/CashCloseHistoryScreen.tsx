import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Calendar, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  closedDate: string
  createdAt: string
  worker: {
    id: string
    name: string
  }
}

export function CashCloseHistoryScreen() {
  const { tenantId } = useAuthStore()
  const navigate = useNavigate()

  const [records, setRecords] = useState<CashCloseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<number>(30)

  const fetchHistory = async () => {
    setLoading(true)
    try {
      if (!tenantId) return

      const response = await api.cash.history.get({
        query: { tenantId, days },
      })

      if (!response.error) {
        const data = (response.data as any).data
        setRecords(data || [])
      }
    } catch (error) {
      console.error('Error fetching cash close history:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [tenantId, days])

  const totalSalesSum = records.reduce((acc, r) => acc + r.totalSales, 0)
  const totalExpectedSum = records.reduce((acc, r) => acc + r.totalExpected, 0)
  const totalCountedSum = records.reduce((acc, r) => acc + r.countedCash, 0)
  const totalDifferenceSum = records.reduce((acc, r) => acc + r.difference, 0)

  const recordsWithBalance = records.map((r) => ({
    ...r,
    balance: r.difference === 0 ? 'Cuadrado' : r.difference > 0 ? 'Sobrante' : 'Faltante',
    balanceClass:
      r.difference === 0
        ? 'text-emerald-300 bg-emerald-950/50'
        : r.difference > 0
          ? 'text-sky-300 bg-sky-950/50'
          : 'text-red-300 bg-red-950/50',
  }))

  function formatCurrency(v: number) {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(v)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 bg-card border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/pos')}
            variant="outline"
          >
            Volver
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" /> Historial de Arqueos
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Cierre de caja diario</p>
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
              <CardTitle className="text-2xl text-emerald-300">{formatCurrency(totalSalesSum)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{records.length} cierres registrados</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Total Esperado</CardDescription>
              <CardTitle className="text-2xl text-amber-300">{formatCurrency(totalExpectedSum)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Apertura + ventas</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Total Contado</CardDescription>
              <CardTitle className="text-2xl text-sky-300">{formatCurrency(totalCountedSum)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Efectivo fisico</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Diferencia Total</CardDescription>
              <CardTitle
                className={`text-2xl ${
                  totalDifferenceSum === 0 ? 'text-emerald-300' : totalDifferenceSum > 0 ? 'text-sky-300' : 'text-red-300'
                }`}
              >
                {formatCurrency(totalDifferenceSum)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {totalDifferenceSum === 0 ? 'Cuadrado' : totalDifferenceSum > 0 ? 'Sobrante' : 'Faltante'}
            </CardContent>
          </Card>
        </div>

        {/* History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-300" />
              Historial Detallado
            </CardTitle>
            <CardDescription>Récord de cada cierre de caja por día</CardDescription>
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
                        <td className="py-3 px-4 text-right font-semibold text-amber-300">{formatCurrency(record.totalExpected)}</td>
                        <td className="py-3 px-4 text-right text-emerald-300">{formatCurrency(record.expectedEfectivo)}</td>
                        <td className="py-3 px-4 text-right text-fuchsia-300">{formatCurrency(record.expectedYape)}</td>
                        <td className="py-3 px-4 text-right text-cyan-300">{formatCurrency(record.expectedTarjeta)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-sky-300">{formatCurrency(record.countedCash)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${record.difference === 0 ? 'text-emerald-300' : record.difference > 0 ? 'text-sky-300' : 'text-red-300'}`}>
                          {formatCurrency(record.difference)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center">
                            {record.difference === 0 ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className={`w-5 h-5 ${record.difference > 0 ? 'text-sky-400' : 'text-red-400'}`} />
                            )}
                          </div>
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
    </div>
  )
}
