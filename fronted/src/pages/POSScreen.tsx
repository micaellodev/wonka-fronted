import { useEffect, useRef, useState, useCallback } from 'react'
import { Package, RefreshCw, ArrowLeft, Search, Heart } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import type { Product, Category } from '@/types'
import { AttendanceModal } from '@/components/AttendanceModal'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { TicketPanel } from '@/components/TicketPanel'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProductCard, CatalogTabs, CategoryCard, type CatalogTab } from './pos/CatalogParts'
import { FreeSaleForm } from './pos/FreeSaleForm'
import { TodaySalesPanel, type SaleToday } from './pos/TodaySalesPanel'

// ============================================================
// POSScreen — Clean POS terminal (admin stripped out)
// ============================================================

interface ProductsResponse {
 data: Product[]
 meta?: { total: number; page: number; limit: number }
}


export function POSScreen() {
 const { tenantId, activeWorker } = useAuthStore()
 const { items, addItem } = useCartStore()

 const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CatalogTab>('products')
  const [loading, setLoading] = useState(true)
 const [todaySalesOpen, setTodaySalesOpen] = useState(false)
 const [isAttendanceOpen, setIsAttendanceOpen] = useState(false)
 const [voidTarget, setVoidTarget] = useState<SaleToday | null>(null)
  const [voidReason, setVoidReason] = useState('')
 const [searchQuery, setSearchQuery] = useState('')



 const fetchProducts = useCallback(async () => {
 setLoading(true)
 try {
 const { data, error } = await api.inventory.products.get({
 query: { tenantId, limit: 500, page: 1 },
 })
 if (error) {
 toast.error('Error al cargar productos.')
 return
 }
 const response = data as unknown as ProductsResponse
 const prods: Product[] = response.data ?? []
 setProducts(prods)

 const catMap = new Map<string, Category>()
 prods.forEach((p) => {
 if (!catMap.has(p.category.id)) {
 catMap.set(p.category.id, { ...p.category, createdAt: '' })
 }
 })
 setCategories(Array.from(catMap.values()))
 } catch {
 toast.error('No se pudo conectar con el servidor.')
 } finally {
 setLoading(false)
 }
 }, [tenantId])

 useEffect(() => {
 fetchProducts()
 }, [fetchProducts])

  const visibleProducts = products.filter((p) => {
  if (!p.isActive) return false
  if (activeTab === 'products') return true
  if (activeTab === 'categories' && selectedCategory) return p.category.id === selectedCategory
  return false
  })

 const cartQtyFor = (productId: string) => items.find((i) => i.product.id === productId)?.quantity ?? 0

 const searchResults = searchQuery.trim()
  ? products.filter((p) => p.isActive && p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  : []

 const searchRef = useRef<HTMLInputElement>(null)
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'F2') { e.preventDefault(); setActiveTab('search'); setTimeout(() => searchRef.current?.focus(), 0) }
 }
 window.addEventListener('keydown', onKey)
 return () => window.removeEventListener('keydown', onKey)
 }, [])

 const handleRequestVoid = async () => {
 if (!voidTarget || !activeWorker) return
 try {
 const { error } = await api.pos.sales({ id: voidTarget.id }).void.post({
 tenantId,
 workerId: activeWorker.id,
 reason: voidReason,
 })
 if (error) throw error
 toast.success('Solicitud de anulación enviada.')
 setVoidTarget(null)
 setVoidReason('')
 setTodaySalesOpen(false)
 } catch (err) {
 console.error('Failed to request void:', err)
 toast.error('Error al solicitar anulación.')
 }
 }



 return (
 <TerminalShell activeSection="pos">
 <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 h-full min-h-0">
 {/* Catalog */}
  <section className="flex min-h-0 flex-col rounded-xl border border-border bg-background p-4">
  <CatalogTabs activeTab={activeTab} onChange={setActiveTab} />
  <p className="mb-2 text-[11px] text-muted-foreground"><kbd className="font-mono">F2</kbd> Buscar · <kbd className="font-mono">F9</kbd> / <kbd className="font-mono">Ctrl+Enter</kbd> Cobrar · <kbd className="font-mono">Esc</kbd> Cerrar panel</p>

  <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
  <div className="flex items-center gap-2">
  {activeTab === 'categories' && selectedCategory && (
  <Button
  variant="ghost"
  size="icon"
  className="h-7 w-7"
  onClick={() => setSelectedCategory(null)}
  title="Volver a categorías"
  aria-label="Volver a categorías"
  >
  <ArrowLeft className="w-4 h-4 text-muted-foreground" />
  </Button>
  )}
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
  {activeTab === 'categories' && !selectedCategory && 'Selecciona una categoría'}
  {activeTab === 'categories' && selectedCategory && categories.find((c) => c.id === selectedCategory)?.name}
  {activeTab === 'products' && 'Todos los productos'}
  {activeTab === 'favorites' && 'Productos favoritos'}
  {activeTab === 'search' && 'Buscar producto'}
  {activeTab === 'free-sale' && 'Venta libre'}
  </p>
  </div>
  <Button variant="secondary" size="sm" onClick={fetchProducts} disabled={loading}>
  <RefreshCw className={cn('w-3 h-3 mr-2', loading && 'animate-spin')} />
  Recargar
  </Button>
  </div>

  {loading && (
  <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
  <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
  <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Cargando...</p>
  </div>
  )}

  {!loading && activeTab === 'categories' && selectedCategory === null && (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto pr-1">
  {categories.map((cat) => (
  <CategoryCard
  key={cat.id}
  category={cat}
  productCount={products.filter((p) => p.isActive && p.category.id === cat.id).length}
  onClick={() => setSelectedCategory(cat.id)}
  />
  ))}
  </div>
  )}

 {!loading && (activeTab === 'products' || (activeTab === 'categories' && selectedCategory !== null)) && visibleProducts.length === 0 && (
  <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
  <Package className="w-12 h-12 opacity-50" />
  <p className="text-sm font-bold uppercase tracking-widest">Sin productos</p>
  </div>
  )}

  {!loading && (activeTab === 'products' || (activeTab === 'categories' && selectedCategory !== null)) && visibleProducts.length > 0 && (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 overflow-y-auto pr-1">
  {visibleProducts.map((product) => (
  <ProductCard
  key={product.id}
  product={product}
  onAdd={addItem}
  cartQty={cartQtyFor(product.id)}
  />
  ))}
  </div>
  )}

  {!loading && activeTab === 'favorites' && (
  <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
  <Heart className="w-12 h-12 opacity-50" />
  <p className="text-sm font-bold uppercase tracking-widest">No hay favoritos aún</p>
  </div>
  )}

  {!loading && activeTab === 'search' && (
  <div className="flex flex-col gap-4 p-4">
  <div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  <Input
  ref={searchRef}
  type="search"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  onKeyDown={(e) => { if (e.key === 'Enter' && searchResults.length === 1) { addItem(searchResults[0]); setSearchQuery('') } }}
  placeholder="Buscar productos (Enter agrega si hay uno solo)"
  aria-label="Buscar productos"
  autoFocus
  className="h-12 border-2 border-primary pl-10"
  />
  </div>

  {searchQuery.trim() && searchResults.length === 0 && (
  <div className="flex flex-col items-center justify-center gap-4 py-12">
  <Package className="w-16 h-16 text-brand-500 opacity-60" />
  <p className="text-sm text-muted-foreground text-center">No se encontraron productos con ese nombre.</p>
  </div>
  )}

  {searchQuery.trim() && searchResults.length > 0 && (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
  {searchResults.map((p) => (
  <ProductCard
  key={p.id}
  product={p}
  onAdd={addItem}
  cartQty={cartQtyFor(p.id)}
  />
  ))}
  </div>
  )}

  {!searchQuery.trim() && (
  <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
  <div className="w-32 h-32 bg-brand-100 rounded-2xl flex items-center justify-center">
  <Package className="w-16 h-16 text-brand-500" />
  </div>
  <p className="text-sm text-center">Empieza a buscar tus productos y agrégalos al carrito.</p>
  </div>
  )}
  </div>
  )}

  {!loading && activeTab === 'free-sale' && <FreeSaleForm onAdd={addItem} />}
  </section>
 <TicketPanel onSaleComplete={fetchProducts} />
 </div>

 {/* Today sales panel */}
 <TodaySalesPanel
 open={todaySalesOpen}
 onClose={() => setTodaySalesOpen(false)}
 onRequestVoid={(sale) => setVoidTarget(sale)}
 />

 {/* Void reason modal */}
 <Dialog open={!!voidTarget} onOpenChange={(o) => { if (!o) setVoidTarget(null) }}>
 <DialogContent size="md">
 <DialogHeader>
 <DialogTitle>Solicitar anulación</DialogTitle>
 <DialogDescription>{voidTarget?.tipoComprobante} {voidTarget ? formatPEN(voidTarget.total) : ''}</DialogDescription>
 </DialogHeader>
 <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Motivo de anulación" aria-label="Motivo de anulación" className="h-24 resize-none" />
 <DialogFooter>
 <Button variant="outline" onClick={() => setVoidTarget(null)}>Cancelar</Button>
 <Button disabled={!voidReason.trim()} onClick={handleRequestVoid}>Solicitar</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Attendance modal */}
 <AttendanceModal
 isOpen={isAttendanceOpen}
 onClose={() => setIsAttendanceOpen(false)}
 onSuccess={(msg) => toast.success(msg)}
 />
 </TerminalShell>
 )
}
