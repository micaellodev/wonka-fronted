// Productos con variantes (sabores, tamaños): una sola tarjeta en el catálogo y un selector grande para elegir.
import { Package } from 'lucide-react'
import type { Product } from '@/types'
import { stockLimit } from '@/store/cartStore'
import { splitVariant } from '@/lib/catalog'
import { formatPEN } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const available = (p: Product, inCart: number) => stockLimit(p) > 0 && inCart < stockLimit(p)

export function VariantCard({ base, variants, cartQty, onOpen }: {
 base: string; variants: Product[]; cartQty: number; onOpen: () => void
}) {
 const prices = variants.map((v) => Number(v.price))
 const min = Math.min(...prices), max = Math.max(...prices)
 const allOut = variants.every((v) => stockLimit(v) <= 0)
 const image = variants.find((v) => v.imageUrl)?.imageUrl
 return (
  <button onClick={onOpen} disabled={allOut} aria-label={`${base}: ${variants.length} opciones`}
   className={cn('relative flex flex-col items-start overflow-hidden rounded-lg border border-border bg-background text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    allOut ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-brand-300')}>
   <div className="aspect-square w-full overflow-hidden bg-background">
    {image ? <img src={image} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Package className="size-8 text-muted-foreground" /></div>}
   </div>
   <div className="flex w-full flex-col gap-1 p-2">
    <p className="line-clamp-2 w-full text-sm font-bold leading-tight text-foreground">{base}</p>
    <p className="font-mono text-base font-bold tracking-tight text-secondary-500">{min === max ? formatPEN(min) : `${formatPEN(min)} – ${formatPEN(max)}`}</p>
    <div className="mt-1 flex w-full items-end justify-between border-t border-border pt-2">
     <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground">{variants.length} opciones</span>
     {cartQty > 0 && <span className="rounded-sm bg-muted px-2 font-mono text-[12px] font-bold text-foreground">+{cartQty}</span>}
    </div>
   </div>
   {allOut && <div className="absolute inset-0 flex items-center justify-center bg-background/60"><span className="rounded-sm border-2 border-primary bg-background px-3 py-1 text-sm font-black uppercase tracking-widest text-brand-500">AGOTADO</span></div>}
  </button>
 )
}

export function VariantPicker({ base, variants, cartQtyFor, onAdd, onClose }: {
 base: string | null; variants: Product[]; cartQtyFor: (id: string) => number; onAdd: (p: Product) => void; onClose: () => void
}) {
 return (
  <Dialog open={base !== null} onOpenChange={(o) => { if (!o) onClose() }}>
   <DialogContent size="md">
    <DialogHeader>
     <DialogTitle>{base}</DialogTitle>
     <DialogDescription>Toca una opción para agregarla al ticket. Puedes agregar varias.</DialogDescription>
    </DialogHeader>
    <div className="grid grid-cols-2 gap-3" data-testid="variant-picker">
     {variants.map((p) => {
      const qty = cartQtyFor(p.id)
      const ok = available(p, qty)
      return (
       <button key={p.id} onClick={() => onAdd(p)} disabled={!ok}
        className={cn('relative flex min-h-24 flex-col items-start justify-between gap-1 rounded-xl border-2 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
         ok ? 'border-border bg-background hover:border-brand-300 active:bg-muted' : 'cursor-not-allowed border-border bg-muted opacity-60')}>
        <span className="text-base font-bold leading-tight text-foreground">{splitVariant(p.name).variant ?? p.name}</span>
        <span className="flex w-full items-end justify-between">
         <span className="font-mono text-lg font-bold text-secondary-500">{formatPEN(p.price)}</span>
         <span className="text-xs font-semibold text-muted-foreground">
          {!p.trackStock ? '' : stockLimit(p) <= 0 ? 'Agotado' : `Stock ${p.stock}`}
         </span>
        </span>
        {qty > 0 && <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-black text-primary-foreground">×{qty}</span>}
       </button>
      )
     })}
    </div>
    <DialogFooter><Button onClick={onClose}>Listo</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 )
}
