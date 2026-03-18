import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { BarChart2, TrendingUp, Calendar, CreditCard, Timer, Users, Activity, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Assuming Sale structure based on backend implementation
interface SaleItem {
    id: string;
    productName: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
}

interface Sale {
    id: string;
    total: number;
    worker: { name: string };
    createdAt: string;
    items: SaleItem[];
}

interface PlayzoneTopChild {
    childId: string
    childName: string
    sessions: number
    totalMinutes: number
    averageMinutes: number
}

interface PlayzoneRecent {
    id: string
    wristbandCode: string
    childName: string
    guardianName: string
    startTime: string
    endTime: string
    elapsedMinutes: number
    overtimeMinutes: number
}

interface PlayzoneSummary {
    periodDays: number
    completedSessions: number
    activeSessions: number
    uniqueChildren: number
    totalPlayedMinutes: number
    averageMinutesPerSession: number
    averageMinutesPerChild: number
    totalOvertimeMinutes: number
    topChildren: PlayzoneTopChild[]
    recentCompleted: PlayzoneRecent[]
}

const PLAYZONE_EXTRA_RATE = 1

export function ReportsScreen() {
    const { tenantId } = useAuthStore()

    const [sales, setSales] = useState<Sale[]>([])
    const [allSales, setAllSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'7' | '30' | '90'>('30')
    const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date()))
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [playzoneSummary, setPlayzoneSummary] = useState<PlayzoneSummary | null>(null)
    const playzoneOvertimeRevenue = (playzoneSummary?.totalOvertimeMinutes ?? 0) * PLAYZONE_EXTRA_RATE
    const combinedRevenue = totalRevenue + playzoneOvertimeRevenue

    const dailySales = allSales.filter((s) => getLocalDateKey(new Date(s.createdAt)) === selectedDate)
    const dailyRevenue = dailySales.reduce((acc, sale) => acc + Number(sale.total), 0)
    const averageTicket = dailySales.length > 0 ? dailyRevenue / dailySales.length : 0

    const fetchSales = useCallback(async () => {
        setLoading(true)
        try {
            const days = Number(activeTab)
            const [salesRes, playzoneRes] = await Promise.all([
                api.pos.sales.get({ query: { tenantId, limit: 300, page: 1 } }),
                (api.playzone.reports as any).summary.get({ query: { tenantId, days } }),
            ])

            if (!salesRes.error) {
                const response = salesRes.data as unknown as { data: Sale[] }
                const sourceSales = response.data ?? []
                setAllSales(sourceSales)
                const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
                const salesData = sourceSales.filter((s) => new Date(s.createdAt) >= fromDate)
                setSales(salesData)
                setTotalRevenue(salesData.reduce((acc, sale) => acc + Number(sale.total), 0))
            }

            if (!playzoneRes.error) {
                const response = playzoneRes.data as { data: PlayzoneSummary }
                setPlayzoneSummary(response.data)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId, activeTab])

    useEffect(() => {
        fetchSales()
    }, [fetchSales])

    function formatCurrency(v: number) {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(v)
    }

    function formatDate(iso: string) {
        return new Date(iso).toLocaleString('es-CO', {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        })
    }

    function formatMinutes(value: number) {
        const mins = Math.round(value)
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${mins} min`
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col rounded-sm rounded">
            <header className="px-6 py-4 bg-card border-b flex items-center justify-between shrink-0 rounded">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-white" /> Dashboard Reportes
                        </h1>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest">POS + Zona de Juegos</p>
                    </div>
                </div>
                <Button
                    onClick={fetchSales}
                    variant="outline"
                    className="inline-flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" /> Actualizar
                </Button>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
                <Tabs>
                    <TabsList>
                        <TabsTrigger active={activeTab === '7'} onClick={() => setActiveTab('7')}>7 dias</TabsTrigger>
                        <TabsTrigger active={activeTab === '30'} onClick={() => setActiveTab('30')}>30 dias</TabsTrigger>
                        <TabsTrigger active={activeTab === '90'} onClick={() => setActiveTab('90')}>90 dias</TabsTrigger>
                    </TabsList>

                    <TabsContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                            <Card>
                                <CardHeader>
                                    <CardDescription>Ingresos Totales (POS + Juegos Extra)</CardDescription>
                                    <CardTitle className="text-2xl text-emerald-300">{formatCurrency(combinedRevenue)}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="w-4 h-4" />POS: {formatCurrency(totalRevenue)} · Juegos: {formatCurrency(playzoneOvertimeRevenue)}</CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardDescription>Ingresos POS (Productos)</CardDescription>
                                    <CardTitle className="text-2xl text-lime-300">{formatCurrency(totalRevenue)}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center gap-2 text-muted-foreground"><CreditCard className="w-4 h-4" />Solo ventas de productos</CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardDescription>Ingresos Juegos Extra</CardDescription>
                                    <CardTitle className="text-2xl text-sky-300">{formatCurrency(playzoneOvertimeRevenue)}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center gap-2 text-muted-foreground"><Timer className="w-4 h-4" />Minutos extra cobrables</CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardDescription>Transacciones</CardDescription>
                                    <CardTitle className="text-2xl">{sales.length}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center gap-2 text-muted-foreground"><CreditCard className="w-4 h-4" />Tickets POS (los extras de juegos se integran por metrica)</CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardDescription>Tiempo Promedio Por Nino</CardDescription>
                                    <CardTitle className="text-2xl text-cyan-300">{formatMinutes(playzoneSummary?.averageMinutesPerChild ?? 0)}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center gap-2 text-muted-foreground"><Users className="w-4 h-4" />Zona de Juegos</CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardDescription>Tiempo Promedio Por Sesion</CardDescription>
                                    <CardTitle className="text-2xl text-violet-300">{formatMinutes(playzoneSummary?.averageMinutesPerSession ?? 0)}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center gap-2 text-muted-foreground"><Timer className="w-4 h-4" />{playzoneSummary?.completedSessions ?? 0} sesiones completadas</CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4 text-amber-400" />Metrica Zona de Juegos</CardTitle>
                            <CardDescription>Resumen operativo del periodo</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3">
                                <Metric label="Sesiones activas" value={String(playzoneSummary?.activeSessions ?? 0)} />
                                <Metric label="Ninos unicos" value={String(playzoneSummary?.uniqueChildren ?? 0)} />
                                <Metric label="Tiempo total jugado" value={formatMinutes(playzoneSummary?.totalPlayedMinutes ?? 0)} />
                                <Metric label="Minutos extra" value={formatMinutes(playzoneSummary?.totalOvertimeMinutes ?? 0)} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" />Top Ninos Por Tiempo</CardTitle>
                            <CardDescription>Ranking por minutos acumulados</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Cargando...</p>
                            ) : (playzoneSummary?.topChildren.length ?? 0) === 0 ? (
                                <p className="text-sm text-muted-foreground">Sin sesiones completadas.</p>
                            ) : (
                                <div className="space-y-2">
                                    {playzoneSummary?.topChildren.map((child) => (
                                        <div key={child.childId} className="flex items-center justify-between rounded-lg border px-3 py-2">
                                            <div>
                                                <p className="font-medium">{child.childName}</p>
                                                <p className="text-xs text-muted-foreground">{child.sessions} sesiones</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-cyan-300">{formatMinutes(child.totalMinutes)}</p>
                                                <p className="text-xs text-muted-foreground">prom: {formatMinutes(child.averageMinutes)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-zinc-300" />
                                    Reporte Diario
                                </CardTitle>
                                <CardDescription>Consulta ventas por fecha con calendario</CardDescription>
                            </div>
                            <div className="w-full max-w-[220px]">
                                <Input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    max={getLocalDateKey(new Date())}
                                    className="font-mono"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Metric label="Transacciones del dia" value={String(dailySales.length)} />
                            <Metric label="Total del dia" value={formatCurrency(dailyRevenue)} />
                            <Metric label="Ticket promedio" value={formatCurrency(averageTicket)} />
                        </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Hora</TableHead>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Cajero</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dailySales.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4}>No hay ventas para la fecha seleccionada.</TableCell>
                                        </TableRow>
                                    ) : (
                                        dailySales
                                            .slice()
                                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                            .map((sale) => (
                                                <TableRow key={sale.id}>
                                                    <TableCell>
                                                        {new Date(sale.createdAt).toLocaleTimeString('es-CO', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </TableCell>
                                                    <TableCell>{sale.id.slice(0, 10)}...</TableCell>
                                                    <TableCell>{sale.worker?.name || 'Desconocido'}</TableCell>
                                                    <TableCell className="text-right font-semibold text-emerald-300">
                                                        {formatCurrency(Number(sale.total))}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-300" />Ventas Recientes POS</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Cajero</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={4}>Cargando ventas...</TableCell></TableRow>
                                    ) : sales.length === 0 ? (
                                        <TableRow><TableCell colSpan={4}>No hay ventas registradas.</TableCell></TableRow>
                                    ) : (
                                        sales.slice(0, 20).map((sale) => (
                                            <TableRow key={sale.id}>
                                                <TableCell>{formatDate(sale.createdAt)}</TableCell>
                                                <TableCell>{sale.id.slice(0, 10)}...</TableCell>
                                                <TableCell>{sale.worker?.name || 'Desconocido'}</TableCell>
                                                <TableCell className="text-right font-semibold text-emerald-300">{formatCurrency(Number(sale.total))}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Timer className="w-4 h-4 text-cyan-300" />Sesiones Completadas Zona de Juegos</CardTitle>
                        <CardDescription>Tiempo aproximado jugado por sesion y exceso</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Codigo</TableHead>
                                        <TableHead>Nino</TableHead>
                                        <TableHead>Apoderado</TableHead>
                                        <TableHead>Tiempo Jugado</TableHead>
                                        <TableHead className="text-right">Extra</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(playzoneSummary?.recentCompleted.length ?? 0) === 0 ? (
                                        <TableRow><TableCell colSpan={5}>Sin sesiones completadas en el periodo.</TableCell></TableRow>
                                    ) : (
                                        playzoneSummary?.recentCompleted.map((session) => (
                                            <TableRow key={session.id}>
                                                <TableCell>{session.wristbandCode}</TableCell>
                                                <TableCell>{session.childName}</TableCell>
                                                <TableCell>{session.guardianName}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary">{formatMinutes(session.elapsedMinutes)}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {session.overtimeMinutes > 0 ? (
                                                        <Badge variant="warning">+{session.overtimeMinutes} min</Badge>
                                                    ) : (
                                                        <Badge variant="outline">0 min</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}

function getLocalDateKey(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-lg font-semibold text-slate-100">{value}</p>
        </div>
    )
}
