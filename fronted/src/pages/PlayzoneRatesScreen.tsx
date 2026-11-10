import { useEffect, useState } from 'react'
import { AlertCircle, Plus, Save, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { type Loose, type PlayzoneRates } from './playzone/shared'

// ============================================================
// PlayzoneRatesScreen — tiempos de juego: precio, beneficios, tolerancia y bloque extra
// ============================================================

type Row = { minutes: number; price: number; label: string; benefits?: string }

const DEFAULTS: PlayzoneRates = { durations: [], extraPerMinute: 1, freePerMinute: 0.5, companionPrice: 5, toleranceMinutes: 5, overtimeBlockMinutes: 30 }

export function PlayzoneRatesScreen() {
  const { tenantId } = useAuthStore()
  const [rates, setRates] = useState<PlayzoneRates>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await (api.playzone.rates as Loose).get({ query: { tenantId } })
        if (res.error) throw res.error
        setRates({ ...DEFAULTS, ...(res.data as { data: PlayzoneRates }).data })
      } catch (err) {
        setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudieron cargar las tarifas.') })
      } finally {
        setLoading(false)
      }
    })()
  }, [tenantId])

  const setRow = (i: number, patch: Partial<Row>) =>
    setRates((r) => ({ ...r, durations: r.durations.map((d, k) => (k === i ? { ...d, ...patch } : d)) }))

  const addRow = () => setRates((r) => ({ ...r, durations: [...r.durations, { minutes: 30, price: 0, label: 'Nuevo tiempo' }] }))
  const removeRow = (i: number) => setRates((r) => ({ ...r, durations: r.durations.filter((_, k) => k !== i) }))

  const save = async () => {
    setMessage(null)
    const minutes = rates.durations.map((d) => d.minutes)
    if (rates.durations.length === 0) return setMessage({ type: 'error', text: 'Agrega al menos un tiempo.' })
    if (new Set(minutes).size !== minutes.length) return setMessage({ type: 'error', text: 'Hay tiempos con los mismos minutos.' })
    if (rates.durations.some((d) => !d.label.trim() || !(d.minutes > 0) || d.price < 0)) return setMessage({ type: 'error', text: 'Revisa los nombres, minutos y precios.' })
    setSaving(true)
    try {
      const body = {
        tenantId,
        durations: rates.durations.map((d) => ({ minutes: d.minutes, price: d.price, label: d.label.trim(), ...(d.benefits?.trim() ? { benefits: d.benefits.trim() } : {}) })),
        extraPerMinute: rates.extraPerMinute,
        freePerMinute: rates.freePerMinute,
        companionPrice: rates.companionPrice ?? 5,
        wristbandEnabled: rates.wristbandEnabled !== false,
        toleranceMinutes: rates.toleranceMinutes ?? 5,
        overtimeBlockMinutes: rates.overtimeBlockMinutes ?? 30,
      }
      const res = await (api.playzone.rates as Loose).put(body)
      if (res.error) throw res.error
      setMessage({ type: 'success', text: 'Tarifas guardadas. Las cajas las toman al recargar la pantalla de Juegos.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'No se pudieron guardar las tarifas.') })
    } finally {
      setSaving(false)
    }
  }

  const num = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Tiempos de juego: precios, beneficios, tolerancia y tiempo extra</p>
        <Button onClick={save} disabled={saving || loading}>
          <Save className="mr-2 h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </header>

      {message && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive'}`}>
          <AlertCircle className="h-4 w-4" /> {message.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <Card className="rounded-xl border-border bg-background">
            <CardHeader><CardTitle className="text-base">Tiempos y precios</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {rates.durations.map((d, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-3 rounded-lg border border-border bg-muted p-3">
                  <div className="col-span-12 space-y-1 md:col-span-3">
                    <Label className="text-xs text-muted-foreground">Nombre</Label>
                    <Input value={d.label} maxLength={30} onChange={(e) => setRow(i, { label: e.target.value })} />
                  </div>
                  <div className="col-span-6 space-y-1 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Minutos</Label>
                    <Input type="number" min={1} value={d.minutes} onChange={(e) => setRow(i, { minutes: Math.max(0, Math.trunc(num(e.target.value))) })} />
                  </div>
                  <div className="col-span-6 space-y-1 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Precio S/</Label>
                    <Input type="number" min={0} step="0.5" value={d.price} onChange={(e) => setRow(i, { price: num(e.target.value) })} />
                  </div>
                  <div className="col-span-10 space-y-1 md:col-span-4">
                    <Label className="text-xs text-muted-foreground">Beneficios que incluye</Label>
                    <Input value={d.benefits ?? ''} maxLength={300} placeholder="Ej.: incluye 1 bebida" onChange={(e) => setRow(i, { benefits: e.target.value })} />
                  </div>
                  <div className="col-span-2 flex justify-end md:col-span-1">
                    <button type="button" onClick={() => removeRow(i)} aria-label="Quitar tiempo" className="rounded-md p-2 text-muted-foreground hover:bg-danger-soft hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addRow}><Plus className="mr-2 h-4 w-4" /> Agregar tiempo</Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border bg-background">
            <CardHeader><CardTitle className="text-base">Tiempo extra</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Al terminar el tiempo hay una tolerancia sin cobro. Pasada la tolerancia se suma un bloque extra "de frente" que se cobra al finalizar; si ese bloque también se agota sin finalizar, se suma otro.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tolerancia (minutos)</Label>
                  <Input type="number" min={0} max={60} value={rates.toleranceMinutes ?? 5} onChange={(e) => setRates((r) => ({ ...r, toleranceMinutes: Math.max(0, Math.trunc(num(e.target.value))) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Bloque extra (se cobra con el precio de este tiempo)</Label>
                  <select
                    value={rates.overtimeBlockMinutes ?? 30}
                    onChange={(e) => setRates((r) => ({ ...r, overtimeBlockMinutes: Number(e.target.value) }))}
                    className="h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                  >
                    {rates.durations.map((d) => <option key={d.minutes} value={d.minutes}>{d.label} ({d.minutes} min · S/ {d.price})</option>)}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border bg-background">
            <CardHeader><CardTitle className="text-base">Otros precios</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tiempo libre: S/ por minuto</Label>
                <Input type="number" min={0} step="0.1" value={rates.freePerMinute} onChange={(e) => setRates((r) => ({ ...r, freePerMinute: num(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Acompañante adicional: S/</Label>
                <Input type="number" min={0} step="0.5" value={rates.companionPrice ?? 5} onChange={(e) => setRates((r) => ({ ...r, companionPrice: num(e.target.value) }))} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
