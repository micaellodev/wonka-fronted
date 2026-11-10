import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatPEN } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type Loose } from './playzone/shared'
import type { Plan } from './playzone/BirthdaysView'

// ============================================================
// BirthdayPlansScreen — planes de cumpleaños: precio según el día, beneficios, niños incluidos y extras.
// Los feriados cobran el precio de domingo.
// ============================================================

type Draft = {
  id?: string; name: string; description: string; benefits: string; includedGuests: number; extraGuestPrice: string
  priceWeekday: string; priceSaturday: string; priceSunday: string; isActive: boolean; extras: Array<{ name: string; price: string }>
}
type Holiday = { id: string; date: string; label: string }

const emptyDraft: Draft = { name: '', description: '', benefits: '', includedGuests: 10, extraGuestPrice: '0', priceWeekday: '', priceSaturday: '', priceSunday: '', isActive: true, extras: [] }

export function BirthdayPlansScreen() {
  const { tenantId } = useAuthStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [hDate, setHDate] = useState('')
  const [hLabel, setHLabel] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([(api.birthdays as Loose).plans.get({ query: { tenantId } }), (api.birthdays as Loose).holidays.get({ query: { tenantId } })])
      setPlans((p.data as Loose)?.data ?? [])
      setHolidays((h.data as Loose)?.data ?? [])
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudieron cargar los planes.') })
    }
  }, [tenantId])
  useEffect(() => { void load() }, [load])

  const edit = (p: Plan & { isActive?: boolean }) =>
    setDraft({
      id: p.id, name: p.name, description: p.description ?? '', benefits: p.benefits ?? '', includedGuests: p.includedGuests, extraGuestPrice: String(p.extraGuestPrice),
      priceWeekday: String(p.priceWeekday), priceSaturday: String(p.priceSaturday), priceSunday: String(p.priceSunday), isActive: p.isActive !== false,
      extras: p.extras.map((e) => ({ name: e.name, price: String(e.price) })),
    })

  const save = async () => {
    if (!draft) return
    setMessage(null)
    setSaving(true)
    try {
      const body = {
        tenantId, name: draft.name.trim(), description: draft.description.trim() || undefined, benefits: draft.benefits.trim() || undefined,
        includedGuests: draft.includedGuests, extraGuestPrice: Number(draft.extraGuestPrice || 0),
        priceWeekday: Number(draft.priceWeekday || 0), priceSaturday: Number(draft.priceSaturday || 0), priceSunday: Number(draft.priceSunday || 0),
        isActive: draft.isActive, extras: draft.extras.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), price: Number(e.price || 0) })),
      }
      const res = draft.id ? await (api.birthdays as Loose).plans({ id: draft.id }).patch(body) : await (api.birthdays as Loose).plans.post(body)
      if (res.error) throw res.error
      setDraft(null)
      setMessage({ type: 'success', text: 'Plan guardado.' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudo guardar el plan.') })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: Plan) => {
    if (!window.confirm(`¿Eliminar el plan "${p.name}"?`)) return
    const res = await (api.birthdays as Loose).plans({ id: p.id }).delete(undefined, { query: { tenantId } })
    if (res.error) return setMessage({ type: 'error', text: apiErrorMessage(res.error, 'No se pudo eliminar.') })
    await load()
  }

  const addHoliday = async () => {
    if (!hDate) return
    const res = await (api.birthdays as Loose).holidays.post({ tenantId, date: hDate, label: hLabel })
    if (res.error) return setMessage({ type: 'error', text: apiErrorMessage(res.error, 'No se pudo agregar el feriado.') })
    setHDate(''); setHLabel('')
    await load()
  }
  const removeHoliday = async (id: string) => {
    await (api.birthdays as Loose).holidays({ id }).delete(undefined, { query: { tenantId } })
    await load()
  }

  const setExtra = (i: number, patch: Partial<{ name: string; price: string }>) =>
    setDraft((d) => (d ? { ...d, extras: d.extras.map((e, k) => (k === i ? { ...e, ...patch } : e)) } : d))

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Planes de cumpleaños: el precio cambia según el día de la reserva</p>
        {!draft && <Button onClick={() => setDraft(emptyDraft)}><Plus className="mr-2 h-4 w-4" /> Nuevo plan</Button>}
      </header>

      {message && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive'}`}>
          <AlertCircle className="h-4 w-4" /> {message.text}
        </div>
      )}

      {draft && (
        <Card className="mb-6 rounded-xl border-border bg-background">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{draft.id ? 'Editar plan' : 'Nuevo plan'}</CardTitle>
            <button onClick={() => setDraft(null)} aria-label="Cerrar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Nombre</Label><Input value={draft.name} maxLength={80} placeholder="Ej.: Plan Fiesta" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Descripción corta</Label><Input value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Lunes a viernes S/</Label><Input type="number" min={0} step="1" value={draft.priceWeekday} onChange={(e) => setDraft({ ...draft, priceWeekday: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Sábado S/</Label><Input type="number" min={0} step="1" value={draft.priceSaturday} onChange={(e) => setDraft({ ...draft, priceSaturday: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Domingo y feriados S/</Label><Input type="number" min={0} step="1" value={draft.priceSunday} onChange={(e) => setDraft({ ...draft, priceSunday: e.target.value })} /></div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Niños incluidos en el plan</Label><Input type="number" min={0} value={draft.includedGuests} onChange={(e) => setDraft({ ...draft, includedGuests: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Precio por niño adicional S/</Label><Input type="number" min={0} step="0.5" value={draft.extraGuestPrice} onChange={(e) => setDraft({ ...draft, extraGuestPrice: e.target.value })} /></div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Beneficios que incluye (uno por línea)</Label>
              <Textarea rows={4} maxLength={2000} value={draft.benefits} placeholder={'Decoración\nTorta y bocaditos\n2 horas de juegos'} onChange={(e) => setDraft({ ...draft, benefits: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Extras opcionales (se eligen al reservar)</Label>
              {draft.extras.map((x, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <Input className="col-span-7" value={x.name} maxLength={60} placeholder="Ej.: Piñata, Show de títeres" onChange={(e) => setExtra(i, { name: e.target.value })} />
                  <Input className="col-span-4" type="number" min={0} step="0.5" value={x.price} placeholder="Precio S/" onChange={(e) => setExtra(i, { price: e.target.value })} />
                  <button type="button" onClick={() => setDraft({ ...draft, extras: draft.extras.filter((_, k) => k !== i) })} aria-label="Quitar extra" className="col-span-1 flex justify-center rounded-md p-2 text-muted-foreground hover:bg-danger-soft hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, extras: [...draft.extras, { name: '', price: '' }] })}><Plus className="mr-1 h-4 w-4" /> Agregar extra</Button>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Activo (aparece al reservar)</label>
              <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar plan'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 space-y-2">
        {plans.length === 0 && !draft && <p className="text-sm text-muted-foreground">Aún no hay planes. Crea uno para poder cotizar y cobrar cumpleaños desde el carrito.</p>}
        {plans.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                L-V {formatPEN(p.priceWeekday)} · Sáb {formatPEN(p.priceSaturday)} · Dom/feriado {formatPEN(p.priceSunday)} · {p.includedGuests} niños incluidos · extra {formatPEN(p.extraGuestPrice)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => edit(p)} aria-label="Editar" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => void remove(p)} aria-label="Eliminar" className="rounded-md p-2 text-muted-foreground hover:bg-danger-soft hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <Card className="rounded-xl border-border bg-background">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Feriados (cobran como domingo)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Fecha</Label><Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Nombre</Label><Input value={hLabel} maxLength={60} placeholder="Ej.: Navidad" onChange={(e) => setHLabel(e.target.value)} /></div>
            <Button type="button" variant="outline" onClick={() => void addHoliday()} disabled={!hDate}><Plus className="mr-1 h-4 w-4" /> Agregar</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {holidays.length === 0 && <p className="text-sm text-muted-foreground">Sin feriados cargados.</p>}
            {holidays.map((h) => (
              <span key={h.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs">
                {h.date.split('-').reverse().join('/')} · {h.label}
                <button onClick={() => void removeHoliday(h.id)} aria-label="Quitar feriado" className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
