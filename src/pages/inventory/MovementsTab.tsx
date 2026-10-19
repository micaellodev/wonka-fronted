import { useCallback, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Product, StockMovement, StockMovementType } from '@/types'
import { ErrorRetry, Pager, TableSkeleton } from './shared'
import { apiMsg, MOVEMENT_LABEL, selectClass } from './utils'
import { ExportButtons } from '@/components/ExportButtons'

const LIMIT = 20
const TYPES = Object.keys(MOVEMENT_LABEL) as StockMovementType[]
const variant = (t: StockMovementType) =>
 t === 'ENTRADA' || t === 'INICIAL' || t === 'ANULACION' ? 'success' : t === 'SALIDA' || t === 'VENTA' ? 'danger' : t === 'CORRECCION' ? 'warning' : 'secondary'
const dt = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
// date inputs are local days; send explicit local day bounds as ISO
const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString()

export function MovementsTab({ tenantId }: { tenantId: string }) {
 const [products, setProducts] = useState<Product[]>([])
 const [productId, setProductId] = useState('')
 const [type, setType] = useState('')
 const [from, setFrom] = useState('')
 const [to, setTo] = useState('')
 const [page, setPage] = useState(1)
 const [rows, setRows] = useState<StockMovement[]>([])
 const [total, setTotal] = useState(0)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')

 useEffect(() => {
  // shortcut: product filter lists up to 500 products; swap for a searchable picker beyond that
  api.inventory.products.get({ query: { tenantId, limit: 500, page: 1, status: 'all' } })
   .then((r: { data?: { data?: Product[] } }) => setProducts(r.data?.data ?? []))
   .catch(() => undefined)
 }, [tenantId])

 const load = useCallback(async () => {
  setLoading(true)
  setError('')
  try {
   const res = await api.inventory.movements.get({
    query: { tenantId, page, limit: LIMIT, ...(productId ? { productId } : {}), ...(type ? { type } : {}),
     ...(from ? { from: dayStart(from) } : {}), ...(to ? { to: dayEnd(to) } : {}) },
   })
   if (res.error) { setError(apiMsg(res.error, 'No se pudieron cargar los movimientos.')); return }
   const body = res.data as unknown as { data: StockMovement[]; meta?: { total: number } }
   setRows(body.data ?? [])
   setTotal(body.meta?.total ?? 0)
  } catch {
   setError('No se pudo conectar con el servidor.')
  } finally {
   setLoading(false)
  }
 }, [tenantId, page, productId, type, from, to])

 useEffect(() => { void load() }, [load])

 // Exporta todos los movimientos con los filtros actuales (de a 200, el máximo del backend; tope 5000 filas)
 const exportRows = async () => {
  const all: StockMovement[] = []
  for (let pg = 1; pg <= 25; pg++) {
   const res = await api.inventory.movements.get({
    query: { tenantId, page: pg, limit: 200, ...(productId ? { productId } : {}), ...(type ? { type } : {}),
     ...(from ? { from: dayStart(from) } : {}), ...(to ? { to: dayEnd(to) } : {}) },
   })
   if (res.error) throw new Error('export')
   const body = res.data as unknown as { data: StockMovement[]; meta?: { total: number } }
   all.push(...(body.data ?? []))
   if (all.length >= (body.meta?.total ?? 0) || (body.data ?? []).length === 0) break
  }
  return [
   ['Fecha', 'Producto', 'SKU', 'Tipo', 'Cambio', 'Stock antes', 'Stock después', 'Motivo', 'Usuario'],
   ...all.map((m) => [dt(m.createdAt), m.product.name, m.product.sku, MOVEMENT_LABEL[m.type] ?? m.type, m.delta, m.stockBefore, m.stockAfter, m.reason ?? '', m.worker?.name ?? '']),
  ]
 }

 const f = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

 return (
  <div className="space-y-4" data-testid="movements-tab">
   <div className="flex flex-wrap items-end gap-3">
    <select className={`${selectClass} w-auto max-w-64`} value={productId} onChange={(e) => f(setProductId)(e.target.value)} aria-label="Producto" data-testid="mov-filter-product">
     <option value="">Todos los productos</option>
     {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
    </select>
    <select className={`${selectClass} w-auto`} value={type} onChange={(e) => f(setType)(e.target.value)} aria-label="Tipo" data-testid="mov-filter-type">
     <option value="">Todos los tipos</option>
     {TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
    </select>
    <label className="text-xs text-muted-foreground">Desde
     <Input type="date" value={from} max={to || undefined} onChange={(e) => f(setFrom)(e.target.value)} data-testid="mov-filter-from" />
    </label>
    <label className="text-xs text-muted-foreground">Hasta
     <Input type="date" value={to} min={from || undefined} onChange={(e) => f(setTo)(e.target.value)} data-testid="mov-filter-to" />
    </label>
   </div>

   <div className="flex justify-end">
    <ExportButtons name="movimientos-inventario" disabled={total === 0} getRows={exportRows} />
   </div>

   {error && <ErrorRetry message={error} onRetry={() => void load()} />}

   <div className="overflow-hidden rounded-xl border border-border bg-card">
    {loading && rows.length === 0 ? <TableSkeleton /> : rows.length === 0 && !error ? (
     <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground" data-testid="movements-empty">
      <History className="size-10 opacity-30" />
      <p className="text-sm">No hay movimientos con esos filtros.</p>
     </div>
    ) : (
     <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
      <Table>
       <TableHeader>
        <TableRow>
         <TableHead>Fecha</TableHead><TableHead>Producto</TableHead><TableHead>Tipo</TableHead>
         <TableHead className="text-right">Cambio</TableHead><TableHead className="text-right">Stock</TableHead>
         <TableHead>Motivo</TableHead><TableHead>Usuario</TableHead><TableHead>Venta</TableHead>
        </TableRow>
       </TableHeader>
       <TableBody>
        {rows.map((m) => (
         <TableRow key={m.id} data-testid="movement-row" data-type={m.type}>
          <TableCell className="whitespace-nowrap">{dt(m.createdAt)}</TableCell>
          <TableCell><span className="font-medium text-foreground">{m.product.name}</span> <span className="font-mono text-xs text-muted-foreground">{m.product.sku}</span></TableCell>
          <TableCell><Badge variant={variant(m.type)}>{MOVEMENT_LABEL[m.type] ?? m.type}</Badge></TableCell>
          <TableCell className={`text-right font-bold tabular-nums ${m.delta > 0 ? 'text-success' : m.delta < 0 ? 'text-destructive' : ''}`} data-testid="movement-delta">
           {m.delta > 0 ? `+${m.delta}` : m.delta}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums" data-testid="movement-stock">{m.stockBefore} → {m.stockAfter}</TableCell>
          <TableCell className="max-w-56 truncate" title={m.reason ?? ''}>{m.reason || '—'}</TableCell>
          <TableCell>{m.worker?.name ?? '—'}</TableCell>
          <TableCell className="font-mono text-xs">{m.saleId ? m.saleId.slice(0, 8) : '—'}</TableCell>
         </TableRow>
        ))}
       </TableBody>
      </Table>
     </div>
    )}
    <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
   </div>
  </div>
 )
}
