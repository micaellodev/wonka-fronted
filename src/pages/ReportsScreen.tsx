import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
    BarChart2, Timer, Users,
    Activity, RefreshCw, ChevronLeft, ChevronRight, ShoppingCart, Gamepad2, X
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface SaleItem {
    id: string
    productName: string
    qty: number
    unitPrice: string
    lineTotal: string
}

interface Sale {
    id: string
    total: number
    worker: { name: string }
    createdAt: string
    items: SaleItem[]
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

// ─── Helpers ────────────────────────────────────────────────────────────────

const PLAYZONE_EXTRA_RATE = 1

function getLocalDateKey(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function formatCurrency(v: number) {
    return new Intl.NumberFormat('es-PE', {
        style: 'currency', currency: 'PEN', minimumFractionDigits: 2,
    }).format(v)
}

function formatMinutes(value: number) {
    const mins = Math.round(value)
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${mins} min`
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleString('es-CO', {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
}

// ─── Calendar Component ──────────────────────────────────────────────────────

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface CalendarProps {
    allSales: Sale[]
    selectedDate: string
    onSelectDate: (date: string) => void
}

function SalesCalendar({ allSales, selectedDate, onSelectDate }: CalendarProps) {
    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth())

    // Build a map: dateKey -> total revenue
    const revenueByDay = useMemo(() => {
        const map: Record<string, number> = {}
        for (const sale of allSales) {
            const key = getLocalDateKey(new Date(sale.createdAt))
            map[key] = (map[key] ?? 0) + Number(sale.total)
        }
        return map
    }, [allSales])

    const maxRevenue = useMemo(() => {
        const values = Object.values(revenueByDay)
        return values.length > 0 ? Math.max(...values) : 1
    }, [revenueByDay])

    // Days in the month
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const startOffset = firstDay.getDay() // 0=Sun
    const totalDays = lastDay.getDate()

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
        else setViewMonth(m => m - 1)
    }
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
        else setViewMonth(m => m + 1)
    }

    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ]

    function getIntensity(revenue: number) {
        if (revenue === 0) return 0
        return revenue / maxRevenue
    }

    function getCellStyle(intensity: number): React.CSSProperties {
        if (intensity === 0) return {}
        const alpha = 0.15 + intensity * 0.75
        return {
            backgroundColor: `rgba(139, 92, 246, ${alpha})`,
            borderColor: `rgba(139, 92, 246, ${Math.min(alpha + 0.3, 1)})`,
        }
    }

    return (
        <div className="space-y-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={prevMonth}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-zinc-200">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                    onClick={nextMonth}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
                    disabled={viewYear === today.getFullYear() && viewMonth >= today.getMonth()}
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-zinc-500 uppercase tracking-wider py-1">
                        {d}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />

                    const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const revenue = revenueByDay[dateKey] ?? 0
                    const intensity = getIntensity(revenue)
                    const isSelected = dateKey === selectedDate
                    const isToday = dateKey === getLocalDateKey(today)
                    const isFuture = new Date(dateKey) > today

                    return (
                        <button
                            key={dateKey}
                            onClick={() => !isFuture && onSelectDate(dateKey)}
                            disabled={isFuture}
                            className={[
                                'relative aspect-square rounded-lg border text-xs font-medium transition-all duration-150',
                                'flex flex-col items-center justify-center gap-0.5',
                                isFuture
                                    ? 'opacity-20 cursor-not-allowed border-zinc-800 text-zinc-600'
                                    : 'cursor-pointer hover:border-violet-400',
                                isSelected
                                    ? 'ring-2 ring-violet-400 border-violet-400 text-white'
                                    : intensity === 0
                                        ? 'border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                        : 'border-transparent text-white',
                            ].join(' ')}
                            style={isSelected ? {} : getCellStyle(intensity)}
                            title={revenue > 0 ? `${formatCurrency(revenue)}` : 'Sin ventas'}
                        >
                            <span className={isToday ? 'underline decoration-dotted' : ''}>{day}</span>
                            {revenue > 0 && (
                                <span className="text-[9px] leading-none opacity-80 hidden sm:block">
                                    {formatCurrency(revenue).replace('S/', 'S/')}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-zinc-500">Sin ventas</span>
                {[0.15, 0.35, 0.55, 0.75, 0.95].map(v => (
                    <div
                        key={v}
                        className="w-4 h-4 rounded border border-transparent"
                        style={{ backgroundColor: `rgba(139, 92, 246, ${v})` }}
                    />
                ))}
                <span className="text-[10px] text-zinc-500">Máximo</span>
            </div>
        </div>
    )
}

// ─── Metric tile ─────────────────────────────────────────────────────────────

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 space-y-1">
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">{label}</p>
            <p className={`text-xl font-bold ${color ?? 'text-zinc-100'}`}>{value}</p>
            {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportsScreen() {
    const { tenantId } = useAuthStore()

    const [allSales, setAllSales] = useState<Sale[]>([])
    const [loading, setLoading] = useState(true)
    const [periodDays, setPeriodDays] = useState<'7' | '30' | '90'>('30')
    const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date()))
    const [showDayDetail, setShowDayDetail] = useState(false)
    const [playzoneSummary, setPlayzoneSummary] = useState<PlayzoneSummary | null>(null)
    const [detailSection, setDetailSection] = useState<'pos' | 'playzone'>('pos')

    // Sales filtered to chosen period
    const periodSales = useMemo(() => {
        const days = Number(periodDays)
        const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        return allSales.filter(s => new Date(s.createdAt) >= fromDate)
    }, [allSales, periodDays])

    const totalRevenue = useMemo(() => periodSales.reduce((a, s) => a + Number(s.total), 0), [periodSales])
    const playzoneOvertimeRevenue = (playzoneSummary?.totalOvertimeMinutes ?? 0) * PLAYZONE_EXTRA_RATE
    const combinedRevenue = totalRevenue + playzoneOvertimeRevenue

    // Daily drill-down
    const dailySales = useMemo(
        () => allSales.filter(s => getLocalDateKey(new Date(s.createdAt)) === selectedDate),
        [allSales, selectedDate],
    )
    const dailyRevenue = dailySales.reduce((a, s) => a + Number(s.total), 0)
    const avgTicket = dailySales.length > 0 ? dailyRevenue / dailySales.length : 0

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const days = Number(periodDays)
            const [salesRes, playzoneRes] = await Promise.all([
                api.pos.sales.get({ query: { tenantId, limit: 500, page: 1 } }),
                (api.playzone.reports as any).summary.get({ query: { tenantId, days } }),
            ])

            if (!salesRes.error) {
                const resp = salesRes.data as unknown as { data: Sale[] }
                setAllSales(resp.data ?? [])
            }
            if (!playzoneRes.error) {
                const resp = playzoneRes.data as { data: PlayzoneSummary }
                setPlayzoneSummary(resp.data)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId, periodDays])

    useEffect(() => { fetchData() }, [fetchData])

    const selectedDateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* ── Header ── */}
            <header className="px-6 py-4 bg-card border-b flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-violet-400" />
                        Reportes
                    </h1>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">
                        POS · Zona de Juegos
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Period picker */}
                    <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-0.5 text-sm">
                        {(['7', '30', '90'] as const).map(d => (
                            <button
                                key={d}
                                onClick={() => setPeriodDays(d)}
                                className={[
                                    'px-3 py-1.5 rounded-md font-medium transition-all',
                                    periodDays === d
                                        ? 'bg-violet-600 text-white shadow'
                                        : 'text-zinc-400 hover:text-zinc-200',
                                ].join(' ')}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                    <Button onClick={fetchData} variant="outline" size="sm" className="gap-2">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </div>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

                {/* ── KPI Strip ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    <Metric
                        label={`Ingresos totales (${periodDays}d)`}
                        value={formatCurrency(combinedRevenue)}
                        sub="POS + Juegos extra"
                        color="text-emerald-300"
                    />
                    <Metric
                        label="Ingresos POS"
                        value={formatCurrency(totalRevenue)}
                        sub={`${periodSales.length} transacciones`}
                        color="text-lime-300"
                    />
                    <Metric
                        label="Juegos extra"
                        value={formatCurrency(playzoneOvertimeRevenue)}
                        sub={`${playzoneSummary?.totalOvertimeMinutes ?? 0} min extra`}
                        color="text-sky-300"
                    />
                    <Metric
                        label="Sesiones completadas"
                        value={String(playzoneSummary?.completedSessions ?? 0)}
                        sub={`${playzoneSummary?.activeSessions ?? 0} activas ahora`}
                    />
                    <Metric
                        label="Niños únicos"
                        value={String(playzoneSummary?.uniqueChildren ?? 0)}
                        color="text-cyan-300"
                    />
                    <Metric
                        label="Prom. por sesión"
                        value={formatMinutes(playzoneSummary?.averageMinutesPerSession ?? 0)}
                        color="text-violet-300"
                    />
                </div>

                {/* ── Main two-column layout ── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">

                    {/* ── Left: Day Detail (shown on demand) + Calendar ── */}
                    <div className="flex flex-col gap-4">

                        {/* Day detail panel — appears above calendar when a day is selected */}
                        {showDayDetail && (
                            <Card className="border-violet-700/50 bg-violet-950/10">
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <CardTitle className="text-base capitalize">
                                                {selectedDateLabel}
                                            </CardTitle>
                                            <CardDescription>Detalle de ventas POS del día</CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-xs">
                                                {dailySales.length} venta{dailySales.length !== 1 ? 's' : ''}
                                            </Badge>
                                            <Badge variant={dailyRevenue > 0 ? 'default' : 'outline'} className="text-xs font-semibold">
                                                {formatCurrency(dailyRevenue)}
                                            </Badge>
                                            <button
                                                onClick={() => setShowDayDetail(false)}
                                                className="ml-1 p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                                                title="Cerrar"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <Metric label="Transacciones" value={String(dailySales.length)} />
                                        <Metric label="Total del día" value={formatCurrency(dailyRevenue)} color="text-emerald-300" />
                                        <Metric label="Ticket promedio" value={formatCurrency(avgTicket)} color="text-lime-300" />
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
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
                                                        <TableCell colSpan={4} className="text-center text-zinc-500 py-8">
                                                            No hay ventas para este día
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    dailySales
                                                        .slice()
                                                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                        .map(sale => (
                                                            <TableRow key={sale.id}>
                                                                <TableCell className="font-mono text-xs">
                                                                    {formatTime(sale.createdAt)}
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs text-zinc-500">
                                                                    {sale.id.slice(0, 8)}…
                                                                </TableCell>
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
                        )}

                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                                    Ventas por día — Calendario
                                </CardTitle>
                                <CardDescription>
                                    Haz clic en cualquier día para ver el detalle de ventas
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <SalesCalendar
                                    allSales={allSales}
                                    selectedDate={selectedDate}
                                    onSelectDate={(date) => {
                                        setSelectedDate(date)
                                        setShowDayDetail(true)
                                    }}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Right sidebar: period summaries ── */}
                    <div className="flex flex-col gap-4">

                        {/* Tabs: POS vs Playzone detail */}
                        <Card className="flex-1">
                            <CardHeader className="pb-2">
                                <Tabs>
                                    <TabsList className="w-full">
                                        <TabsTrigger
                                            active={detailSection === 'pos'}
                                            onClick={() => setDetailSection('pos')}
                                            className="flex-1 gap-1.5"
                                        >
                                            <ShoppingCart className="w-3.5 h-3.5" />
                                            Ventas POS
                                        </TabsTrigger>
                                        <TabsTrigger
                                            active={detailSection === 'playzone'}
                                            onClick={() => setDetailSection('playzone')}
                                            className="flex-1 gap-1.5"
                                        >
                                            <Gamepad2 className="w-3.5 h-3.5" />
                                            Zona de Juegos
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {detailSection === 'pos' ? (
                                    <>
                                        <div>
                                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
                                                Últimas {periodDays} ventas recientes
                                            </p>
                                            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Fecha</TableHead>
                                                            <TableHead>Cajero</TableHead>
                                                            <TableHead className="text-right">Total</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {loading ? (
                                                            <TableRow>
                                                                <TableCell colSpan={3} className="text-center text-zinc-500 py-6">
                                                                    Cargando…
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : periodSales.length === 0 ? (
                                                            <TableRow>
                                                                <TableCell colSpan={3} className="text-center text-zinc-500 py-6">
                                                                    Sin ventas en el periodo
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : (
                                                            periodSales
                                                                .slice()
                                                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                                .slice(0, 25)
                                                                .map(sale => (
                                                                    <TableRow
                                                                        key={sale.id}
                                                                        className="cursor-pointer hover:bg-violet-950/20"
                                                                        onClick={() => setSelectedDate(getLocalDateKey(new Date(sale.createdAt)))}
                                                                    >
                                                                        <TableCell className="text-xs text-zinc-400">
                                                                            {formatDate(sale.createdAt)}
                                                                        </TableCell>
                                                                        <TableCell className="text-xs">
                                                                            {sale.worker?.name || '—'}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-semibold text-emerald-300 text-xs">
                                                                            {formatCurrency(Number(sale.total))}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Playzone metrics */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <Metric label="Sesiones activas" value={String(playzoneSummary?.activeSessions ?? 0)} />
                                            <Metric label="Niños únicos" value={String(playzoneSummary?.uniqueChildren ?? 0)} color="text-cyan-300" />
                                            <Metric label="Tiempo total" value={formatMinutes(playzoneSummary?.totalPlayedMinutes ?? 0)} />
                                            <Metric label="Minutos extra" value={formatMinutes(playzoneSummary?.totalOvertimeMinutes ?? 0)} color="text-amber-300" />
                                        </div>

                                        {/* Top children */}
                                        <div>
                                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                <Users className="w-3 h-3" /> Top niños por tiempo
                                            </p>
                                            <div className="space-y-1.5">
                                                {(playzoneSummary?.topChildren.length ?? 0) === 0 ? (
                                                    <p className="text-sm text-zinc-500 py-4 text-center">Sin datos</p>
                                                ) : (
                                                    playzoneSummary?.topChildren.map((child, i) => (
                                                        <div key={child.childId} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                                                            <span className="text-xs font-bold text-zinc-600 w-4">{i + 1}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{child.childName}</p>
                                                                <p className="text-xs text-zinc-500">{child.sessions} sesión{child.sessions !== 1 ? 'es' : ''}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-semibold text-cyan-300">{formatMinutes(child.totalMinutes)}</p>
                                                                <p className="text-xs text-zinc-500">prom {formatMinutes(child.averageMinutes)}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Recent sessions */}
                                        <div>
                                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                <Activity className="w-3 h-3" /> Sesiones recientes
                                            </p>
                                            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Niño</TableHead>
                                                            <TableHead>Jugado</TableHead>
                                                            <TableHead className="text-right">Extra</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {(playzoneSummary?.recentCompleted.length ?? 0) === 0 ? (
                                                            <TableRow>
                                                                <TableCell colSpan={3} className="text-center text-zinc-500 py-4">
                                                                    Sin sesiones completadas
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : (
                                                            playzoneSummary?.recentCompleted.map(s => (
                                                                <TableRow key={s.id}>
                                                                    <TableCell>
                                                                        <p className="text-xs font-medium">{s.childName}</p>
                                                                        <p className="text-[10px] text-zinc-500">{s.wristbandCode}</p>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="secondary" className="text-xs">
                                                                            {formatMinutes(s.elapsedMinutes)}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {s.overtimeMinutes > 0 ? (
                                                                            <Badge variant="warning" className="text-xs">+{s.overtimeMinutes}m</Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-xs">—</Badge>
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>

                                        {/* Ingresos extra */}
                                        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-amber-400">
                                                    <Timer className="w-4 h-4" />
                                                    <span className="text-sm font-semibold">Ingresos por tiempo extra</span>
                                                </div>
                                                <span className="text-base font-bold text-amber-300">
                                                    {formatCurrency(playzoneOvertimeRevenue)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1">
                                                {playzoneSummary?.totalOvertimeMinutes ?? 0} min × S/ {PLAYZONE_EXTRA_RATE.toFixed(2)}/min
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    )
}
