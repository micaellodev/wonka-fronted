import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { formatPEN } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Product } from '@/types'
import type { Combo, ComboItem } from '@/lib/combos'
import { type Loose, type PlayzoneRates } from './playzone/shared'

// ============================================================
// CombosScreen — promociones: "2 galletas a S/3", "1 hora + 1 galleta a S/X".
// El descuento = precio normal de los componentes - precio del combo; se aplica solo en el cobro.
// ============================================================

type Draft = { id?: string; name: string; price: string; isActive: boolean; items: Array<{ kind: 'product' | 'time'; productId: string; minutes: number; qty: number }> }

const emptyDraft: Draft = { name: '', price: '', isActive: true, items: [{ kind: 'product', productId: '', minutes: 30, qty: 1 }] }
const select = 'h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground'

export function CombosScreen() {
  const { tenantId } = useAuthStore()
  const [combos, setCombos] = useState<Combo[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rates, setRates] = useState<PlayzoneRates | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [c, p, r] = await Promise.all([
        api.combos.get({ query: { tenantId } }),
        api.inventory.products.get({ query: { tenantId, limit: 500, page: 1, status: 'active' } }),
        (api.playzone.rates as Loose).get({ query: { tenantId } }),
      ])
      setCombos((c.data as { data?: Combo[] })?.data ?? [])
      setProducts(((p.data as unknown as { data?: Product[] })?.data ?? []).filter((x) => x.isActive))
      setRates((r.data as { data?: PlayzoneRates })?.data ?? null)
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudieron cargar los datos.') })
    }
  }, [tenantId])
  useEffect(() => { void load() }, [load])

  const priceOf = (it: Draft['items'][number]) =>
    it.kind === 'product'
      ? (products.find((p) => p.id === it.productId)?.price ?? 0) * it.qty
      : (rates?.durations.find((d) => d.minutes === it.minutes)?.price ?? 0) * it.qty
  const regular = useMemo(() => (draft ? draft.items.reduce((s, it) => s + priceOf(it), 0) : 0), [draft, products, rates]) // eslint-disable-line react-hooks/exhaustive-deps
  const comboPrice = Number(draft?.price || 0)

  const setItem = (i: number, patch: Partial<Draft['items'][number]>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) } : d))

  const edit = (c: Combo) =>
    setDraft({
      id: c.id, name: c.name, price: String(c.price), isActive: c.isActive,
      items: c.items.map((it: ComboItem) => (it.productId ? { kind: 'product', productId: it.productId, minutes: 30, qty: it.qty } : { kind: 'time', productId: '', minutes: it.minutes ?? 30, qty: it.qty })),
    })

  const save = async () => {
    if (!draft) return
    setMessage(null)
    setSaving(true)
    try {
      const body = {
        tenantId,
        name: draft.name.trim(),
        price: comboPrice,
        isActive: draft.isActive,
        items: draft.items.map((it) => (it.kind === 'product' ? { productId: it.productId, qty: it.qty } : { minutes: it.minutes, qty: it.qty })),
      }
      const res = draft.id ? await api.combos({ id: draft.id }).patch(body) : await api.combos.post(body)
      if (res.error) throw res.error
      setDraft(null)
      setMessage({ type: 'success', text: 'Combo guardado. Se aplica solo cuando la venta tiene sus componentes.' })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudo guardar el combo.') })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c: Combo) => {
    if (!window.confirm(`¿Eliminar el combo "${c.name}"?`)) return
    const res = await api.combos({ id: c.id }).delete(undefined, { query: { tenantId } })
    if (res.error) return setMessage({ type: 'error', text: apiErrorMessage(res.error, 'No se pudo eliminar.') })
    await load()
  }

  const describe = (c: Combo) =>
    c.items.map((it) => `${it.qty} × ${it.productId ? (products.find((p) => p.id === it.productId)?.name ?? 'producto') : `${rates?.durations.find((d) => d.minutes === it.minutes)?.label ?? it.minutes + ' min'}`}`).join(' + ')

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Combos y promociones: llevando varios, el precio baja. El descuento se aplica solo al cobrar.</p>
        {!draft && <Button onClick={() => setDraft(emptyDraft)}><Plus className="mr-2 h-4 w-4" /> Nuevo combo</Button>}
      </header>

      {message && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive'}`}>
          <AlertCircle className="h-4 w-4" /> {message.text}
        </div>
      )}

      {draft && (
        <Card className="mb-6 rounded-xl border-border bg-background">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{draft.id ? 'Editar combo' : 'Nuevo combo'}</CardTitle>
            <button onClick={() => setDraft(null)} aria-label="Cerrar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Nombre</Label>
                <Input value={draft.name} maxLength={80} placeholder="Ej.: 2 galletas" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Precio del combo S/</Label>
                <Input type="number" min={0} step="0.1" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Qué incluye</Label>
              {draft.items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-lg border border-border bg-muted p-2">
                  <select className={`${select} col-span-3`} value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value as 'product' | 'time' })}>
                    <option value="product">Producto</option>
                    <option value="time">Tiempo de juego</option>
                  </select>
                  {it.kind === 'product' ? (
                    <select className={`${select} col-span-6`} value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value })}>
                      <option value="">Elige un producto…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatPEN(p.price)}</option>)}
                    </select>
                  ) : (
                    <select className={`${select} col-span-6`} value={it.minutes} onChange={(e) => setItem(i, { minutes: Number(e.target.value) })}>
                      {(rates?.durations ?? []).map((d) => <option key={d.minutes} value={d.minutes}>{d.label} — {formatPEN(d.price)}</option>)}
                    </select>
                  )}
                  <Input className="col-span-2" type="number" min={1} max={50} value={it.qty} onChange={(e) => setItem(i, { qty: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} aria-label="Cantidad" />
                  <button type="button" disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })} aria-label="Quitar componente" className="col-span-1 flex justify-center rounded-md p-2 text-muted-foreground hover:bg-danger-soft hover:text-destructive disabled:opacity-30">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, items: [...draft.items, { kind: 'product', productId: '', minutes: 30, qty: 1 }] })}>
                <Plus className="mr-1 h-4 w-4" /> Agregar componente
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
              <p>Precio normal: <b>{formatPEN(regular)}</b> · Combo: <b>{formatPEN(comboPrice)}</b> · Descuento: <b className={regular - comboPrice > 0 ? 'text-success' : 'text-destructive'}>{formatPEN(Math.max(0, regular - comboPrice))}</b></p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Activo</label>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar combo'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {combos.length === 0 && !draft && <p className="text-sm text-muted-foreground">Aún no hay combos. Crea uno, por ejemplo "2 galletas a S/3".</p>}
        {combos.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{c.name} {!c.isActive && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Inactivo</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{describe(c)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black">{formatPEN(c.price)}</span>
              <button onClick={() => edit(c)} aria-label="Editar" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => void remove(c)} aria-label="Eliminar" className="rounded-md p-2 text-muted-foreground hover:bg-danger-soft hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
