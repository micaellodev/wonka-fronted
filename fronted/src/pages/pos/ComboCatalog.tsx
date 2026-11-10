// Combos dentro de Categorías: si son solo productos van directo al carrito; si llevan tiempo de juego se abre
// una ventana para buscar al apoderado y elegir al niño (así el tiempo queda cargado a una sesión real, sin errores con SUNAT).
import { useState } from 'react'
import { Gift, Clock, Loader2, Baby } from 'lucide-react'
import type { Product } from '@/types'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { useComboStore } from '@/store/comboStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'
import type { Combo } from '@/lib/combos'
import { formatPEN } from '@/lib/format'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { GuardianSearchBox } from '../playzone/GuardianSearchBox'
import type { Guardian, Loose } from '../playzone/shared'

const minutesLabel = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${m} min`)

/** Un casillero por cada unidad de tiempo del combo (2 × 30 min = 2 casilleros) */
const timeSlots = (c: Combo) => c.items.filter((i) => i.minutes).flatMap((i) => Array.from({ length: i.qty }, () => i.minutes!))

export function ComboGrid({ products }: { products: Product[] }) {
  const combos = useComboStore((s) => s.combos).filter((c) => c.isActive)
  const addItem = useCartStore((s) => s.addItem)
  const [timed, setTimed] = useState<Combo | null>(null)

  const describe = (c: Combo) => c.items.map((i) => `${i.qty} × ${i.productId ? (products.find((p) => p.id === i.productId)?.name ?? 'Producto') : minutesLabel(i.minutes!)}`).join(' + ')

  // Solo productos: se agregan al carrito y el descuento del combo se calcula solo
  const addProducts = (c: Combo) => {
    for (const it of c.items) {
      const p = it.productId ? products.find((x) => x.id === it.productId) : null
      if (!p) continue
      for (let n = 0; n < it.qty; n++) addItem(p)
    }
  }
  const pick = (c: Combo) => {
    if (c.items.some((i) => !i.minutes && !products.some((p) => p.id === i.productId))) { toast.error('Este combo tiene un producto que ya no está disponible.'); return }
    if (timeSlots(c).length) setTimed(c)
    else { addProducts(c); toast.success(`${c.name} agregado al carrito.`) }
  }

  if (!combos.length) return <p className="col-span-full py-10 text-center text-sm font-bold uppercase tracking-widest text-muted-foreground">No hay combos activos</p>
  return (
    <>
      {combos.map((c) => (
        <button key={c.id} onClick={() => pick(c)} className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 text-left shadow-sm hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex w-full items-center justify-between">
            <Gift className="h-5 w-5 text-brand-500" />
            {timeSlots(c).length > 0 && <span className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-bold text-brand-500"><Clock className="h-3 w-3" />con tiempo</span>}
          </div>
          <p className="text-sm font-bold leading-tight text-foreground">{c.name}</p>
          <p className="text-[11px] text-muted-foreground">{describe(c)}</p>
          <p className="mt-auto text-base font-black text-brand-500">{formatPEN(c.price)}</p>
        </button>
      ))}
      {timed && <TimedComboDialog combo={timed} describe={describe(timed)} onClose={() => setTimed(null)} onDone={() => { addProducts(timed); setTimed(null) }} />}
    </>
  )
}

function TimedComboDialog({ combo, describe, onClose, onDone }: { combo: Combo; describe: string; onClose: () => void; onDone: () => void }) {
  const { tenantId } = useAuthStore()
  const addCharge = usePlayzoneTicketStore((s) => s.addCharge)
  const slots = timeSlots(combo)
  const [q, setQ] = useState('')
  const [guardian, setGuardian] = useState<Guardian | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const search = async () => {
    const v = q.trim()
    if (!v) return
    setSearching(true); setError('')
    try {
      const res = await (api.playzone.guardians.lookup as Loose).get({ query: { tenantId, q: v } })
      if (!res.error && (res.data as Loose).found) { setGuardian((res.data as Loose).data); setChosen([]) } else setError('No encontramos ese apoderado. Regístralo en Juegos infantiles.')
    } catch { setError('Error de conexión.') } finally { setSearching(false) }
  }
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < slots.length ? [...c, id] : c))

  const confirm = async () => {
    if (chosen.length !== slots.length || saving) return
    setSaving(true)
    const done: string[] = []
    try {
      for (const [i, childId] of chosen.entries()) {
        const body: Record<string, unknown> = { tenantId, childId, durationMinutes: slots[i] }
        if (notes.trim()) body.notes = notes.trim().slice(0, 120)
        const res = await (api.playzone.sessions as Loose).post(body)
        const kid = guardian?.children.find((c) => c.id === childId)?.fullName ?? 'Niño'
        if (res.error) { toast.error(`${kid}: ${apiErrorMessage(res.error, 'No se pudo iniciar el juego.')}`); return }
        const s = (res.data as Loose).data
        if (s.charge) addCharge(s.charge)
        done.push(`${kid} → pulsera ${s.wristbandCode}`)
      }
      toast.success(`Combo en el carrito. ${done.join(' · ')}`)
      onDone()
    } catch (e) { toast.error(apiErrorMessage(e, 'Error de conexión.')) } finally {
      setSaving(false)
      // Si falló a medias, los niños ya iniciados quedan con su cargo en el carrito: no se repiten
      if (done.length && done.length < slots.length) onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{combo.name}</DialogTitle>
          <DialogDescription>{describe}. Busca al apoderado y elige {slots.length === 1 ? 'al niño' : `a ${slots.length} niños`} ({slots.map(minutesLabel).join(' + ')}).</DialogDescription>
        </DialogHeader>
        <GuardianSearchBox tenantId={tenantId} value={q} onChange={setQ} onPick={(g) => { setGuardian(g); setChosen([]); setError('') }} onSubmit={() => void search()} searching={searching} error={error} />
        {guardian && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-muted-foreground">{guardian.fullName}</p>
            {guardian.children.map((c) => {
              const on = chosen.includes(c.id)
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)}
                  className={`flex items-center gap-2 rounded-sm border-2 px-3 py-2 text-left text-sm font-bold ${on ? 'border-brand-500 bg-brand-600 text-primary-foreground' : 'border-border bg-muted text-foreground'}`}>
                  <Baby className="h-4 w-4" /> {c.fullName}{c.age ? ` · ${c.age}A` : ''}
                </button>
              )
            })}
            {!guardian.children.length && <p className="text-xs text-muted-foreground">Este apoderado no tiene niños registrados.</p>}
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={120} placeholder="Descripción (ej: polo rojo, jeans)" />
          </div>
        )}
        <Button onClick={() => void confirm()} disabled={chosen.length !== slots.length || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Agregar al carrito · ${formatPEN(combo.price)}`}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
