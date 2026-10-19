import { useState } from 'react'
import { Plus, Edit2, Layers, Upload, ImageIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Category } from '@/types'
import { ImageCropModal } from './ImageCropModal'
import { ConfirmModal, ErrorBox, ErrorRetry, Field, Modal } from './shared'
import { apiMsg } from './utils'
import { useCan } from '@/lib/permissions'

export type CategoryWithCount = Category & { _count?: { products: number } }

function CategoryModal({ tenantId, editing, onClose, onSaved }: {
 tenantId: string; editing: CategoryWithCount | null; onClose: () => void; onSaved: () => void
}) {
 const productCount = editing?._count?.products ?? 0
 const [name, setName] = useState(editing?.name ?? '')
 const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '')
 const [uploading, setUploading] = useState(false)
 const [saving, setSaving] = useState(false)
 const [cropSrc, setCropSrc] = useState<string | null>(null)
 const [error, setError] = useState('')
 const [confirmDel, setConfirmDel] = useState(false)

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
   const res = await api.upload.post({ tenantId, file: new File([blob], 'category.jpg', { type: 'image/jpeg' }), folder: 'categories' })
   if (res.error) setError(apiMsg(res.error, 'Error subiendo la imagen.'))
   else setImageUrl((res.data as unknown as { data: { url: string } }).data.url)
  } catch {
   setError('Hubo un problema al subir la imagen.')
  } finally {
   setUploading(false)
  }
 }

 const handleSave = async () => {
  const trimmed = name.trim()
  if (!trimmed || saving || uploading) return
  if (trimmed.length > 80) { setError('El nombre admite como máximo 80 caracteres.'); return }
  setSaving(true)
  setError('')
  try {
   const res = editing
    // imageUrl always sent on edit: '' clears the image
    ? await api.inventory.categories({ id: editing.id }).patch({ name: trimmed, imageUrl }, { query: { tenantId } })
    : await api.inventory.categories.post({ tenantId, name: trimmed, ...(imageUrl ? { imageUrl } : {}) })
   if (res.error) { setError(apiMsg(res.error, 'Error guardando la categoría.')); return }
   onSaved()
  } catch {
   setError('Error guardando la categoría.')
  } finally {
   setSaving(false)
  }
 }

 const handleDelete = async () => {
  if (!editing || saving) return
  setSaving(true)
  setError('')
  try {
   const res = await api.inventory.categories({ id: editing.id }).delete(undefined, { query: { tenantId } })
   if (res.error) { setError(apiMsg(res.error, 'No se pudo eliminar la categoría.')); setConfirmDel(false); return }
   onSaved()
  } catch {
   setError('No se pudo eliminar la categoría.')
   setConfirmDel(false)
  } finally {
   setSaving(false)
  }
 }

 return (
  <Modal title={editing ? 'Editar categoría' : 'Nueva categoría'} subtitle="Nombre e imagen de la categoría." onClose={onClose} testId="category-modal">
   <label className="group relative flex h-36 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted hover:border-primary">
    {imageUrl ? (
     <>
      <img src={imageUrl} className="absolute inset-0 h-full w-full object-cover" alt="Vista previa" />
      <span className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/50 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
       <Upload className="size-5" /> Cambiar foto
      </span>
     </>
    ) : uploading ? <Skeleton className="size-full" /> : (
     <span className="flex flex-col items-center gap-2 text-muted-foreground"><ImageIcon className="size-8" /><span className="text-sm font-medium">Subir imagen</span></span>
    )}
    <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} data-testid="category-image-input" />
   </label>
   {cropSrc && <ImageCropModal imageSrc={cropSrc} aspectRatio={1} onConfirm={handleCropConfirm} onCancel={() => setCropSrc(null)} />}

   <Field label="Nombre de la categoría">
    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Chocolates" maxLength={80}
     onKeyDown={(e) => e.key === 'Enter' && handleSave()} data-testid="category-name" />
   </Field>

   {imageUrl && !uploading && (
    <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setImageUrl('')}>Quitar imagen</Button>
   )}
   <ErrorBox message={error} />

   {editing && (
    <Button type="button" variant="ghost" size="sm" className="self-start text-destructive" disabled={saving || productCount > 0}
     title={productCount > 0 ? 'Solo se pueden eliminar categorías sin productos' : ''}
     onClick={() => setConfirmDel(true)} data-testid="category-delete">
     Eliminar categoría{productCount > 0 ? ` (tiene ${productCount} productos)` : ''}
    </Button>
   )}

   <div className="flex gap-3">
    <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="category-cancel">Cancelar</Button>
    <Button className="flex-1" onClick={handleSave} disabled={saving || !name.trim() || uploading} data-testid="category-save">
     {saving ? 'Guardando...' : 'Guardar'}
    </Button>
   </div>

   {confirmDel && editing && (
    <ConfirmModal title="Eliminar categoría" message={`¿Eliminar la categoría "${editing.name}"? Esta acción no se puede deshacer.`}
     confirmLabel="Eliminar" destructive busy={saving} error={error} onConfirm={handleDelete} onClose={() => setConfirmDel(false)} />
   )}
  </Modal>
 )
}

export function CategoriesTab({ tenantId, categories, loading, error, onReload }: {
 tenantId: string; categories: CategoryWithCount[]; loading: boolean; error: string; onReload: () => void
}) {
 const [modal, setModal] = useState<{ editing: CategoryWithCount | null } | null>(null)
 const canEdit = useCan().can('inventory.edit')

 return (
  <div className="space-y-4" data-testid="categories-tab">
   {canEdit && <div className="flex justify-end">
    <Button onClick={() => setModal({ editing: null })} data-testid="category-new"><Plus /> Nueva categoría</Button>
   </div>}
   {error && <ErrorRetry message={error} onRetry={onReload} />}
   {loading ? (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
     {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
    </div>
   ) : categories.length === 0 && !error ? (
    <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground" data-testid="categories-empty">
     <Layers className="size-12 opacity-30" />
     <p className="text-sm">No hay categorías aún.</p>
    </div>
   ) : (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
     {categories.map((cat) => {
      const count = cat._count?.products ?? 0
      return (
       <div key={cat.id} data-testid="category-card" className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="aspect-square w-full overflow-hidden bg-muted">
         {cat.imageUrl ? <img src={cat.imageUrl} className="size-full object-cover" alt={cat.name} />
          : <div className="flex size-full items-center justify-center"><Layers className="size-10 text-muted-foreground opacity-50" /></div>}
        </div>
        <div className="p-3">
         <p className="truncate text-sm font-bold text-foreground">{cat.name}</p>
         <p className="mt-0.5 text-xs text-muted-foreground">{count} {count === 1 ? 'producto' : 'productos'}</p>
        </div>
        {canEdit && <Button size="icon" variant="outline" className="absolute right-2 top-2 size-8" aria-label={`Editar ${cat.name}`}
         onClick={() => setModal({ editing: cat })} data-testid="category-edit"><Edit2 /></Button>}
       </div>
      )
     })}
    </div>
   )}
   {modal && (
    <CategoryModal tenantId={tenantId} editing={modal.editing} onClose={() => setModal(null)} onSaved={() => { setModal(null); onReload() }} />
   )}
  </div>
 )
}
