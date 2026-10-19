import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { formatPEN, formatTime } from '@/lib/format'

export
interface SaleToday {
 id: string
 total: number
 tipoComprobante: string
 serie: string | null
 correlativo: string | null
 createdAt: string
 status: string
 worker: { name: string }
 items: Array<{ qty: number; product: { name: string } }>
}

export function TodaySalesPanel({
 open,
 onClose,
 onRequestVoid,
}: {
 open: boolean
 onClose: () => void
 onRequestVoid: (sale: SaleToday) => void
}) {
 const { tenantId } = useAuthStore()
 const [sales, setSales] = useState<SaleToday[]>([])
 const [loading, setLoading] = useState(false)
 const [loadError, setLoadError] = useState<string | null>(null)

 useEffect(() => {
 if (!open) return
 const fetch = async () => {
 setLoading(true)
 setLoadError(null)
 try {
 const { data, error } = await api.pos.sales.today.get({ query: { tenantId } })
 if (error) throw error
 setSales((data?.data as SaleToday[]) ?? [])
 } catch (err) {
 console.error('Failed to load today sales:', err)
 setLoadError('No se pudieron cargar las ventas de hoy.')
 } finally {
 setLoading(false)
 }
 }
 fetch()
 }, [open, tenantId])

 if (!open) return null

 return (
 <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-background shadow-2xl sm:w-105 border-l border-border">
 <div className="flex items-center justify-between px-5 py-4 border-b border-border">
 <h2 className="text-lg font-bold text-foreground">Ventas del día</h2>
 <Button variant="outline" size="sm" onClick={onClose}>
 Cerrar
 </Button>
 </div>
 <div className="flex-1 overflow-y-auto p-4 space-y-3">
 {loading ? (
 <p className="text-center text-muted-foreground py-8">Cargando...</p>
 ) : sales.length === 0 ? (
 loadError ? <p className="text-center text-destructive py-8">{loadError}</p> : <p className="text-center text-muted-foreground py-8">No hay ventas hoy</p>
 ) : (
 sales.map((sale) => (
 <div key={sale.id} className="rounded-xl border border-border bg-background p-3">
 <div className="flex justify-between items-start">
 <div>
 <p className="text-sm font-bold">
 {sale.tipoComprobante === 'TICKET'
 ? `TICKET #${sale.id.slice(-6)}`
 : `${sale.tipoComprobante} ${sale.serie}-${sale.correlativo}`}
 </p>
 <p className="text-xs text-muted-foreground">
 {formatTime(sale.createdAt)}{' '}
 · {sale.worker.name}
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 {sale.items.map((i) => `${i.qty}x ${i.product.name}`).join(', ')}
 </p>
 </div>
 <div className="text-right">
 <p className="font-bold">{formatPEN(sale.total)}</p>
 {sale.status !== 'CANCELLED' && (
 <Button
 variant="outline"
 size="sm"
 className="mt-2 text-xs border-brand-200 text-brand-500 hover:bg-brand-100"
 onClick={() => onRequestVoid(sale)}
 >
 Anular
 </Button>
 )}
 </div>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 )
}
