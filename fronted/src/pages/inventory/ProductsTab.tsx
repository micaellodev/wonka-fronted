import { useCallback, useEffect, useState } from 'react'
import { Package, Plus, Search, Edit2, Upload, SlidersHorizontal, Power } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Product, Category } from '@/types'
import { ImportModal } from './ImportModal'
import { ProductModal } from './ProductModal'
import { StockModal } from './StockModal'
import { ConfirmModal, ErrorRetry, Pager, TableSkeleton } from './shared'
import { apiMsg, money, selectClass, useDebounced } from './utils'
import { useCan } from '@/lib/permissions'
import { ExportButtons } from '@/components/ExportButtons'

export type StockFilter = 'all' | 'low' | 'out' | 'ok'
const LIMIT = 20

function StockBadge({ p }: { p: Product }) {
 if (!p.trackStock) return <Badge variant="outline">Sin control</Badge>
 const min = p.minStock ?? 5
 return (
  <span className="inline-flex items-center gap-2">
   <span className="font-bold tabular-nums" data-testid="stock-value">{p.stock}</span>
   {p.stock <= 0 ? <Badge variant="danger">Agotado</Badge> : p.stock <= min ? <Badge variant="warning">Bajo</Badge> : <Badge variant="success">OK</Badge>}
  </span>
 )
}

export function ProductsTab({ tenantId, categories, initialStock, onChanged, onCategoriesChanged }: {
 tenantId: string; categories: Category[]; initialStock: StockFilter
 onChanged: () => void; onCategoriesChanged: () => void
}) {
 const canEdit = useCan().can('inventory.edit')
 const [search, setSearch] = useState('')
 const q = useDebounced(search)
 const [categoryId, setCategoryId] = useState('')
 const [stock, setStock] = useState<StockFilter>(initialStock)
 const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
 const [page, setPage] = useState(1)
 const [products, setProducts] = useState<Product[]>([])
 const [total, setTotal] = useState(0)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')

 const [prodModal, setProdModal] = useState<{ editing: Product | null } | null>(null)
 const [stockFor, setStockFor] = useState<Product | null>(null)
 const [toggleFor, setToggleFor] = useState<Product | null>(null)
 const [toggling, setToggling] = useState(false)
 const [toggleError, setToggleError] = useState('')
 const [importOpen, setImportOpen] = useState(false)

 const load = useCallback(async () => {
  setLoading(true)
  setError('')
  try {
   const res = await api.inventory.products.get({
    query: { tenantId, page, limit: LIMIT, stock, status, ...(q.trim() ? { search: q.trim() } : {}), ...(categoryId ? { categoryId } : {}) },
   })
   if (res.error) { setError(apiMsg(res.error, 'No se pudo cargar los productos.')); return }
   const body = res.data as unknown as { data: Product[]; meta?: { total: number } }
   setProducts(body.data ?? [])
   setTotal(body.meta?.total ?? body.data?.length ?? 0)
  } catch {
   setError('No se pudo conectar con el servidor.')
  } finally {
   setLoading(false)
  }
 }, [tenantId, page, stock, status, q, categoryId])

 useEffect(() => { void load() }, [load])

 // Exporta todos los productos que cumplen los filtros actuales (pide de a 500, el máximo del backend)
 const exportRows = async () => {
  const all: Product[] = []
  for (let pg = 1; pg <= 20; pg++) {
   const res = await api.inventory.products.get({
    query: { tenantId, page: pg, limit: 500, stock, status, ...(q.trim() ? { search: q.trim() } : {}), ...(categoryId ? { categoryId } : {}) },
   })
   if (res.error) throw new Error('export')
   const body = res.data as unknown as { data: Product[]; meta?: { total: number } }
   all.push(...(body.data ?? []))
   if (all.length >= (body.meta?.total ?? 0) || (body.data ?? []).length === 0) break
  }
  return [
   ['SKU', 'Producto', 'Categoría', 'Precio', 'Costo', 'Stock', 'Stock mínimo', 'Controla stock', 'Estado'],
   ...all.map((p) => [p.sku, p.name, p.category.name, Number(p.price), p.cost != null ? Number(p.cost) : '', p.stock, p.minStock ?? '', p.trackStock ? 'Sí' : 'No', p.isActive ? 'Activo' : 'Inactivo']),
  ]
 }

 const refresh = () => { void load(); onChanged() }
 const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

 const doToggle = async () => {
  if (!toggleFor || toggling) return
  setToggling(true)
  setToggleError('')
  try {
   const res = await api.inventory.products({ id: toggleFor.id }).patch({ isActive: !toggleFor.isActive }, { query: { tenantId } })
   if (res.error) { setToggleError(apiMsg(res.error, 'No se pudo cambiar el estado del producto.')); return }
   setToggleFor(null)
   refresh()
  } catch {
   setToggleError('No se pudo conectar con el servidor.')
  } finally {
   setToggling(false)
  }
 }

 return (
  <div className="space-y-4" data-testid="products-tab">
   <div className="flex flex-wrap items-center gap-3">
    <div className="relative min-w-52 flex-1 sm:max-w-xs">
     <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
     <Input className="pl-9" placeholder="Buscar por nombre o SKU..." value={search}
      onChange={(e) => { setSearch(e.target.value); setPage(1) }} data-testid="filter-search" />
    </div>
    <select className={`${selectClass} w-auto`} value={categoryId} onChange={(e) => filter(setCategoryId)(e.target.value)} data-testid="filter-category" aria-label="Categoría">
     <option value="">Todas las categorías</option>
     {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
    <select className={`${selectClass} w-auto`} value={stock} onChange={(e) => filter(setStock)(e.target.value as StockFilter)} data-testid="filter-stock" aria-label="Estado de stock">
     <option value="all">Todo el stock</option>
     <option value="low">Stock bajo</option>
     <option value="out">Agotados</option>
     <option value="ok">Stock OK</option>
    </select>
    <select className={`${selectClass} w-auto`} value={status} onChange={(e) => filter(setStatus)(e.target.value as typeof status)} data-testid="filter-status" aria-label="Estado">
     <option value="active">Activos</option>
     <option value="inactive">Inactivos</option>
     <option value="all">Todos</option>
    </select>
    <ExportButtons name="inventario" className="ml-auto" disabled={total === 0} getRows={exportRows} />
    {canEdit && <div className="flex gap-2">
     <Button variant="secondary" onClick={() => setImportOpen(true)} data-testid="import-open"><Upload /> Importar Excel</Button>
     <Button onClick={() => setProdModal({ editing: null })} disabled={categories.length === 0}
      title={categories.length === 0 ? 'Crea al menos una categoría primero' : ''} data-testid="product-new"><Plus /> Nuevo producto</Button>
    </div>}
   </div>

   {error && <ErrorRetry message={error} onRetry={() => void load()} />}

   <div className="overflow-hidden rounded-xl border border-border bg-card">
    {loading && products.length === 0 ? <TableSkeleton /> : products.length === 0 && !error ? (
     <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground" data-testid="products-empty">
      <Package className="size-10 opacity-30" />
      <p className="text-sm">{q || categoryId || stock !== 'all' || status !== 'active' ? 'No se encontraron productos con esos filtros.' : 'No hay productos registrados. ¡Crea el primero!'}</p>
     </div>
    ) : (
     <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
      <Table>
       <TableHeader>
        <TableRow>
         <TableHead>Producto</TableHead><TableHead>SKU</TableHead><TableHead>Categoría</TableHead>
         <TableHead className="text-right">Precio</TableHead><TableHead>Stock</TableHead><TableHead>Estado</TableHead>
         <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
       </TableHeader>
       <TableBody>
        {products.map((p) => (
         <TableRow key={p.id} data-testid="product-row" data-sku={p.sku}>
          <TableCell>
           <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
             {p.imageUrl ? <img src={p.imageUrl} className="size-full object-cover" alt="" />
              : <div className="flex size-full items-center justify-center"><Package className="size-4 text-muted-foreground" /></div>}
            </div>
            <span className="font-medium text-foreground" data-testid="product-name-cell">{p.name}</span>
           </div>
          </TableCell>
          <TableCell className="font-mono text-muted-foreground">{p.sku}</TableCell>
          <TableCell><Badge variant="outline" className="normal-case">{p.category.name}</Badge></TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{money(p.price)}</TableCell>
          <TableCell data-testid="product-stock-cell"><StockBadge p={p} /></TableCell>
          <TableCell><Badge variant={p.isActive ? 'success' : 'outline'} data-testid="product-status">{p.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
          <TableCell>
           {canEdit && <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Editar ${p.name}`} title="Editar" onClick={() => setProdModal({ editing: p })} data-testid="product-edit"><Edit2 /></Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Ajustar stock de ${p.name}`}
             title={p.trackStock ? 'Ajustar stock' : 'Este producto no controla stock'} disabled={!p.trackStock} onClick={() => setStockFor(p)} data-testid="product-adjust"><SlidersHorizontal /></Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`${p.isActive ? 'Desactivar' : 'Activar'} ${p.name}`}
             title={p.isActive ? 'Desactivar' : 'Activar'} onClick={() => { setToggleError(''); setToggleFor(p) }} data-testid="product-toggle"><Power /></Button>
           </div>}
          </TableCell>
         </TableRow>
        ))}
       </TableBody>
      </Table>
     </div>
    )}
    <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
   </div>

   {prodModal && (
    <ProductModal tenantId={tenantId} categories={categories} editing={prodModal.editing}
     onClose={() => setProdModal(null)} onSaved={() => { setProdModal(null); refresh() }}
     onAdjustStock={(p) => { setProdModal(null); setStockFor(p) }} />
   )}
   {stockFor && <StockModal tenantId={tenantId} product={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); refresh() }} />}
   {toggleFor && (
    <ConfirmModal title={toggleFor.isActive ? 'Desactivar producto' : 'Activar producto'}
     message={toggleFor.isActive ? `"${toggleFor.name}" dejará de aparecer en el punto de venta.` : `"${toggleFor.name}" volverá a aparecer en el punto de venta.`}
     confirmLabel={toggleFor.isActive ? 'Desactivar' : 'Activar'} destructive={toggleFor.isActive} busy={toggling} error={toggleError}
     onConfirm={doToggle} onClose={() => setToggleFor(null)} />
   )}
   {importOpen && (
    <ImportModal tenantId={tenantId} categoryNames={categories.map((c) => c.name)} onClose={() => setImportOpen(false)}
     onDone={() => { refresh(); onCategoriesChanged() }} />
   )}
  </div>
 )
}
