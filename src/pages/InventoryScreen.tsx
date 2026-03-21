import { useEffect, useState, useCallback, useRef } from 'react'
import {
    Package, Plus, Search, Edit2, Layers, Upload, X, ImageIcon, CheckCircle, XCircle,
    ZoomIn, ZoomOut, RotateCw, Crop
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Product, Category } from '@/types'

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatCurrency(v: number) {
    return new Intl.NumberFormat('es-PE', {
        style: 'currency', currency: 'PEN', minimumFractionDigits: 2
    }).format(v)
}

function Spinner() {
    return (
        <div className="w-5 h-5 border-2 border-zinc-500 border-t-brand-400 rounded-full animate-spin" />
    )
}

// â”€â”€ Image Crop Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ImageCropModalProps {
    imageSrc: string
    onConfirm: (croppedBlob: Blob) => void
    onCancel: () => void
    aspectRatio?: number // e.g. 1 = square, 16/9, undefined = free
}

function ImageCropModal({ imageSrc, onConfirm, onCancel, aspectRatio = 1 }: ImageCropModalProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)

    const [zoom, setZoom] = useState(1)
    const [rotation, setRotation] = useState(0)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

    const CANVAS_W = 400
    const CANVAS_H = aspectRatio ? Math.round(CANVAS_W / aspectRatio) : 400

    // Draw the image onto canvas whenever state changes
    const draw = useCallback(() => {
        const canvas = canvasRef.current
        const img = imgRef.current
        if (!canvas || !img) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
        ctx.save()
        ctx.translate(CANVAS_W / 2 + offset.x, CANVAS_H / 2 + offset.y)
        ctx.rotate((rotation * Math.PI) / 180)
        ctx.scale(zoom, zoom)

        const scale = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight)
        const drawW = img.naturalWidth * scale
        const drawH = img.naturalHeight * scale
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
        ctx.restore()
    }, [zoom, rotation, offset, CANVAS_W, CANVAS_H])

    // Load image and trigger initial draw
    useEffect(() => {
        const img = new Image()
        img.onload = () => {
            imgRef.current = img
            draw()
        }
        img.src = imageSrc
    }, [imageSrc]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { draw() }, [draw])

    // Mouse drag handlers
    const onMouseDown = (e: React.MouseEvent) => {
        setDragging(true)
        dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
    }
    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return
        setOffset({
            x: dragStart.current.ox + (e.clientX - dragStart.current.mx),
            y: dragStart.current.oy + (e.clientY - dragStart.current.my),
        })
    }
    const onMouseUp = () => setDragging(false)

    // Touch drag handlers
    const touchStart = useRef({ tx: 0, ty: 0, ox: 0, oy: 0 })
    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0]
        touchStart.current = { tx: t.clientX, ty: t.clientY, ox: offset.x, oy: offset.y }
    }
    const onTouchMove = (e: React.TouchEvent) => {
        e.preventDefault()
        const t = e.touches[0]
        setOffset({
            x: touchStart.current.ox + (t.clientX - touchStart.current.tx),
            y: touchStart.current.oy + (t.clientY - touchStart.current.ty),
        })
    }

    // Wheel zoom
    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault()
        setZoom(z => Math.min(5, Math.max(0.2, z - e.deltaY * 0.001)))
    }

    const handleConfirm = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.toBlob(blob => {
            if (blob) onConfirm(blob)
        }, 'image/jpeg', 0.92)
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Crop className="w-5 h-5 text-violet-400" />
                        <h2 className="text-lg font-bold text-white">Ajustar imagen</h2>
                    </div>
                    <button onClick={onCancel} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Canvas preview */}
                <div
                    ref={containerRef}
                    className="relative rounded-2xl overflow-hidden border border-zinc-700 select-none bg-[repeating-conic-gradient(#334155_0%_25%,#1e293b_0%_50%)] bg-[length:16px_16px] cursor-grab active:cursor-grabbing"
                    style={{ width: '100%', paddingBottom: `${(CANVAS_H / CANVAS_W) * 100}%`, position: 'relative' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onWheel={onWheel}
                >
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_W}
                        height={CANVAS_H}
                        className="absolute inset-0 w-full h-full"
                    />
                    {/* Rule-of-thirds grid overlay */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}>
                        <line x1={CANVAS_W / 3} y1="0" x2={CANVAS_W / 3} y2={CANVAS_H} stroke="white" strokeWidth="0.5" />
                        <line x1={(CANVAS_W / 3) * 2} y1="0" x2={(CANVAS_W / 3) * 2} y2={CANVAS_H} stroke="white" strokeWidth="0.5" />
                        <line x1="0" y1={CANVAS_H / 3} x2={CANVAS_W} y2={CANVAS_H / 3} stroke="white" strokeWidth="0.5" />
                        <line x1="0" y1={(CANVAS_H / 3) * 2} x2={CANVAS_W} y2={(CANVAS_H / 3) * 2} stroke="white" strokeWidth="0.5" />
                    </svg>
                    <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/50 bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
                        Arrastra Â· Rueda = zoom
                    </p>
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-3">
                    {/* Zoom slider */}
                    <div className="flex items-center gap-3">
                        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <div className="flex-1 flex flex-col gap-1">
                            <input
                                type="range" min="20" max="500" step="1"
                                value={Math.round(zoom * 100)}
                                onChange={e => setZoom(Number(e.target.value) / 100)}
                                className="w-full accent-violet-500 h-1.5"
                            />
                            <div className="flex justify-between text-[10px] text-zinc-500">
                                <span>Zoom</span>
                                <span className="font-mono">{Math.round(zoom * 100)}%</span>
                            </div>
                        </div>
                        <button onClick={() => setZoom(z => Math.min(5, z + 0.1))} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Rotation slider */}
                    <div className="flex items-center gap-3">
                        <button onClick={() => setRotation(r => r - 90)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors">
                            <RotateCw className="w-4 h-4 scale-x-[-1]" />
                        </button>
                        <div className="flex-1 flex flex-col gap-1">
                            <input
                                type="range" min="-180" max="180" step="1"
                                value={rotation}
                                onChange={e => setRotation(Number(e.target.value))}
                                className="w-full accent-purple-500 h-1.5"
                            />
                            <div className="flex justify-between text-[10px] text-zinc-500">
                                <span>RotaciÃ³n</span>
                                <span className="font-mono">{rotation}Â°</span>
                            </div>
                        </div>
                        <button onClick={() => setRotation(r => r + 90)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors">
                            <RotateCw className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Reset */}
                    <button
                        onClick={() => { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }) }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center"
                    >
                        â†º Restablecer posiciÃ³n
                    </button>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 font-semibold text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 py-3 font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors"
                    >
                        Usar esta imagen
                    </button>
                </div>
            </div>
        </div>
    )
}

// â”€â”€ Category Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CategoryModalProps {
    tenantId: string
    editing: Category | null
    onClose: () => void
    onSaved: () => void
}

function CategoryModal({ tenantId, editing, onClose, onSaved }: CategoryModalProps) {
    const [name, setName] = useState(editing?.name ?? '')
    const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '')
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [cropSrc, setCropSrc] = useState<string | null>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => setCropSrc(reader.result as string)
        reader.readAsDataURL(file)
        // Reset input so same file can be selected again
        e.target.value = ''
    }

    const handleCropConfirm = async (blob: Blob) => {
        setCropSrc(null)
        setUploading(true)
        try {
            const croppedFile = new File([blob], 'category.jpg', { type: 'image/jpeg' })
            const res = await api.upload.post({ tenantId, file: croppedFile, folder: 'categories' })
            if (!res.error) {
                const data = res.data as unknown as { data: { url: string } }
                setImageUrl(data.data.url)
            } else {
                alert('Error subiendo la imagen.')
            }
        } catch {
            alert('Hubo un problema al subir la imagen.')
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        if (!name.trim()) return
        setSaving(true)
        try {
            if (editing) {
                await (api.inventory.categories as any)({ id: editing.id }).patch(
                    { name, ...(imageUrl ? { imageUrl } : {}) } as any,
                    { query: { tenantId } } as any
                )
            } else {
                await api.inventory.categories.post({
                    tenantId,
                    name,
                    ...(imageUrl ? { imageUrl } : {})
                } as any)
            }
            onSaved()
        } catch {
            alert('Error guardando la categoria.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">{editing ? 'Editar Categoria' : 'Nueva Categoria'}</h2>
                        <p className="text-sm text-zinc-400 mt-0.5">{editing ? 'Modifica nombre o imagen.' : 'Crea una nueva categoria de productos.'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Image Upload */}
                <label className="relative w-full h-36 rounded-2xl overflow-hidden border-2 border-dashed border-zinc-600 hover:border-violet-500 transition-colors cursor-pointer group bg-zinc-900/40 flex items-center justify-center">
                    {imageUrl ? (
                        <>
                            <img src={imageUrl} className="absolute inset-0 w-full h-full object-cover" alt="preview" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload className="w-6 h-6 text-white" />
                                <span className="text-white text-sm font-medium ml-2">Cambiar foto</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-500 group-hover:text-violet-400 transition-colors">
                            {uploading ? <Spinner /> : <><ImageIcon className="w-8 h-8" /><span className="text-sm font-medium">Subir imagen de categoria</span></>}
                        </div>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Spinner />
                        </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} />
                </label>

                {/* Crop modal */}
                {cropSrc && (
                    <ImageCropModal
                        imageSrc={cropSrc}
                        aspectRatio={1}
                        onConfirm={handleCropConfirm}
                        onCancel={() => setCropSrc(null)}
                    />
                )}

                {/* Name Field */}
                <div>
                    <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Nombre de la Categoria</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                        placeholder="Ej. Chocolates, Caramelos..."
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 font-semibold text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !name.trim() || uploading}
                        className="flex-1 py-3 font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// â”€â”€ Product Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ProductModalProps {
    tenantId: string
    categories: Category[]
    editing: Product | null
    onClose: () => void
    onSaved: () => void
}

interface StockEntryModalProps {
    tenantId: string
    products: Product[]
    onClose: () => void
    onSaved: () => void
}

function StockEntryModal({ tenantId, products, onClose, onSaved }: StockEntryModalProps) {
    const [productId, setProductId] = useState(products[0]?.id ?? '')
    const [qty, setQty] = useState('1')
    const [saving, setSaving] = useState(false)

    const selectedProduct = products.find((p) => p.id === productId) ?? null

    const handleSave = async () => {
        if (!selectedProduct) return
        const qtyNum = parseInt(qty, 10)
        if (isNaN(qtyNum) || qtyNum <= 0) {
            alert('Ingresa una cantidad valida mayor a 0.')
            return
        }

        setSaving(true)
        try {
            await (api.inventory.products as any)({ id: selectedProduct.id }).patch(
                {
                    name: selectedProduct.name,
                    sku: selectedProduct.sku,
                    categoryId: selectedProduct.category.id,
                    ...(selectedProduct.imageUrl ? { imageUrl: selectedProduct.imageUrl } : {}),
                    price: selectedProduct.price,
                    cost: selectedProduct.cost,
                    stock: selectedProduct.stock + qtyNum,
                    isActive: selectedProduct.isActive,
                } as any,
                { query: { tenantId } } as any
            )

            onSaved()
        } catch {
            alert('No se pudo registrar la entrada de productos.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">Entrada de Productos</h2>
                        <p className="text-sm text-zinc-400 mt-0.5">Suma unidades al stock actual del inventario.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Producto</label>
                    <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors"
                    >
                        {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} Â· {p.sku}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Cantidad de entrada</label>
                        <input
                            type="number"
                            min="1"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                            placeholder="1"
                        />
                    </div>
                    <div className="flex items-end">
                        <div className="w-full bg-zinc-900/40 border border-zinc-700/50 rounded-xl px-4 py-2.5">
                            <span className="text-xs text-zinc-500 block mb-0.5">Stock actual</span>
                            <span className="text-sm font-bold text-zinc-200">{selectedProduct?.stock ?? 0}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-700/50 rounded-xl px-4 py-3">
                    <span className="text-xs text-zinc-500 block mb-1">Nuevo stock proyectado</span>
                    <span className="text-lg font-black text-green-400">
                        {(selectedProduct?.stock ?? 0) + Math.max(0, parseInt(qty, 10) || 0)}
                    </span>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 font-semibold text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !selectedProduct || products.length === 0}
                        className="flex-1 py-3 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                        {saving ? 'Registrando...' : 'Registrar Entrada'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ProductModal({ tenantId, categories, editing, onClose, onSaved }: ProductModalProps) {
    const [form, setForm] = useState({
        name: editing?.name ?? '',
        sku: editing?.sku ?? '',
        categoryId: editing?.category?.id ?? categories[0]?.id ?? '',
        imageUrl: editing?.imageUrl ?? '',
        price: editing?.price?.toString() ?? '',
        cost: editing?.cost?.toString() ?? '',
        stock: editing?.stock?.toString() ?? '0',
        trackStock: editing?.trackStock ?? true,
        isActive: editing?.isActive ?? true,
    })
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [cropSrc, setCropSrc] = useState<string | null>(null)

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
        try {
            const croppedFile = new File([blob], 'product.jpg', { type: 'image/jpeg' })
            const res = await api.upload.post({ tenantId, file: croppedFile, folder: 'products' })
            if (!res.error) {
                const data = res.data as unknown as { data: { url: string } }
                setForm(prev => ({ ...prev, imageUrl: data.data.url }))
            } else {
                alert('Error subiendo la imagen.')
            }
        } catch {
            alert('Hubo un problema al subir la imagen.')
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        if (!form.name.trim() || !form.sku.trim() || !form.categoryId) return
        const price = parseFloat(form.price)
        const cost = parseFloat(form.cost)
        if (isNaN(price) || isNaN(cost)) { alert('Precio y costo deben ser nÃºmeros vÃ¡lidos.'); return }
        setSaving(true)
        try {
            if (editing) {
                await (api.inventory.products as any)({ id: editing.id }).patch(
                    {
                        name: form.name,
                        sku: editing.sku, // SKU not editable, kept for context
                        categoryId: form.categoryId,
                        ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
                        price,
                        cost,
                        stock: parseInt(form.stock) || 0,
                        trackStock: form.trackStock,
                        isActive: form.isActive,
                    } as any,
                    { query: { tenantId } } as any
                )
            } else {
                await api.inventory.products.post({
                    tenantId,
                    categoryId: form.categoryId,
                    name: form.name,
                    sku: form.sku,
                    ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
                    price,
                    cost,
                    stock: parseInt(form.stock) || 0,
                    trackStock: form.trackStock,
                } as any)
            }
            onSaved()
        } catch {
            alert('Error guardando el producto. Verifica el SKU y los datos.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">{editing ? 'Editar Producto' : 'Nuevo Producto'}</h2>
                        <p className="text-sm text-zinc-400 mt-0.5">{editing ? 'Modifica los datos del producto.' : 'Registra un nuevo producto en el inventario.'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Image Upload */}
                <label className="relative w-full h-32 rounded-2xl overflow-hidden border-2 border-dashed border-zinc-600 hover:border-violet-500 transition-colors cursor-pointer group bg-zinc-900/40 flex items-center justify-center shrink-0">
                    {form.imageUrl ? (
                        <>
                            <img src={form.imageUrl} className="absolute inset-0 w-full h-full object-cover" alt="preview" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload className="w-5 h-5 text-white" />
                                <span className="text-white text-sm font-medium ml-2">Cambiar foto</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-500 group-hover:text-violet-400 transition-colors">
                            {uploading ? <Spinner /> : <><ImageIcon className="w-7 h-7" /><span className="text-sm font-medium">Subir foto del producto</span></>}
                        </div>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Spinner />
                        </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} />
                </label>

                {/* Crop modal */}
                {cropSrc && (
                    <ImageCropModal
                        imageSrc={cropSrc}
                        aspectRatio={1}
                        onConfirm={handleCropConfirm}
                        onCancel={() => setCropSrc(null)}
                    />
                )}

                {/* Form Fields */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Nombre del Producto</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                            placeholder="Ej. Chocolate Wonka Negro"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">SKU</label>
                        <input
                            type="text"
                            value={form.sku}
                            onChange={e => setForm(p => ({ ...p, sku: e.target.value.toUpperCase() }))}
                            disabled={!!editing}
                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                            placeholder="Ej. WONKA-001"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Categoria</label>
                        <select
                            value={form.categoryId}
                            onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors"
                        >
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Precio de Venta (S/)</label>
                        <input
                            type="number"
                            min="0"
                            value={form.price}
                            onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Costo Unitario (S/)</label>
                        <input
                            type="number"
                            min="0"
                            value={form.cost}
                            onChange={e => setForm(p => ({ ...p, cost: e.target.value }))}
                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                            placeholder="0"
                        />
                    </div>

                    <div className="flex flex-col gap-2 justify-center mt-2">
                        <label className="block text-sm font-semibold text-zinc-300">Control de Stock</label>
                        <div className="flex items-center gap-3 bg-zinc-900/30 rounded-xl px-4 py-2 border border-zinc-700/50">
                            <button
                                type="button"
                                onClick={() => setForm(p => ({ ...p, trackStock: !p.trackStock }))}
                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${form.trackStock ? 'bg-violet-600' : 'bg-zinc-600'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.trackStock ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                            <span className="text-sm font-medium text-zinc-300 leading-tight">
                                {form.trackStock ? 'Con stock' : 'Sin stock'}
                            </span>
                        </div>
                    </div>

                    {form.trackStock && (
                        <div>
                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Stock Inicial</label>
                            <input
                                type="number"
                                min="0"
                                value={form.stock}
                                onChange={e => setForm(p => ({ ...p, stock: e.target.value }))}
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                                placeholder="0"
                            />
                        </div>
                    )}

                    {/* Margin preview */}
                    <div className="flex items-end pb-1">
                        <div className="w-full bg-zinc-900/40 border border-zinc-700/50 rounded-xl px-4 py-2.5">
                            <span className="text-xs text-zinc-500 block mb-0.5">Margen estimado</span>
                            <span className={`text-sm font-bold ${parseFloat(form.price) > 0 && parseFloat(form.cost) >= 0
                                ? ((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price) * 100) >= 20
                                    ? 'text-green-400'
                                    : 'text-amber-400'
                                : 'text-zinc-500'
                                }`}>
                                {parseFloat(form.price) > 0 && !isNaN(parseFloat(form.cost))
                                    ? `${(((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price)) * 100).toFixed(1)}%`
                                    : '0%'
                                }
                            </span>
                        </div>
                    </div>
                </div>

                {/* Active toggle (edit only) */}
                {editing && (
                    <div className="flex items-center gap-3 bg-zinc-900/30 rounded-xl px-4 py-3 border border-zinc-700/50">
                        <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                            className={`w-11 h-6 rounded-full transition-colors relative ${form.isActive ? 'bg-violet-600' : 'bg-zinc-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm font-medium text-zinc-300">
                            {form.isActive ? 'Producto activo (visible en POS)' : 'Producto inactivo (oculto en POS)'}
                        </span>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 font-semibold text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !form.name.trim() || !form.sku.trim() || !form.categoryId || uploading}
                        className="flex-1 py-3 font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                        {saving ? 'Guardando...' : editing ? 'Actualizar Producto' : 'Crear Producto'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function InventoryScreen() {
    const { tenantId } = useAuthStore()

    type TabType = 'productos' | 'categorias'
    const [activeTab, setActiveTab] = useState<TabType>('productos')
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Modal state
    const [catModal, setCatModal] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null })
    const [prodModal, setProdModal] = useState<{ open: boolean; editing: Product | null }>({ open: false, editing: null })
    const [isAttendanceOpen, setIsAttendanceOpen] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [prodRes, catRes] = await Promise.all([
                api.inventory.products.get({ query: { tenantId, limit: 100, page: 1 } }),
                api.inventory.categories.get({ query: { tenantId } })
            ])
            if (!prodRes.error) {
                const response = prodRes.data as unknown as { data: Product[] }
                setProducts(response.data ?? [])
            }
            if (!catRes.error) {
                const response = catRes.data as unknown as { data: Category[] }
                setCategories(response.data ?? [])
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId])

    useEffect(() => { fetchData() }, [fetchData])

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.category.name.toLowerCase().includes(search.toLowerCase())
    )

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-surface-900 text-zinc-200 flex flex-col">
            {/* Header */}
            <header className="px-6 py-4 bg-zinc-800/80 border-b border-white/5 shadow-md flex items-center justify-between shrink-0 rounded-sm">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <Package className="w-5 h-5 text-violet-400" /> Inventario
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {activeTab === 'categorias' && (
                        <button
                            onClick={() => setCatModal({ open: true, editing: null })}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium text-white transition-all active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Nueva Categoria
                        </button>
                    )}
                    {activeTab === 'productos' && (
                        <>
                            <button
                                onClick={() => setIsAttendanceOpen(true)}
                                disabled={products.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-all active:scale-95"
                                title={products.length === 0 ? 'No hay productos para registrar entrada' : ''}
                            >
                                <Plus className="w-4 h-4" /> Entrada
                            </button>
                            <button
                                onClick={() => setProdModal({ open: true, editing: null })}
                                disabled={categories.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-medium text-white transition-all active:scale-95"
                                title={categories.length === 0 ? 'Crea al menos una categoria primero' : ''}
                            >
                                <Plus className="w-4 h-4" /> Nuevo Producto
                            </button>
                        </>
                    )}
                </div>
            </header>

            {/* Tabs + Search */}
            <div className="px-6 pt-5 pb-0 shrink-0 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex space-x-2 bg-zinc-800/50 p-1.5 rounded-xl w-fit border border-zinc-700/50">
                    <button
                        onClick={() => setActiveTab('productos')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'productos' ? 'bg-violet-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
                    >
                        <Package className="w-4 h-4" /> Productos
                        <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full">{products.length}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('categorias')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'categorias' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
                    >
                        <Layers className="w-4 h-4" /> Categorias
                        <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full">{categories.length}</span>
                    </button>
                </div>

                <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        type="text"
                        placeholder={activeTab === 'productos' ? 'Buscar por nombre, SKU o categoria...' : 'Buscar categoria...'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    />
                </div>
            </div>

            {/* Content */}
            <main className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
                {/* â”€â”€ PRODUCTOS TAB â”€â”€ */}
                {activeTab === 'productos' && (
                    <div className="flex-1 bg-zinc-800/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-zinc-800/80 text-zinc-400 text-xs border-b border-white/5 uppercase tracking-wider">
                                        <th className="px-4 py-3 font-semibold">Producto</th>
                                        <th className="px-4 py-3 font-semibold">SKU</th>
                                        <th className="px-4 py-3 font-semibold">Categoria</th>
                                        <th className="px-4 py-3 font-semibold text-right">Precio</th>
                                        <th className="px-4 py-3 font-semibold text-right">Costo</th>
                                        <th className="px-4 py-3 font-semibold text-right">Margen</th>
                                        <th className="px-4 py-3 font-semibold text-center">Stock</th>
                                        <th className="px-4 py-3 font-semibold text-center">Estado</th>
                                        <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={9} className="p-12 text-center">
                                                <div className="flex flex-col items-center gap-3 text-zinc-400">
                                                    <div className="w-8 h-8 border-2 border-zinc-600 border-t-brand-400 rounded-full animate-spin" />
                                                    Cargando productos...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-12 text-center">
                                                <div className="flex flex-col items-center gap-3 text-zinc-500">
                                                    <Package className="w-10 h-10 opacity-30" />
                                                    <p className="text-sm">{search ? 'No se encontraron productos con ese filtro.' : 'No hay productos registrados. Â¡Crea el primero!'}</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProducts.map(p => {
                                            const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0
                                            return (
                                                <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                                                    {/* Product name + image */}
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-700 border border-zinc-600 shrink-0">
                                                                {p.imageUrl ? (
                                                                    <img src={p.imageUrl} className="w-full h-full object-cover" alt={p.name} />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                        <Package className="w-4 h-4 text-zinc-500" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-medium text-white">{p.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-mono text-zinc-400">{p.sku}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="bg-zinc-700/60 px-2.5 py-1 rounded-full text-xs font-medium text-zinc-300">{p.category.name}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-green-400 font-bold text-right">{formatCurrency(p.price)}</td>
                                                    <td className="px-4 py-3 text-sm text-zinc-400 text-right">{formatCurrency(p.cost)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`text-xs font-bold ${margin >= 30 ? 'text-green-400' : margin >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                                                            {margin.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.stock <= 0 ? 'bg-red-500/10 text-red-400' : p.stock <= 5 ? 'bg-amber-500/10 text-amber-400' : 'bg-green-500/10 text-green-400'}`}>
                                                            {p.stock}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {p.isActive ? (
                                                            <CheckCircle className="w-4 h-4 text-green-400 inline-block drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
                                                        ) : (
                                                            <XCircle className="w-4 h-4 text-zinc-500 inline-block" />
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => setProdModal({ open: true, editing: p })}
                                                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* â”€â”€ CATEGORÃAS TAB â”€â”€ */}
                {activeTab === 'categorias' && (
                    loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-3 text-zinc-400">
                                <div className="w-8 h-8 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
                                Cargando categorias...
                            </div>
                        </div>
                    ) : filteredCategories.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 text-zinc-500">
                                <Layers className="w-14 h-14 opacity-20" />
                                <p className="text-base font-medium">{search ? 'Sin resultados para esa bÃºsqueda.' : 'No hay categorias aÃºn.'}</p>
                                {!search && (
                                    <button
                                        onClick={() => setCatModal({ open: true, editing: null })}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-white transition-all active:scale-95"
                                    >
                                        <Plus className="w-4 h-4" /> Crear primera categoria
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {filteredCategories.map(cat => {
                                const count = products.filter(p => p.category.id === cat.id).length
                                return (
                                    <div
                                        key={cat.id}
                                        className="group relative bg-zinc-800/60 border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all"
                                    >
                                        {/* Image */}
                                        <div className="aspect-square w-full bg-zinc-700/50 overflow-hidden">
                                            {cat.imageUrl ? (
                                                <img
                                                    src={cat.imageUrl}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    alt={cat.name}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                                                    <Layers className="w-10 h-10 text-zinc-500 opacity-50" />
                                                </div>
                                            )}
                                        </div>
                                        {/* Info */}
                                        <div className="p-3">
                                            <p className="text-sm font-bold text-white truncate">{cat.name}</p>
                                            <p className="text-xs text-zinc-500 mt-0.5">{count} {count === 1 ? 'producto' : 'productos'}</p>
                                        </div>
                                        {/* Edit button */}
                                        <button
                                            onClick={() => setCatModal({ open: true, editing: cat })}
                                            className="absolute top-2 right-2 p-1.5 bg-zinc-900/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            title="Editar categoria"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )
                )}
            </main>

            {/* Modals */}
            {catModal.open && (
                <CategoryModal
                    tenantId={tenantId}
                    editing={catModal.editing}
                    onClose={() => setCatModal({ open: false, editing: null })}
                    onSaved={() => { setCatModal({ open: false, editing: null }); fetchData() }}
                />
            )}

            {prodModal.open && (
                <ProductModal
                    tenantId={tenantId}
                    categories={categories}
                    editing={prodModal.editing}
                    onClose={() => setProdModal({ open: false, editing: null })}
                    onSaved={() => { setProdModal({ open: false, editing: null }); fetchData() }}
                />
            )}

            {isAttendanceOpen && (
                <StockEntryModal
                    tenantId={tenantId}
                    products={products}
                    onClose={() => setIsAttendanceOpen(false)}
                    onSaved={() => {
                        setIsAttendanceOpen(false)
                        fetchData()
                    }}
                />
            )}
        </div>
    )
}

