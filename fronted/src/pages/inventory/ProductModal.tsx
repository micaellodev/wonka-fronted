import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Upload, ImageIcon, Plus, Trash2, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Product, Category } from '@/types'
import { categoryGroups, joinVariant, nextSkus, skuPrefix } from '@/lib/catalog'
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

type VariantRow = { key: number; name: string; price: string; stock: string }
const round2 = (n: number) => Math.round(n * 100) / 100
const isMoney = (n: number) => isFinite(n) && n >= 0 && n <= 99999999.99

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

 // ── variantes (solo al crear): cada una es un producto real con su propio stock ──
 const [hasVariants, setHasVariants] = useState(false)
 const keySeq = useRef(2)
 const [variants, setVariants] = useState<VariantRow[]>([{ key: 0, name: '', price: '', stock: '0' }, { key: 1, name: '', price: '', stock: '0' }])
 const [createdAny, setCreatedAny] = useState(false)
 const setVariant = (key: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)))
 const addVariant = () => setVariants((vs) => [...vs, { key: keySeq.current++, name: '', price: '', stock: '0' }])

 // ── SKU automático: prefijo de la categoría + siguiente número libre ──
 const [skuAuto, setSkuAuto] = useState(!editing)
 const [autoSkus, setAutoSkus] = useState<string[]>([])
 const wanted = hasVariants ? variants.length : 1
 const category = categories.find((c) => c.id === form.categoryId)
 useEffect(() => {
  if (editing || !category) return
  let stale = false
  const prefix = skuPrefix(category.name)
  ;(async () => {
   try {
    const res = await api.inventory.products.get({ query: { tenantId, search: `${prefix}-`, limit: 500, status: 'all' } })
    const existing = res.error ? [] : ((res.data as unknown as { data: Product[] }).data ?? []).map((p) => p.sku)
    if (!stale) setAutoSkus(nextSkus(prefix, existing, wanted))
   } catch { if (!stale) setAutoSkus(nextSkus(prefix, [], wanted)) }
  })()
  return () => { stale = true }
 }, [tenantId, category, editing, wanted])
 const sku = skuAuto ? (autoSkus[0] ?? '') : form.sku

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

 /** Crea un producto; si el SKU automático ya lo tomó otro (409), prueba con el siguiente número. */
 const createOne = async (body: Record<string, unknown>, startSku: string) => {
  let current = startSku
  for (let attempt = 0; attempt < 8; attempt++) {
   const res = await api.inventory.products.post({ ...body, sku: current } as Parameters<typeof api.inventory.products.post>[0])
   if (!res.error) return null
   if (!skuAuto || (res.error as { status?: number }).status !== 409) return res.error
   current = nextSkus(current.replace(/-\d+$/, ''), [current])[0]!
  }
  return { value: { message: 'No se pudo asignar un SKU libre. Inténtalo de nuevo.' } }
 }

 const handleSave = async () => {
  if (saving || uploading) return
  const name = form.name.trim()
  if (!name || !form.categoryId) { setError('Nombre y categoría son obligatorios.'); return }
  const price = Number(form.price)
  const priceOk = form.price.trim() !== '' && isMoney(price)
  if (!hasVariants && !priceOk) { setError('El precio debe ser un número mayor o igual a 0.'); return }
  const minStock = Number(form.minStock === '' ? '0' : form.minStock)
  if (!Number.isInteger(minStock) || minStock < 0) { setError('El stock mínimo debe ser un entero mayor o igual a 0.'); return }

  // ── varias variantes de una vez ──
  if (!editing && hasVariants) {
   const names = variants.map((v) => v.name.trim())
   if (names.some((n) => !n)) { setError('Escribe el nombre de cada variante (ej. el sabor) o quita las filas vacías.'); return }
   if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) { setError('Hay variantes repetidas.'); return }
   for (const v of variants) {
    const p = v.price.trim() === '' ? price : Number(v.price)
    if ((v.price.trim() === '' && !priceOk) || !isMoney(p)) { setError(`Falta el precio de "${v.name.trim()}": ponlo en su fila o en el precio general.`); return }
    const st = Number(v.stock || '0')
    if (form.trackStock && (!Number.isInteger(st) || st < 0)) { setError(`El stock inicial de "${v.name.trim()}" debe ser un entero mayor o igual a 0.`); return }
   }
   if (autoSkus.length < variants.length) { setError('Calculando los SKU, espera un momento e inténtalo de nuevo.'); return }
   setSaving(true); setError('')
   try {
    const done = new Set<number>()
    for (const [i, v] of variants.entries()) {
     const p = v.price.trim() === '' ? price : Number(v.price)
     const err = await createOne({
      tenantId, categoryId: form.categoryId, name: joinVariant(name, v.name),
      ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
      price: round2(p), stock: form.trackStock ? Number(v.stock || '0') : 0,
      trackStock: form.trackStock, minStock,
      ...(form.igvRegime ? { igvRegime: form.igvRegime } : {}),
     }, autoSkus[i]!)
     if (err) {
      // Lo ya creado no se repite: quedan solo las filas pendientes
      setVariants((vs) => vs.filter((x) => !done.has(x.key)))
      setError(`${done.size ? `Se crearon ${done.size} de ${variants.length}. ` : ''}Falló "${v.name.trim()}": ${apiMsg(err, 'error al guardar.')}`)
      if (done.size) setCreatedAny(true)
      return
     }
     done.add(v.key)
    }
    onSaved()
   } catch {
    setError('Error guardando las variantes. Revisa tu conexión.')
   } finally {
    setSaving(false)
   }
   return
  }

  // ── un solo producto (o edición) ──
  const finalSku = sku.trim().toUpperCase()
  if (!finalSku) { setError('El SKU es obligatorio.'); return }
  if (/\s/.test(finalSku)) { setError('El SKU no puede contener espacios.'); return }
  const stock = Number(form.stock || '0')
  if (!editing && form.trackStock && (!Number.isInteger(stock) || stock < 0)) { setError('El stock inicial debe ser un entero mayor o igual a 0.'); return }
  setSaving(true)
  setError('')
  try {
   if (editing) {
    // SKU is immutable; stock changes go through "Ajustar stock" (atomic + movement log).
    // imageUrl/igvRegime always sent: '' clears the image / inherits the business default.
    const res = await api.inventory.products({ id: editing.id }).patch({
     name, categoryId: form.categoryId, imageUrl: form.imageUrl, price: round2(price),
     trackStock: form.trackStock, minStock, igvRegime: form.igvRegime,
    }, { query: { tenantId } })
    if (res.error) { setError(apiMsg(res.error, 'Error guardando el producto. Verifica los datos.')); return }
   } else {
    const err = await createOne({
     tenantId, categoryId: form.categoryId, name,
     ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
     price: round2(price), stock: form.trackStock ? stock : 0,
     trackStock: form.trackStock, minStock,
     ...(form.igvRegime ? { igvRegime: form.igvRegime } : {}),
    }, finalSku)
    if (err) { setError(apiMsg(err, 'Error guardando el producto. Verifica el SKU y los datos.')); return }
   }
   onSaved()
  } catch {
   setError('Error guardando el producto. Verifica el SKU y los datos.')
  } finally {
   setSaving(false)
  }
 }

 // Si ya se crearon variantes y se cierra a medias, igual hay que refrescar la lista
 const close = createdAny ? onSaved : onClose
 const groups = categoryGroups(categories)

 return (
  <Modal title={editing ? 'Editar producto' : 'Nuevo producto'} subtitle={editing ? 'Modifica los datos del producto.' : 'Registra un producto en el inventario.'} onClose={close} testId="product-modal">
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
      <Field label={hasVariants ? 'Nombre del producto (sin el sabor)' : 'Nombre'}>
       <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={hasVariants ? 'Ej. Helado con toppings' : 'Ej. Chocolate Wonka Negro'} data-testid="product-name" />
      </Field>
      {form.imageUrl && !uploading && (
       <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => set('imageUrl', '')}>Quitar imagen</Button>
      )}
     </div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     <Field label="Categoría">
      <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={selectClass} data-testid="product-category">
       {groups.map((g) => g.items.length === 1
        ? <option key={g.items[0]!.id} value={g.items[0]!.id}>{g.items[0]!.label}</option>
        : <optgroup key={g.label} label={g.label}>{g.items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}
      </select>
     </Field>
     {!hasVariants && (
      <Field label="SKU" hint={editing ? 'El SKU no se puede cambiar.' : skuAuto ? 'Se genera solo según la categoría.' : undefined}>
       <div className="flex gap-2">
        <Input value={sku} onChange={(e) => { setSkuAuto(false); set('sku', e.target.value.toUpperCase()) }} disabled={!!editing} className="font-mono" placeholder="Ej. WONKA-001" data-testid="product-sku" />
        {!editing && !skuAuto && (
         <Button type="button" variant="outline" size="icon" aria-label="Generar SKU automático" title="Generar SKU automático" onClick={() => setSkuAuto(true)}><Sparkles /></Button>
        )}
       </div>
      </Field>
     )}
    </div>
   </Section>

   {!editing && (
    <Section title="Variantes">
     <button type="button" role="switch" aria-checked={hasVariants} onClick={() => setHasVariants((v) => !v)} data-testid="product-has-variants"
      className="flex h-10 w-full items-center gap-3 rounded-md border border-border bg-background px-3 text-sm">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${hasVariants ? 'bg-primary' : 'bg-border'}`}>
       <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${hasVariants ? 'translate-x-5' : ''}`} />
      </span>
      {hasVariants ? 'Sí: tiene sabores, tamaños u otras opciones' : 'No: es un solo producto'}
     </button>
     {hasVariants && (
      <div className="space-y-2" data-testid="variants-editor">
       <p className="text-xs text-muted-foreground">Cada variante es un producto con su propio stock y SKU. En el punto de venta salen juntas bajo una sola tarjeta. Deja el precio vacío para usar el precio general.</p>
       <div className="grid grid-cols-[1fr_88px_80px_32px] gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground" aria-hidden>
        <span>Variante</span><span>Precio S/</span><span>{form.trackStock ? 'Stock' : ''}</span><span />
       </div>
       {variants.map((v, i) => (
        <div key={v.key} className="grid grid-cols-[1fr_88px_80px_32px] items-center gap-2" data-testid="variant-row">
         <Input value={v.name} onChange={(e) => setVariant(v.key, { name: e.target.value })} placeholder={i === 0 ? 'Ej. Yogurt griego' : 'Ej. Maracumango'} aria-label={`Nombre de la variante ${i + 1}`} />
         <Input type="number" min="0" step="0.01" value={v.price} onChange={(e) => setVariant(v.key, { price: e.target.value })} placeholder={form.price || 'Precio'} aria-label={`Precio de la variante ${i + 1}`} />
         {form.trackStock
          ? <Input type="number" min="0" step="1" value={v.stock} onChange={(e) => setVariant(v.key, { stock: e.target.value })} aria-label={`Stock inicial de la variante ${i + 1}`} />
          : <span className="text-xs text-muted-foreground">sin stock</span>}
         <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Quitar la variante ${i + 1}`} disabled={variants.length <= 2} onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}><Trash2 /></Button>
         <p className="col-span-4 -mt-1 font-mono text-[11px] text-muted-foreground">SKU {autoSkus[i] ?? '…'}</p>
        </div>
       ))}
       <Button type="button" variant="outline" size="sm" onClick={addVariant} data-testid="variant-add"><Plus /> Agregar variante</Button>
      </div>
     )}
    </Section>
   )}

   <Section title="Venta y stock">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     <Field label={hasVariants ? 'Precio general (S/)' : 'Precio de venta (S/)'}>
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
     {form.trackStock && !editing && !hasVariants && (
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
    <Button variant="secondary" className="flex-1" onClick={close} data-testid="product-cancel">Cancelar</Button>
    <Button className="flex-1" onClick={handleSave} disabled={saving || uploading || !form.name.trim() || !form.categoryId || (!hasVariants && !sku.trim())} data-testid="product-save">
     {saving ? 'Guardando...' : editing ? 'Actualizar producto' : hasVariants ? `Crear ${variants.length} variantes` : 'Crear producto'}
    </Button>
   </div>
  </Modal>
 )
}
