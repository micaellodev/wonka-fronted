import { useCallback, useEffect, useState } from 'react'
import { Package, AlertTriangle, PackageX } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { InventoryStats } from '@/types'
import { CategoriesTab, type CategoryWithCount } from './inventory/CategoriesTab'
import { MovementsTab } from './inventory/MovementsTab'
import { ProductsTab, type StockFilter } from './inventory/ProductsTab'
import { apiMsg } from './inventory/utils'

type Tab = 'productos' | 'movimientos' | 'categorias'
const TABS: { id: Tab; label: string }[] = [
 { id: 'productos', label: 'Productos' },
 { id: 'movimientos', label: 'Movimientos' },
 { id: 'categorias', label: 'Categorías' },
]

export function InventoryScreen() {
 const { tenantId } = useAuthStore()
 const [tab, setTab] = useState<Tab>('productos')
 const [stockFilter, setStockFilter] = useState<StockFilter>(() => { const s = new URLSearchParams(window.location.search).get('stock'); return s === 'low' || s === 'out' ? s : 'all' })
 const [productsKey, setProductsKey] = useState(0) // remounts ProductsTab when an indicator preselects a filter
 const [stats, setStats] = useState<InventoryStats | null>(null)
 const [categories, setCategories] = useState<CategoryWithCount[]>([])
 const [catLoading, setCatLoading] = useState(true)
 const [catError, setCatError] = useState('')

 const loadStats = useCallback(async () => {
  try {
   const res = await api.inventory.stats.get({ query: { tenantId } })
   if (!res.error) setStats((res.data as unknown as { data: InventoryStats }).data)
  } catch { /* indicators are optional; tables show their own errors */ }
 }, [tenantId])

 const loadCategories = useCallback(async () => {
  setCatLoading(true)
  setCatError('')
  try {
   const res = await api.inventory.categories.get({ query: { tenantId } })
   if (res.error) setCatError(apiMsg(res.error, 'No se pudieron cargar las categorías.'))
   else setCategories((res.data as unknown as { data: CategoryWithCount[] }).data ?? [])
  } catch {
   setCatError('No se pudo conectar con el servidor.')
  } finally {
   setCatLoading(false)
  }
 }, [tenantId])

 useEffect(() => { void loadStats(); void loadCategories() }, [loadStats, loadCategories])

 const goProducts = (f: StockFilter) => { setStockFilter(f); setProductsKey((k) => k + 1); setTab('productos') }

 // Re-apply ?stock= when the panel links here while this screen is already mounted
 const stockParam = useSearchParams()[0].get('stock')
 const [seenParam, setSeenParam] = useState(stockParam)
 if (stockParam !== seenParam) { setSeenParam(stockParam); goProducts(stockParam === 'low' || stockParam === 'out' ? stockParam : 'all') }

 const indicators = [
  { id: 'active', label: 'Productos activos', value: stats?.active, filter: 'all' as StockFilter, icon: Package, tone: 'text-foreground' },
  { id: 'low', label: 'Stock bajo', value: stats?.lowStock, filter: 'low' as StockFilter, icon: AlertTriangle, tone: 'text-warning' },
  { id: 'out', label: 'Agotados', value: stats?.outOfStock, filter: 'out' as StockFilter, icon: PackageX, tone: 'text-destructive' },
 ]

 return (
  <div className="space-y-5 p-4 sm:p-6">
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {indicators.map((i) => (
     <button key={i.id} type="button" onClick={() => goProducts(i.filter)} data-testid={`stat-${i.id}`} className="text-left">
      <Card className="flex items-center gap-4 p-4 transition-colors hover:border-primary">
       <i.icon className={`size-8 shrink-0 ${i.tone}`} />
       <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i.label}</p>
        {i.value === undefined ? <Skeleton className="mt-1 h-8 w-12" /> : <p className={`text-3xl font-bold tabular-nums ${i.tone}`} data-testid={`stat-${i.id}-value`}>{i.value}</p>}
       </div>
      </Card>
     </button>
    ))}
   </div>

   <Tabs>
    <TabsList>
     {TABS.map((t) => (
      <TabsTrigger key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>{t.label}</TabsTrigger>
     ))}
    </TabsList>
    <TabsContent>
     {tab === 'productos' && (
      <ProductsTab key={productsKey} tenantId={tenantId} categories={categories} initialStock={stockFilter}
       onChanged={loadStats} onCategoriesChanged={loadCategories} />
     )}
     {tab === 'movimientos' && <MovementsTab tenantId={tenantId} />}
     {tab === 'categorias' && (
      <CategoriesTab tenantId={tenantId} categories={categories} loading={catLoading} error={catError}
       onReload={() => { void loadCategories(); void loadStats() }} />
     )}
    </TabsContent>
   </Tabs>
  </div>
 )
}
