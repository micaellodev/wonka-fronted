import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'

/** Venta libre: arma un producto virtual y lo entrega a onAdd (una vez por unidad). */
export function FreeSaleForm({ onAdd }: { onAdd: (p: Product) => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [qty, setQty] = useState(1)
  const [tax, setTax] = useState('GRAVADO')

  const submit = () => {
    const price = parseFloat(amount)
    if (!name.trim() || isNaN(price) || price <= 0) {
      toast.error('Completa nombre y monto válido.')
      return
    }
    const virtual: Product = {
      id: `free-sale-${Date.now()}`,
      name: name.trim(),
      sku: 'FREE',
      price,
      cost: 0,
      stock: 999999,
      trackStock: false,
      isActive: true,
      igvRegime: tax,
      createdAt: new Date().toISOString(),
      category: { id: 'free', name: 'Venta libre' },
    }
    for (let i = 0; i < qty; i++) onAdd(virtual)
    setName(''); setAmount(''); setQty(1); setTax('GRAVADO')
    toast.success('Producto agregado al ticket.')
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">Venta libre</h3>

      <div className="flex flex-col gap-1">
        <Label htmlFor="fs-name" className="text-xs font-bold text-muted-foreground">Nombre de producto <span className="text-destructive">*</span></Label>
        <Input id="fs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Servicio de limpieza" />
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <Label htmlFor="fs-amount" className="text-xs font-bold text-muted-foreground">Monto a cobrar <span className="text-destructive">*</span></Label>
          <div className="flex items-center">
            <span className="flex h-10 items-center rounded-l-md border border-r-0 border-border bg-muted px-2.5 text-sm font-bold text-muted-foreground">S/</span>
            <Input id="fs-amount" type="number" min="0" step="0.10" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="rounded-l-none" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="fs-qty" className="text-xs font-bold text-muted-foreground">Cantidad</Label>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button type="button" aria-label="Menos" onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2.5 text-muted-foreground hover:bg-muted transition-colors">
              <Minus className="w-4 h-4" />
            </button>
            <input id="fs-qty" type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 text-center border-x border-border bg-background py-2.5 text-sm font-bold text-foreground focus:outline-none" />
            <button type="button" aria-label="Más" onClick={() => setQty(qty + 1)} className="px-3 py-2.5 text-muted-foreground hover:bg-muted transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="fs-tax" className="text-xs font-bold text-muted-foreground">Tipo de impuesto</Label>
        <Select id="fs-tax" value={tax} onChange={(e) => setTax(e.target.value)}>
          <option value="GRAVADO">Gravado 18% IGV</option>
          <option value="GRAVADO_10_5">Gravado 10.5% IGV</option>
          <option value="EXONERADO">Exonerado</option>
          <option value="INAFECTO">Inafecto</option>
          <option value="ICBPER">ICBPER - Gravado</option>
        </Select>
      </div>

      <Button onClick={submit} className="w-full h-12 text-sm font-black uppercase tracking-widest">Agregar al ticket</Button>
    </div>
  )
}
