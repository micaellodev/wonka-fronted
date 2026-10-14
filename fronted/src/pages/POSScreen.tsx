import { useEffect, useState, useCallback } from 'react'
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  XCircle,
  Package,
  RefreshCw,
  Folder,
  ArrowLeft,
  Search,
  Heart,
  LayoutGrid,
  ShoppingBasket,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'
import type { Product, Category } from '@/types'
import { AttendanceModal } from '@/components/AttendanceModal'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { RightCheckoutDrawer } from '@/components/RightCheckoutDrawer'
import { formatCurrency } from '@/lib/format'

// ============================================================
// POSScreen — Clean POS terminal (admin stripped out)
// ============================================================

type ToastState = {
 type: 'success' | 'error' | 'info'
 message: string
}

interface ProductsResponse {
 data: Product[]
 meta?: { total: number; page: number; limit: number }
}

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

function useClock() {
 const [now, setNow] = useState(new Date())
 useEffect(() => {
 const id = setInterval(() => setNow(new Date()), 1000)
 return () => clearInterval(id)
 }, [])
 return now
}

function ProductCard({
 product,
 onAdd,
 cartQty,
}: {
 product: Product
 onAdd: (p: Product) => void
 cartQty: number
}) {
 const isOutOfStock = product.stock === 0
 const isMaxed = cartQty >= product.stock

 return (
 <button
 onClick={() => onAdd(product)}
 disabled={isOutOfStock || isMaxed}
 className={cn(
 'relative flex flex-col items-start overflow-hidden rounded-lg border text-left transition-none active:bg-white focus:outline-none focus:ring-0',
  isOutOfStock || isMaxed
  ? 'border-gray-200 bg-white opacity-50 cursor-not-allowed'
  : 'border-gray-200 bg-white hover:border-brand-300 cursor-pointer'
 )}
 >
 <div className="w-full aspect-square bg-white overflow-hidden">
 {product.imageUrl ? (
 <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Package className="w-8 h-8 text-gray-500" />
 </div>
 )}
 </div>

 <div className="p-2 flex flex-col gap-1 w-full">
 <div className="flex justify-between items-start w-full gap-2">
 <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-2">{product.name}</p>
  <p className="text-sm font-bold text-gray-900 font-mono tracking-tight shrink-0 bg-gray-100 px-1 border border-gray-200 rounded">
 {formatCurrency(product.price)}
 </p>
 </div>
 <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
 {product.category.name}
 </span>
 <div className="flex justify-between items-end w-full mt-1 pt-2 border-t border-gray-200">
 <span
 className={cn(
 'text-[12px] font-mono font-bold tracking-tight',
 isOutOfStock ? 'text-brand-500' : product.stock <= 5 ? 'text-accent-500' : 'text-gray-500'
 )}
 >
 {isOutOfStock ? 'STOCK: 0' : `STOCK: ${product.stock}`}
 </span>
 {cartQty > 0 && (
 <span className="rounded-sm bg-zinc-100 px-2 text-[12px] font-mono font-bold tracking-tight text-black">
 +{cartQty}
 </span>
 )}
 </div>
 </div>

 {isOutOfStock && (
 <div className="absolute inset-0 flex items-center justify-center bg-white/60 ">
 <span className="text-sm font-black text-brand-500 border-2 border-red-600 bg-white px-3 py-1 uppercase tracking-widest rounded-sm">
 AGOTADO
 </span>
 </div>
 )}
 </button>
 )
}

function CartRow({
 item,
 onDecrement,
 onIncrement,
 onRemove,
}: {
 item: import('@/types').CartItem
 onDecrement: () => void
 onIncrement: () => void
 onRemove: () => void
}) {
 const subtotal = item.product.price * item.quantity
 const isMaxed = item.quantity >= item.product.stock

 return (
 <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-200 hover:bg-gray-50 relative group">
 <button
 onClick={onRemove}
 className="absolute -left-1 top-1/2 -translate-y-1/2 bg-brand-500 text-white p-1 rounded opacity-0 transition-opacity group-hover:opacity-100"
 >
 <Trash2 className="w-3 h-3" />
 </button>

 <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
 <p className="text-xs font-bold text-gray-900 leading-tight uppercase truncate">{item.product.name}</p>
 <p className="text-[10px] font-mono text-gray-400">{formatCurrency(item.product.price)} UN.</p>
 </div>

 <div className="w-20 flex flex-col items-center shrink-0">
 <div className="flex items-center rounded-md border border-gray-200 bg-gray-100">
 <button
 onClick={onDecrement}
 className="border-r border-gray-200 px-1.5 py-1 text-gray-500 transition-none hover:bg-gray-200 hover:text-gray-900"
 >
 <Minus className="w-3 h-3" />
 </button>
 <span className="w-6 text-center text-xs font-black font-mono text-gray-900 py-1">{item.quantity}</span>
 <button
 onClick={onIncrement}
 disabled={isMaxed}
 className="border-l border-gray-200 px-1.5 py-1 text-gray-500 transition-none hover:bg-gray-200 hover:text-gray-900 disabled:opacity-30"
 >
 <Plus className="w-3 h-3" />
 </button>
 </div>
 {isMaxed && <span className="text-[8px] font-bold text-brand-500 uppercase mt-0.5">MÁX</span>}
 </div>

 <div className="w-20 text-right shrink-0">
 <span className="text-sm font-black font-mono text-secondary-500 tracking-tighter">
 {formatCurrency(subtotal)}
 </span>
 </div>
 </div>
 )
}

function TodaySalesPanel({
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

 useEffect(() => {
 if (!open) return
 const fetch = async () => {
 setLoading(true)
 try {
 const { data, error } = await api.pos.sales.today.get({ query: { tenantId } })
 if (error) throw error
 setSales((data?.data as SaleToday[]) ?? [])
 } catch (err) {
 console.error('Failed to load today sales:', err)
 } finally {
 setLoading(false)
 }
 }
 fetch()
 }, [open, tenantId])

 if (!open) return null

 return (
 <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-white shadow-2xl sm:w-105 border-l border-gray-200">
 <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
 <h2 className="text-lg font-bold text-gray-900">Ventas del día</h2>
 <Button variant="outline" size="sm" onClick={onClose}>
 Cerrar
 </Button>
 </div>
 <div className="flex-1 overflow-y-auto p-4 space-y-3">
 {loading ? (
 <p className="text-center text-gray-400 py-8">Cargando...</p>
 ) : sales.length === 0 ? (
 <p className="text-center text-gray-400 py-8">No hay ventas hoy</p>
 ) : (
 sales.map((sale) => (
 <div key={sale.id} className="rounded-xl border border-gray-200 bg-white p-3">
 <div className="flex justify-between items-start">
 <div>
 <p className="text-sm font-bold">
 {sale.tipoComprobante === 'TICKET'
 ? `TICKET #${sale.id.slice(-6)}`
 : `${sale.tipoComprobante} ${sale.serie}-${sale.correlativo}`}
 </p>
 <p className="text-xs text-gray-400">
 {new Date(sale.createdAt).toLocaleTimeString('es-PE', {
 hour: '2-digit',
 minute: '2-digit',
 })}{' '}
 · {sale.worker.name}
 </p>
 <p className="text-xs text-gray-500 mt-1">
 {sale.items.map((i) => `${i.qty}x ${i.product.name}`).join(', ')}
 </p>
 </div>
 <div className="text-right">
 <p className="font-bold">{formatCurrency(sale.total)}</p>
 {sale.status !== 'CANCELLED' && sale.tipoComprobante !== 'TICKET' && (
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

export function POSScreen() {
 const { tenantId, activeWorker } = useAuthStore()
 const { items, total, addItem, decrementItem, removeItem, clearCart } = useCartStore()
 const { charges: playzoneCharges, total: playzoneTotal, clearAllCharges } = usePlayzoneTicketStore()
 const now = useClock()

 const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'search' | 'favorites' | 'products' | 'categories' | 'free-sale'>('categories')
  const [loading, setLoading] = useState(true)
 const [toast, setToast] = useState<ToastState | null>(null)
 const [checkoutOpen, setCheckoutOpen] = useState(false)
 const [todaySalesOpen, setTodaySalesOpen] = useState(false)
 const [isAttendanceOpen, setIsAttendanceOpen] = useState(false)
 const [voidTarget, setVoidTarget] = useState<SaleToday | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [freeSaleName, setFreeSaleName] = useState('')
  const [freeSaleAmount, setFreeSaleAmount] = useState('')
  const [freeSaleQty, setFreeSaleQty] = useState(1)
  const [freeSaleTax, setFreeSaleTax] = useState('GRAVADO')
 const [searchQuery, setSearchQuery] = useState('')

 const showToast = useCallback((t: ToastState, duration = 3500) => {
 setToast(t)
 const id = setTimeout(() => setToast(null), duration)
 return () => clearTimeout(id)
 }, [])

 const fetchProducts = useCallback(async () => {
 setLoading(true)
 try {
 const { data, error } = await api.inventory.products.get({
 query: { tenantId, limit: 500, page: 1 },
 })
 if (error) {
 showToast({ type: 'error', message: 'Error al cargar productos.' })
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
 showToast({ type: 'error', message: 'No se pudo conectar con el servidor.' })
 } finally {
 setLoading(false)
 }
 }, [tenantId, showToast])

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

 const handleCancel = () => {
 if (items.length === 0) return
 clearCart()
 clearAllCharges()
 showToast({ type: 'info', message: 'Orden cancelada' })
 }

 const handleSaleComplete = () => {
 clearCart()
 clearAllCharges()
 showToast({ type: 'success', message: 'Venta procesada correctamente.' }, 5000)
 fetchProducts()
 setCheckoutOpen(false)
 }

 const handleRequestVoid = async () => {
 if (!voidTarget || !activeWorker) return
 try {
 const { error } = await api.pos.sales({ id: voidTarget.id }).void.post({
 workerId: activeWorker.id,
 reason: voidReason,
 })
 if (error) throw error
 showToast({ type: 'success', message: 'Solicitud de anulación enviada.' })
 setVoidTarget(null)
 setVoidReason('')
 setTodaySalesOpen(false)
 } catch (err) {
 console.error('Failed to request void:', err)
 showToast({ type: 'error', message: 'Error al solicitar anulación.' })
 }
 }

 const handleAddFreeSale = () => {
  const amount = parseFloat(freeSaleAmount)
  if (!freeSaleName.trim() || isNaN(amount) || amount <= 0) {
    showToast({ type: 'error', message: 'Completa nombre y monto válido.' })
    return
  }
  const virtualProduct: Product = {
    id: `free-sale-${Date.now()}`,
    name: freeSaleName.trim(),
    sku: 'FREE',
    price: amount,
    cost: 0,
    stock: 999999,
    trackStock: false,
    isActive: true,
    igvRegime: freeSaleTax,
    createdAt: new Date().toISOString(),
    category: { id: 'free', name: 'Venta libre' },
  }
  for (let i = 0; i < freeSaleQty; i++) {
    addItem(virtualProduct)
  }
  setFreeSaleName('')
  setFreeSaleAmount('')
  setFreeSaleQty(1)
  setFreeSaleTax('GRAVADO')
  showToast({ type: 'success', message: 'Producto agregado al ticket.' })
 }

 const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

 return (
 <TerminalShell activeSection="pos">
 <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 h-full min-h-0">
 {/* Catalog */}
  <section className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white p-4">
  <CatalogTabs activeTab={activeTab} onChange={setActiveTab} />

  <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
  <div className="flex items-center gap-2">
  {activeTab === 'categories' && selectedCategory && (
  <Button
  variant="ghost"
  size="icon"
  className="h-7 w-7"
  onClick={() => setSelectedCategory(null)}
  title="Volver a categorías"
  >
  <ArrowLeft className="w-4 h-4 text-gray-500" />
  </Button>
  )}
  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
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
  <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
  <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
  <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Cargando...</p>
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
  <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
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
  <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
  <Heart className="w-12 h-12 opacity-50" />
  <p className="text-sm font-bold uppercase tracking-widest">No hay favoritos aún</p>
  </div>
  )}

  {!loading && activeTab === 'search' && (
  <div className="flex flex-col gap-4 p-4">
  <div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
  type="text"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder="Buscar productos"
  autoFocus
  className="w-full rounded-lg border-2 border-brand-500 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
  />
  </div>

  {searchQuery.trim() && searchResults.length === 0 && (
  <div className="flex flex-col items-center justify-center gap-4 py-12">
  <Package className="w-16 h-16 text-brand-500 opacity-60" />
  <p className="text-sm text-gray-500 text-center">No se encontraron productos con ese nombre.</p>
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
  <div className="flex flex-col items-center justify-center gap-4 py-12 text-gray-400">
  <div className="w-32 h-32 bg-brand-100 rounded-2xl flex items-center justify-center">
  <Package className="w-16 h-16 text-brand-500" />
  </div>
  <p className="text-sm text-center">Empieza a buscar tus productos y agrégalos al carrito.</p>
  </div>
  )}
  </div>
  )}

  {!loading && activeTab === 'free-sale' && (
  <div className="flex flex-col gap-4 p-4">
  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-700">Venta libre</h3>

  <div className="flex flex-col gap-1">
  <label className="text-xs font-bold text-gray-600">Nombre de producto <span className="text-red-500">*</span></label>
  <input
  type="text"
  value={freeSaleName}
  onChange={(e) => setFreeSaleName(e.target.value)}
  placeholder="Ej: Servicio de limpieza"
  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-secondary-500 focus:outline-none focus:ring-1 focus:ring-secondary-500"
  />
  </div>

  <div className="flex gap-3">
  <div className="flex flex-col gap-1 flex-1">
  <label className="text-xs font-bold text-gray-600">Monto a cobrar <span className="text-red-500">*</span></label>
  <div className="flex items-center">
  <span className="rounded-l-lg border border-r-0 border-gray-300 bg-gray-100 px-2.5 py-2.5 text-sm font-bold text-gray-500">S/</span>
  <input
  type="number"
  min="0"
  step="0.10"
  value={freeSaleAmount}
  onChange={(e) => setFreeSaleAmount(e.target.value)}
  placeholder="0.00"
  className="w-full rounded-r-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-secondary-500 focus:outline-none focus:ring-1 focus:ring-secondary-500"
  />
  </div>
  </div>
  <div className="flex flex-col gap-1">
  <label className="text-xs font-bold text-gray-600">Cantidad</label>
  <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden">
  <button
  onClick={() => setFreeSaleQty(Math.max(1, freeSaleQty - 1))}
  className="px-3 py-2.5 text-gray-500 hover:bg-gray-100 transition-colors"
  >
  <Minus className="w-4 h-4" />
  </button>
  <input
  type="number"
  min="1"
  value={freeSaleQty}
  onChange={(e) => setFreeSaleQty(Math.max(1, parseInt(e.target.value) || 1))}
  className="w-12 text-center border-x border-gray-300 py-2.5 text-sm font-bold focus:outline-none"
  />
  <button
  onClick={() => setFreeSaleQty(freeSaleQty + 1)}
  className="px-3 py-2.5 text-gray-500 hover:bg-gray-100 transition-colors"
  >
  <Plus className="w-4 h-4" />
  </button>
  </div>
  </div>
  </div>

  <div className="flex flex-col gap-1">
  <label className="text-xs font-bold text-gray-600">Tipo de impuesto</label>
  <select
  value={freeSaleTax}
  onChange={(e) => setFreeSaleTax(e.target.value)}
  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-secondary-500 focus:outline-none focus:ring-1 focus:ring-secondary-500"
  >
  <option value="GRAVADO">Gravado 18% IGV</option>
  <option value="GRAVADO_10_5">Gravado 10.5% IGV</option>
  <option value="EXONERADO">Exonerado</option>
  <option value="INAFECTO">Inafecto</option>
  <option value="ICBPER">ICBPER - Gravado</option>
  </select>
  </div>

  <Button
  onClick={handleAddFreeSale}
  className="w-full h-12 bg-secondary-500 hover:bg-secondary-600 text-sm font-black uppercase tracking-widest"
  >
  Agregar al ticket
  </Button>
  </div>
  )}
  </section>

 {/* Ticket */}
  <aside className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white">
 <div className="border-b border-gray-200 px-4 py-4">
 <h2 className="text-sm font-bold text-gray-900 tracking-widest uppercase">Ticket</h2>
 <p className="mt-0.5 text-[10px] font-mono text-gray-400">
 {timeStr} · {activeWorker?.name}
 </p>
 </div>

 {(items.length > 0 || playzoneCharges.length > 0) && (
  <div className="flex justify-between border-b border-gray-200 px-4 py-2 text-[10px] font-mono font-bold uppercase text-gray-400">
  <span className="flex-1">Descripción</span>
  <span className="w-16 text-center">Cant</span>
  <span className="w-20 text-right">Importe</span>
  </div>
 )}

 <div className="flex-1 overflow-y-auto bg-gray-50 p-2">
 {items.length === 0 && playzoneCharges.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500 py-12">
 <ShoppingCart className="w-10 h-10 opacity-30" />
 <p className="text-xs font-bold uppercase tracking-widest text-center">
 Ticket vacío
 </p>
 </div>
 ) : (
 <div className="space-y-1">
 {playzoneCharges.map((charge) => (
 <div key={charge.id} className="flex items-center gap-2 px-2 py-2 border-b border-gray-200 hover:bg-gray-50 bg-amber-50/50">
 <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
 <p className="text-xs font-bold text-gray-900 leading-tight uppercase truncate">{charge.label}</p>
 <p className="text-[10px] font-mono text-amber-600">PLAYZONE</p>
 </div>
 <div className="w-20 flex flex-col items-center shrink-0">
 <span className="text-xs font-black font-mono text-gray-900">{charge.qty}</span>
 </div>
 <div className="w-20 text-right shrink-0">
 <span className="text-sm font-black font-mono text-secondary-500 tracking-tighter">
 {formatCurrency(charge.total)}
 </span>
 </div>
 </div>
 ))}
 {items.map((item) => (
 <CartRow
  key={item.product.id}
  item={item}
  onDecrement={() => decrementItem(item.product.id)}
  onIncrement={() => addItem(item.product)}
  onRemove={() => removeItem(item.product.id)}
 />
 ))}
 </div>
 )}
 </div>

  <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 bg-white p-4">
 <div className="flex items-center justify-between">
 <span className="text-sm font-black uppercase tracking-widest text-gray-700">
 Total a pagar
 </span>
 <span className="text-3xl font-black text-secondary-500 font-mono tracking-tighter">
 {formatCurrency(total + playzoneTotal)}
 </span>
 </div>

 <div className="flex gap-2">
 <Button
  variant="outline"
  className="flex-[0.35] h-14 border-gray-200 text-gray-600 hover:bg-gray-100"
  onClick={handleCancel}
  disabled={items.length === 0 && playzoneCharges.length === 0}
 >
  <XCircle className="w-5 h-5" />
 </Button>
 <Button
  className="flex-1 h-14 bg-secondary-500 hover:bg-secondary-600 text-base font-black uppercase tracking-widest"
  disabled={items.length === 0 && playzoneCharges.length === 0}
  onClick={() => setCheckoutOpen(true)}
 >
  <CreditCard className="w-5 h-5 mr-2" />
  Cobrar
 </Button>
 </div>
 </div>
 </aside>
 </div>

 {/* Toast */}
 {toast && (
 <div
 role="alert"
 className={cn(
 'fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium border z-50 animate-fade-in',
 toast.type === 'success'
 ? 'bg-secondary-50 border-secondary-200 text-secondary-500'
 : toast.type === 'error'
 ? 'bg-red-950/90 border-red-800/60 text-brand-400'
 : 'bg-white border-gray-200 text-gray-600'
 )}
 >
 {toast.message}
 </div>
 )}

 {/* Checkout drawer */}
 <RightCheckoutDrawer
 open={checkoutOpen}
 onClose={() => setCheckoutOpen(false)}
 cart={items}
 playzoneCharges={playzoneCharges}
 onSaleComplete={handleSaleComplete}
 />

 {/* Today sales panel */}
 <TodaySalesPanel
 open={todaySalesOpen}
 onClose={() => setTodaySalesOpen(false)}
 onRequestVoid={(sale) => setVoidTarget(sale)}
 />

 {/* Void reason modal */}
 {voidTarget && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 p-4">
 <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5">
 <h3 className="text-lg font-bold mb-2">Solicitar anulación</h3>
 <p className="text-sm text-gray-500 mb-4">
 {voidTarget.tipoComprobante} {formatCurrency(voidTarget.total)}
 </p>
 <textarea
 value={voidReason}
 onChange={(e) => setVoidReason(e.target.value)}
 placeholder="Motivo de anulación"
 className="w-full h-24 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
 />
 <div className="flex gap-2 mt-4">
 <Button variant="outline" className="flex-1" onClick={() => setVoidTarget(null)}>
 Cancelar
 </Button>
 <Button
 className="flex-1 bg-brand-500 hover:bg-brand-600"
 disabled={!voidReason.trim()}
 onClick={handleRequestVoid}
 >
 Solicitar
 </Button>
 </div>
 </div>
 </div>
 )}

 {/* Attendance modal */}
 <AttendanceModal
 isOpen={isAttendanceOpen}
 onClose={() => setIsAttendanceOpen(false)}
 onSuccess={(msg) => showToast({ type: 'success', message: msg })}
 />
 </TerminalShell>
 )
}

function CatalogTabs({
  activeTab,
  onChange,
}: {
  activeTab: 'search' | 'favorites' | 'products' | 'categories' | 'free-sale'
  onChange: (tab: 'search' | 'favorites' | 'products' | 'categories' | 'free-sale') => void
}) {
  const tabs = [
  { id: 'search' as const, label: 'Buscar', icon: Search },
  { id: 'favorites' as const, label: 'Favoritos', icon: Heart },
  { id: 'products' as const, label: 'Productos', icon: Package },
  { id: 'categories' as const, label: 'Categorías', icon: LayoutGrid },
  { id: 'free-sale' as const, label: 'Venta libre', icon: ShoppingBasket },
  ]

  return (
  <div className="mb-3 flex items-center gap-1 border-b border-gray-200 pb-2 overflow-x-auto">
  {tabs.map((tab) => {
  const Icon = tab.icon
  const isActive = activeTab === tab.id
  return (
  <button
  key={tab.id}
  onClick={() => onChange(tab.id)}
  className={cn(
  'flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors rounded-t-md',
  isActive
  ? 'bg-red-50 text-red-700 border-b-2 border-red-500'
  : 'text-gray-600 hover:bg-gray-100'
  )}
  >
  <Icon className={cn('w-4 h-4', isActive ? 'text-red-600' : 'text-gray-500')} />
  {tab.label}
  </button>
  )
  })}
  </div>
  )
}

function CategoryCard({
  category,
  productCount,
  onClick,
}: {
  category: Category
  productCount: number
  onClick: () => void
}) {
  return (
  <button
  onClick={onClick}
  className="group flex flex-col items-stretch rounded-xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200"
  >
  <div className="flex items-center justify-between rounded-t-xl bg-linear-to-r from-red-500 to-red-500 px-3 py-2.5">
  <Folder className="w-5 h-5 text-white" />
  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
  {productCount}
  </span>
  </div>
  <div className="flex flex-1 flex-col justify-center px-3 py-4">
  <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-2">
  {category.name}
  </p>
  <p className="mt-1 text-[11px] text-gray-500">
  {productCount === 1 ? '1 Producto' : `${productCount} Productos`}
  </p>
  </div>
  </button>
  )
}

import { cn } from '@/lib/utils'

