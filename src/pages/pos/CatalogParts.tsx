import { Minus, Plus, Trash2, Package, Folder, Search, Heart, LayoutGrid, ShoppingBasket } from 'lucide-react'
import type { Product, Category, CartItem } from '@/types'
import { stockLimit } from '@/store/cartStore'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ProductCard({
 product,
 onAdd,
 cartQty,
}: {
 product: Product
 onAdd: (p: Product) => void
 cartQty: number
}) {
 const isOutOfStock = stockLimit(product) <= 0
 const isMaxed = cartQty >= stockLimit(product)

 return (
 <button
 onClick={() => onAdd(product)}
 disabled={isOutOfStock || isMaxed}
 className={cn(
 'relative flex flex-col items-start overflow-hidden rounded-lg border text-left transition-none active:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  isOutOfStock || isMaxed
  ? 'border-border bg-background opacity-50 cursor-not-allowed'
  : 'border-border bg-background hover:border-brand-300 cursor-pointer'
 )}
 >
 <div className="w-full aspect-square bg-background overflow-hidden">
 {product.imageUrl ? (
 <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Package className="w-8 h-8 text-muted-foreground" />
 </div>
 )}
 </div>

 <div className="p-2 flex flex-col gap-1 w-full">
 <div className="flex justify-between items-start w-full gap-2">
 <p className="text-xs font-bold text-foreground leading-tight line-clamp-2">{product.name}</p>
  <p className="text-sm font-bold text-foreground font-mono tracking-tight shrink-0 bg-muted px-1 border border-border rounded">
 {formatPEN(product.price)}
 </p>
 </div>
 <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
 {product.category.name}
 </span>
 <div className="flex justify-between items-end w-full mt-1 pt-2 border-t border-border">
 <span
 className={cn(
 'text-[12px] font-mono font-bold tracking-tight',
 isOutOfStock ? 'text-brand-500' : product.trackStock && product.stock <= (product.minStock ?? 5) ? 'text-accent-500' : 'text-muted-foreground'
 )}
 >
 {!product.trackStock ? 'SIN CONTROL DE STOCK' : isOutOfStock ? 'STOCK: 0' : `STOCK: ${product.stock}`}
 </span>
 {cartQty > 0 && (
 <span className="rounded-sm bg-muted px-2 text-[12px] font-mono font-bold tracking-tight text-foreground">
 +{cartQty}
 </span>
 )}
 </div>
 </div>

 {isOutOfStock && (
 <div className="absolute inset-0 flex items-center justify-center bg-background/60 ">
 <span className="text-sm font-black text-brand-500 border-2 border-primary bg-background px-3 py-1 uppercase tracking-widest rounded-sm">
 AGOTADO
 </span>
 </div>
 )}
 </button>
 )
}

export function CartRow({
 item,
 onDecrement,
 onIncrement,
 onRemove,
}: {
 item: CartItem
 onDecrement: () => void
 onIncrement: () => void
 onRemove: () => void
}) {
 const subtotal = item.product.price * item.quantity
 const isMaxed = item.quantity >= stockLimit(item.product)

 return (
 <div className="flex items-center gap-2 px-2 py-2 border-b border-border hover:bg-muted relative group">
 <button
 onClick={onRemove}
 aria-label="Quitar del ticket"
 className="absolute -left-1 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground p-1 rounded opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
 >
 <Trash2 className="w-3 h-3" />
 </button>

 <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
 <p className="text-xs font-bold text-foreground leading-tight uppercase truncate">{item.product.name}</p>
 <p className="text-[11px] font-mono text-muted-foreground">{formatPEN(item.product.price)} UN.</p>
 </div>

 <div className="w-20 flex flex-col items-center shrink-0">
 <div className="flex items-center rounded-md border border-border bg-muted">
 <button
 onClick={onDecrement}
 aria-label="Quitar una unidad"
 className="border-r border-border px-1.5 py-1 text-muted-foreground transition-none hover:bg-muted hover:text-foreground"
 >
 <Minus className="w-3 h-3" />
 </button>
 <span className="w-6 text-center text-xs font-black font-mono text-foreground py-1">{item.quantity}</span>
 <button
 onClick={onIncrement}
 aria-label="Agregar una unidad"
 disabled={isMaxed}
 className="border-l border-border px-1.5 py-1 text-muted-foreground transition-none hover:bg-muted hover:text-foreground disabled:opacity-30"
 >
 <Plus className="w-3 h-3" />
 </button>
 </div>
 {isMaxed && <span className="text-[11px] font-bold text-brand-500 uppercase mt-0.5">MÁX</span>}
 </div>

 <div className="w-20 text-right shrink-0">
 <span className="text-sm font-black font-mono text-secondary-500 tracking-tighter">
 {formatPEN(subtotal)}
 </span>
 </div>
 </div>
 )
}

export type CatalogTab = 'search' | 'favorites' | 'products' | 'categories' | 'free-sale'

export function CatalogTabs({
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
  <div className="mb-3 flex items-center gap-1 border-b border-border pb-2 overflow-x-auto">
  {tabs.map((tab) => {
  const Icon = tab.icon
  const isActive = activeTab === tab.id
  return (
  <button
  key={tab.id}
 type="button"
 aria-pressed={activeTab === tab.id}
  onClick={() => onChange(tab.id)}
  className={cn(
  'flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors rounded-t-md',
  isActive
  ? 'bg-danger-soft text-destructive border-b-2 border-primary'
  : 'text-muted-foreground hover:bg-muted'
  )}
  >
  <Icon className={cn('w-4 h-4', isActive ? 'text-destructive' : 'text-muted-foreground')} />
  {tab.label}
  </button>
  )
  })}
  </div>
  )
}

export function CategoryCard({
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
  className="group flex flex-col items-stretch rounded-xl border border-border bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-destructive/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
  <div className="flex items-center justify-between rounded-t-xl bg-linear-to-r from-primary to-brand-600 px-3 py-2.5">
  <Folder className="w-5 h-5 text-primary-foreground" />
  <span className="rounded-full bg-background/20 px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
  {productCount}
  </span>
  </div>
  <div className="flex flex-1 flex-col justify-center px-3 py-4">
  <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">
  {category.name}
  </p>
  <p className="mt-1 text-[11px] text-muted-foreground">
  {productCount === 1 ? '1 Producto' : `${productCount} Productos`}
  </p>
  </div>
  </button>
  )
}

