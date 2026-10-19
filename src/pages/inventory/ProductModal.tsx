import { useState, type ReactNode } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Product, Category } from '@/types'
import { ImageCropModal } from './ImageCropModal'
import { ErrorBox, Field, Modal } from './shared'
import { apiMsg, selectClass } from './utils'

function Section({ title, children }: { title: string; children: ReactNode }) {
 return (
  <section className="space-y-3 rounded-lg border border-border p-4">
   <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
   {children}
  </section>
 )
}

export function ProductModal({ tenantId, categories, editing, onClose, onSaved, onAdjustStock }: {
 tenantId: string; categories: Category[]; editing: Product | null
 onClose: () => void; onSaved: () => void; onAdjustStock: (p: Product) => void
}) {
 const [form, setForm] = useState({
  name: editing?.name ?? '',
  sku: editing?.sku ?? '',
  categoryId: editing?.category?.id ?? categories[0]?.id ?? '',
  imageUrl: editing?.imageUrl ?? '',
  price: editing?.price?.toString() ?? '',
  stock: '0',
  minStock: (editing?.minStock ?? 5).toString(),
  trackStock: editing?.trackStock ?? true,
  igvRegime: editing?.igvRegime ?? '',
 })
 const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }))
 const [uploading, setUploading] = useState(false)
 const [saving, setSaving] = useState(false)
 const [cropSrc, setCropSrc] = useState<string | null>(null)
 const [error, setError] = useState('')

 const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => setCropSrc(reader.result as string)
  reader.readAsDataURL(file)
  e.target.value = ''
 }

 const handleCropConfirm = async (blob: Blob) => {
  setCropSrc(null)
  setUploading(true)
  setError('')
  try {
   const res = await api.upload.post({ tenantId, file: new File([blob], 'product.jpg', { type: 'image/jpeg' }), folder: 'products' })
   if (res.error) setError(apiMsg(res.error, 'Error subiendo la imagen.'))
   else set('imageUrl', (res.data as unknown as { data: { url: string } }).data.url)
  } catch {
   setError('Hubo un problema al subir la imagen.')
  } finally {
   setUploading(false)
  }
 }

 const handleSave = async () => {
  if (saving || uploading) return
  const name = form.name.trim()
  const sku = form.sku.trim().toUpperCase()
  if (!name || !sku || !form.categoryId) { setError('Nombre, SKU y categoría son obligatorios.'); return }
  if (/\s/.test(sku)) { setError('El SKU no puede contener espacios.'); return }
  const price = Number(form.price)
  if (form.price.trim() === '' || !isFinite(price) || price < 0 || price > 99999999.99) { setError('El precio debe ser un número mayor o igual a 0.'); return }
  const stock = Number(form.stock || '0')
  if (!editing && form.trackStock && (!Number.isInteger(stock) || stock < 0)) { setError('El stock inicial debe ser un entero mayor o igual a 0.'); return }
  const minStock = Number(form.minStock === '' ? '0' : form.minStock)
  if (!Number.isInteger(minStock) || minStock < 0) { setError('El stock mínimo debe ser un entero mayor o igual a 0.'); return }
  const round2 = (n: number) => Math.round(n * 100) / 100
  setSaving(true)
  setError('')
  try {
   const res = editing
    // SKU is immutable; stock changes go through "Ajustar stock" (atomic + movement log).
    // imageUrl/igvRegime always sent: '' clears the image / inherits the business default.
    ? await api.inventory.products({ id: editing.id }).patch({
     name, categoryId: form.categoryId, imageUrl: form.imageUrl, price: round2(price),
     trackStock: form.trackStock, minStock, igvRegime: form.igvRegime,
    }, { query: { tenantId } })
    : await api.inventory.products.post({
     tenantId, categoryId: form.categoryId, name, sku,
     ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
     price: round2(price),
     stock: form.trackStock ? stock : 0,
     trackStock: form.trackStock, minStock,
     ...(form.igvRegime ? { igvRegime: form.igvRegime } : {}),
    })
   if (res.error) { setError(apiMsg(res.error, 'Error guardando el producto. Verifica el SKU y los datos.')); return }
   onSaved()
  } catch {
   setError('Error guardando el producto. Verifica el SKU y los datos.')
  } finally {
   setSaving(false)
  }
 }

 return (
  <Modal title={editing ? 'Editar producto' : 'Nuevo producto'} subtitle={editing ? 'Modifica los datos del producto.' : 'Registra un producto en el inventario.'} onClose={onClose} testId="product-modal">
   <Section title="Datos">
    <div className="flex gap-3">
     <label className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted hover:border-primary">
      {form.imageUrl ? (
       <>
        <img src={form.imageUrl} className="absolute inset-0 size-full object-cover" alt="Vista previa" />
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-white opacity-0 transition-opacity group-hover:opacity-100"><Upload className="size-5" /></span>
       </>
      ) : uploading ? <Skeleton className="size-full" /> : <ImageIcon className="size-7 text-muted-foreground" />}
      <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} data-testid="product-image-input" />
     </label>
     <div className="flex-1 space-y-3">
      <Field label="Nombre">
       <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Chocolate Wonka Negro" data-testid="product-name" />
      </Field>
      {form.imageUrl && !uploading && (
       <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => set('imageUrl', '')}>Quitar imagen</Button>
      )}
     </div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     <Field label="SKU" hint={editing ? 'El SKU no se puede cambiar.' : undefined}>
      <Input value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} disabled={!!editing} className="font-mono" placeholder="Ej. WONKA-001" data-testid="product-sku" />
     </Field>
     <Field label="Categoría">
      <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={selectClass} data-testid="product-category">
       {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
     </Field>
    </div>
   </Section>

   <Section title="Venta y stock">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     <Field label="Precio de venta (S/)">
      <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" data-testid="product-price" />
     </Field>
     <div>
      <span className="mb-1.5 block text-sm font-semibold text-foreground">Controla stock</span>
      <button type="button" role="switch" aria-checked={form.trackStock} onClick={() => set('trackStock', !form.trackStock)} data-testid="product-track"
       className="flex h-10 w-full items-center gap-3 rounded-md border border-border bg-background px-3 text-sm">
       <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.trackStock ? 'bg-primary' : 'bg-border'}`}>
        <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${form.trackStock ? 'translate-x-5' : ''}`} />
       </span>
       {form.trackStock ? 'Sí, descuenta al vender' : 'No (servicio / sin stock)'}
      </button>
     </div>
     {form.trackStock && !editing && (
      <Field label="Stock inicial">
       <Input type="number" min="0" step="1" value={form.stock} onChange={(e) => set('stock', e.target.value)} data-testid="product-stock" />
      </Field>
     )}
     {form.trackStock && (
      <Field label="Stock mínimo" hint="Avisa como stock bajo al llegar a este nivel.">
       <Input type="number" min="0" step="1" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} data-testid="product-minstock" />
      </Field>
     )}
     {form.trackStock && editing && (
      <div className="sm:col-span-2" data-testid="product-stock-readonly">
       <span className="mb-1.5 block text-sm font-semibold text-foreground">Stock actual</span>
       <div className="flex items-center gap-3">
        <span className="text-lg font-bold">{editing.stock}</span>
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onAdjustStock(editing)} data-testid="product-adjust-link">Ajustar stock</Button>
       </div>
      </div>
     )}
    </div>
   </Section>

   <Section title="Tributación">
    <Field label="Afectación IGV">
     <select value={form.igvRegime} onChange={(e) => set('igvRegime', e.target.value)} className={selectClass} data-testid="product-igv">
      <option value="">Usar default del negocio</option>
      <option value="GRAVADO">Gravado</option>
      <option value="GRAVADO_10_5">Gravado 10.5%</option>
      <option value="EXONERADO">Exonerado</option>
      <option value="INAFECTO">Inafecto</option>
      <option value="ICBPER">ICBPER</option>
     </select>
    </Field>
   </Section>

   {cropSrc && <ImageCropModal imageSrc={cropSrc} aspectRatio={1} onConfirm={handleCropConfirm} onCancel={() => setCropSrc(null)} />}
   <ErrorBox message={error} />

   <div className="flex gap-3">
    <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="product-cancel">Cancelar</Button>
    <Button className="flex-1" onClick={handleSave} disabled={saving || uploading || !form.name.trim() || !form.sku.trim() || !form.categoryId} data-testid="product-save">
     {saving ? 'Guardando...' : editing ? 'Actualizar producto' : 'Crear producto'}
    </Button>
   </div>
  </Modal>
 )
}
