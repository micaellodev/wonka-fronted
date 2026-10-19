import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Product } from '@/types'
import { ErrorBox, Field, Modal } from './shared'
import { apiMsg } from './utils'

type Kind = 'ENTRADA' | 'SALIDA' | 'CORRECCION'
const KINDS: { id: Kind; label: string }[] = [
 { id: 'ENTRADA', label: 'Entrada' },
 { id: 'SALIDA', label: 'Salida' },
 { id: 'CORRECCION', label: 'Corrección' },
]

export function StockModal({ tenantId, product, onClose, onSaved }: {
 tenantId: string; product: Product; onClose: () => void; onSaved: () => void
}) {
 const [type, setType] = useState<Kind>('ENTRADA')
 const [qty, setQty] = useState('')
 const [reason, setReason] = useState('')
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')

 const n = /^\d+$/.test(qty.trim()) ? parseInt(qty, 10) : NaN
 const valid = !isNaN(n)
 const result = !valid ? null : type === 'ENTRADA' ? product.stock + n : type === 'SALIDA' ? product.stock - n : n

 const localError = (): string => {
  if (!valid) return type === 'CORRECCION' ? 'Ingresa el stock final (entero ≥ 0).' : 'Ingresa una cantidad entera mayor a 0.'
  if (type !== 'CORRECCION' && n <= 0) return 'La cantidad debe ser mayor a 0.'
  if (type === 'SALIDA' && n > product.stock) return `La salida no puede superar el stock actual (${product.stock}).`
  if (type === 'CORRECCION' && n === product.stock) return 'El stock final es igual al actual: no hay nada que corregir.'
  if (reason.trim().length < 3) return 'El motivo es obligatorio (mínimo 3 caracteres).'
  return ''
 }
 const preErr = qty !== '' && !(reason === '' && localError().startsWith('El motivo')) ? localError() : ''

 const save = async () => {
  if (saving) return
  const e = localError()
  if (e) { setError(e); return }
  setSaving(true)
  setError('')
  try {
   const res = await api.inventory.products({ id: product.id }).stock.post({ tenantId, type, quantity: n, reason: reason.trim() })
   if (res.error) { setError(apiMsg(res.error, 'No se pudo registrar el movimiento de stock.')); return }
   onSaved()
  } catch {
   setError('No se pudo conectar con el servidor.')
  } finally {
   setSaving(false)
  }
 }

 return (
  <Modal title="Ajustar stock" subtitle={`${product.name} · ${product.sku}`} onClose={onClose} testId="stock-modal">
   <div className="inline-flex w-fit rounded-md border border-border bg-muted p-1" role="tablist">
    {KINDS.map((k) => (
     <button key={k.id} type="button" role="tab" aria-selected={type === k.id} data-testid={`stock-type-${k.id}`}
      onClick={() => { setType(k.id); setError('') }}
      className={`rounded-sm px-3 py-1.5 text-sm font-medium ${type === k.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
      {k.label}
     </button>
    ))}
   </div>

   <div className="grid grid-cols-2 gap-3">
    <Field label={type === 'CORRECCION' ? 'Stock final' : 'Cantidad'}>
     <Input type="number" min={type === 'CORRECCION' ? 0 : 1} step={1} value={qty} onChange={(e) => { setQty(e.target.value); setError('') }}
      placeholder={type === 'CORRECCION' ? String(product.stock) : '1'} data-testid="stock-qty" />
    </Field>
    <div className="rounded-md border border-border bg-muted px-3 py-2">
     <span className="block text-xs text-muted-foreground">Stock actual</span>
     <span className="text-lg font-bold text-foreground" data-testid="stock-current">{product.stock}</span>
    </div>
   </div>

   <Field label="Motivo" hint="Obligatorio, entre 3 y 200 caracteres.">
    <Input value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); setError('') }}
     placeholder="Ej. Compra a proveedor, merma, conteo físico" data-testid="stock-reason" />
   </Field>

   <div className="rounded-md border border-border bg-muted px-3 py-2">
    <span className="block text-xs text-muted-foreground">Stock resultante</span>
    <span className={`text-lg font-bold ${result !== null && result < 0 ? 'text-destructive' : 'text-foreground'}`} data-testid="stock-result">
     {result ?? '—'}
    </span>
   </div>

   <ErrorBox message={error || preErr} />

   <div className="flex gap-3">
    <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="stock-cancel">Cancelar</Button>
    <Button className="flex-1" onClick={save} disabled={saving || localError() !== ''} data-testid="stock-save">
     {saving ? 'Registrando...' : 'Registrar'}
    </Button>
   </div>
  </Modal>
 )
}
