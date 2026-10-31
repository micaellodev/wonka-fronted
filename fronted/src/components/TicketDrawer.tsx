import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { TicketPanel } from '@/components/TicketPanel'
import { useCartStore } from '@/store/cartStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'
import { formatPEN } from '@/lib/format'

// Ticket para pantallas donde no cabe fijo: botón flotante con el total + panel lateral.
export function TicketDrawer({ onSaleComplete }: { onSaleComplete?: () => void }) {
 const [open, setOpen] = useState(false)
 const lines = useCartStore((s) => s.items.length) + usePlayzoneTicketStore((s) => s.charges.length)
 const total = useCartStore((s) => s.total) + usePlayzoneTicketStore((s) => s.total)

 // Con el cajón cerrado, el atajo de cobro lo abre (ya abierto, lo atiende el propio ticket)
 useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
   if ((e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) && lines > 0 && !open) { e.preventDefault(); setOpen(true) }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
 }, [lines, open])

 return (
 <>
 <Button className="fixed bottom-4 right-4 z-40 h-14 gap-2 px-5 text-base font-bold shadow-xl" onClick={() => setOpen(true)}>
 <ShoppingCart className="h-5 w-5" />
 Ticket{lines > 0 && ` (${lines})`} · {formatPEN(total)}
 </Button>
 <Sheet open={open} onOpenChange={setOpen}>
 <SheetContent side="right" className="w-full gap-0 bg-muted p-3 sm:max-w-[400px]">
 <SheetTitle className="sr-only">Ticket</SheetTitle>
 <div className="flex min-h-0 flex-1 flex-col">
 <TicketPanel className="h-full" onSaleComplete={() => { setOpen(false); onSaleComplete?.() }} />
 </div>
 </SheetContent>
 </Sheet>
 </>
 )
}
