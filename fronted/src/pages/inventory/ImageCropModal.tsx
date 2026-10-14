import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Crop, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageCropModalProps {
 imageSrc: string
 onConfirm: (croppedBlob: Blob) => void
 onCancel: () => void
 aspectRatio?: number // e.g. 1 = square, 16/9, undefined = free
}

export function ImageCropModal({ imageSrc, onConfirm, onCancel, aspectRatio = 1 }: ImageCropModalProps) {
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
 <div className="fixed inset-0 bg-foreground/70 flex items-center justify-center p-4 z-[60]">
 <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Crop className="w-5 h-5 text-primary" />
 <h2 className="text-lg font-bold text-foreground">Ajustar imagen</h2>
 </div>
 <button onClick={onCancel} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors">
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Canvas preview */}
 <div
 ref={containerRef}
 className="relative rounded-2xl overflow-hidden border border-border select-none bg-muted cursor-grab active:cursor-grabbing"
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
 <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white bg-foreground/50 px-2 py-0.5 rounded-full pointer-events-none">
 Arrastra · Rueda = zoom
 </p>
 </div>

 {/* Controls */}
 <div className="flex flex-col gap-3">
 {/* Zoom slider */}
 <div className="flex items-center gap-3">
 <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
 <ZoomOut className="w-4 h-4" />
 </button>
 <div className="flex-1 flex flex-col gap-1">
 <input
 type="range" min="20" max="500" step="1"
 value={Math.round(zoom * 100)}
 onChange={e => setZoom(Number(e.target.value) / 100)}
 className="w-full accent-primary h-1.5"
 />
 <div className="flex justify-between text-[10px] text-muted-foreground">
 <span>Zoom</span>
 <span className="font-mono">{Math.round(zoom * 100)}%</span>
 </div>
 </div>
 <button onClick={() => setZoom(z => Math.min(5, z + 0.1))} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
 <ZoomIn className="w-4 h-4" />
 </button>
 </div>

 {/* Rotation slider */}
 <div className="flex items-center gap-3">
 <button onClick={() => setRotation(r => r - 90)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
 <RotateCw className="w-4 h-4 scale-x-[-1]" />
 </button>
 <div className="flex-1 flex flex-col gap-1">
 <input
 type="range" min="-180" max="180" step="1"
 value={rotation}
 onChange={e => setRotation(Number(e.target.value))}
 className="w-full accent-primary h-1.5"
 />
 <div className="flex justify-between text-[10px] text-muted-foreground">
 <span>Rotación</span>
 <span className="font-mono">{rotation}°</span>
 </div>
 </div>
 <button onClick={() => setRotation(r => r + 90)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
 <RotateCw className="w-4 h-4" />
 </button>
 </div>

 {/* Reset */}
 <button
 onClick={() => { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }) }}
 className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
 >
 ↺ Restablecer posición
 </button>
 </div>

 {/* Action buttons */}
 <div className="flex gap-3">
 <Button variant="secondary" className="flex-1" onClick={onCancel} data-testid="crop-cancel">Cancelar</Button>
 <Button className="flex-1" onClick={handleConfirm} data-testid="crop-confirm">Usar esta imagen</Button>
 </div>
 </div>
 </div>
 )
}
