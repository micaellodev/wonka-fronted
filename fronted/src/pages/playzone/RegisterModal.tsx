// Registro de cliente nuevo: primero el apoderado (DNI → nombre por RENIEC, celular obligatorio) y luego uno o varios niños.
import { useState } from 'react'
import { Plus, Trash2, Loader2, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { GenderButtons } from './GenderButtons'
import { SectionLabel, type Guardian, type Loose } from './shared'

interface KidForm { key: number; dni: string; name: string; age: string; gender: 'M' | 'F' | ''; looking: boolean }
const newKid = (key: number): KidForm => ({ key, dni: '', name: '', age: '', gender: '', looking: false })
const field = 'w-full bg-background border border-border focus:border-brand-500 rounded-sm px-3 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none'

// RENIEC devuelve "APELLIDOS, NOMBRES": sin la coma
const noCommas = (s: string) => s.replace(/,/g, '').replace(/ {2,}/g, ' ')

export function RegisterModal({ open, initialDni, tenantId, onClose, onDone }: {
  open: boolean
  initialDni: string
  tenantId: string
  onClose: () => void
  onDone: (g: Guardian) => void
}) {
  // El padre monta el modal con key distinta en cada apertura, así el estado empieza limpio.
  const [dni, setDni] = useState(initialDni.replace(/\D/g, '').slice(0, 8))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [looking, setLooking] = useState(false)
  const [kids, setKids] = useState<KidForm[]>([newKid(0)])
  const [nextKey, setNextKey] = useState(1)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const patchKid = (key: number, p: Partial<KidForm>) => setKids((ks) => ks.map((k) => (k.key === key ? { ...k, ...p } : k)))

  // RENIEC vía APISPeru: con 8 dígitos trae el nombre completo; si falla se escribe a mano.
  const lookup = async (value: string, set: (n: string) => void, busy: (b: boolean) => void) => {
    busy(true)
    try {
      const { data, error } = await api.apisperu.dni({ dni: value }).get({ query: { tenantId } })
      if (error) throw error
      const full = (data?.data as { nombre_completo?: string } | undefined)?.nombre_completo
      if (full) set(noCommas(full))
      else toast.error('RENIEC no devolvió el nombre. Escríbelo a mano.')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo consultar RENIEC. Escribe el nombre a mano.'))
    } finally { busy(false) }
  }

  const onGuardianDni = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8)
    setDni(d)
    if (d.length === 8) void lookup(d, setName, setLooking)
  }
  const onKidDni = (key: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8)
    patchKid(key, { dni: d })
    if (d.length === 8) void lookup(d, (n) => patchKid(key, { name: n }), (b) => patchKid(key, { looking: b }))
  }

  const dniBad = dni.length !== 8
  const nameBad = name.trim().length < 2
  const phoneBad = phone.length !== 9
  // Tras intentar guardar, los datos obligatorios del apoderado que faltan se marcan en rojo
  const red = (bad: boolean) => (submitted && bad ? ' border-red-500 focus:border-red-500 ring-1 ring-red-500' : '')

  const save = async () => {
    if (saving) return
    setSubmitted(true)
    if (dniBad || nameBad || phoneBad) {
      toast.error('Completa los datos obligatorios del apoderado: DNI (8 dígitos), nombre y celular (9 dígitos).')
      return
    }
    if (kids.some((k) => !k.name.trim())) {
      toast.error('Escribe el nombre de cada niño.')
      return
    }
    for (const k of kids) {
      if (k.age && (!Number.isInteger(Number(k.age)) || Number(k.age) < 1 || Number(k.age) > 17)) {
        toast.error('La edad del niño debe estar entre 1 y 17.')
        return
      }
    }
    setSaving(true)
    try {
      const [first, ...rest] = kids
      const res = await (api.playzone.guardians as Loose).post({
        tenantId, dni, fullName: name.trim(), phone, childName: first!.name.trim(),
        ...(first!.dni ? { childDni: first!.dni } : {}),
        ...(first!.age ? { childAge: parseInt(first!.age) } : {}),
        ...(first!.gender ? { childGender: first!.gender } : {}),
      })
      if (res.error) throw res.error
      const guardian: Guardian = (res.data as Loose).data
      const failed: string[] = []
      for (const k of rest) {
        const r = await (api.playzone.guardians as Loose)({ id: guardian.id }).children.post({
          tenantId, guardianId: guardian.id, fullName: k.name.trim(),
          ...(k.dni ? { dni: k.dni } : {}),
          ...(k.age ? { age: parseInt(k.age) } : {}),
          ...(k.gender ? { gender: k.gender } : {}),
        })
        if (r.error) failed.push(k.name.trim())
        else guardian.children = [...guardian.children, (r.data as Loose).data]
      }
      if (failed.length) toast.error(`Apoderado guardado, pero no se pudo registrar: ${failed.join(', ')}. Agrégalos desde la ficha.`)
      onDone(guardian)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Error al registrar.'))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent size="xl" className="gap-4 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Cliente nuevo</DialogTitle>
          <DialogDescription>Primero el apoderado, luego los niños que van a jugar.</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2 rounded-sm border-2 border-border bg-muted p-3">
          <SectionLabel className="mb-0">1. Apoderado</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={dni} onChange={(e) => onGuardianDni(e.target.value)} inputMode="numeric" maxLength={8}
              placeholder="DNI (8 dígitos) *" className={`${field} font-mono${red(dniBad)}`} />
            <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" maxLength={9}
              placeholder="Celular (9 dígitos) *" className={`${field} font-mono${red(phoneBad)}`} />
          </div>
          <div className="relative">
            <Input value={name} onChange={(e) => setName(noCommas(e.target.value))} placeholder="Nombre completo (se completa con el DNI) *" className={`${field}${red(nameBad)}`} />
            {looking && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-label="Consultando RENIEC" />}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel className="mb-0">2. Niños ({kids.length})</SectionLabel>
          {kids.map((k, i) => (
            <div key={k.key} className="flex flex-col gap-2 rounded-sm border-2 border-brand-800 bg-muted p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-brand-500">Niño {i + 1}</span>
                {kids.length > 1 && (
                  <button type="button" aria-label={`Quitar niño ${i + 1}`} onClick={() => setKids((ks) => ks.filter((x) => x.key !== k.key))}
                    className="text-muted-foreground hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <Input value={k.dni} onChange={(e) => onKidDni(k.key, e.target.value)} inputMode="numeric" maxLength={8}
                  placeholder="DNI (opcional)" className={`${field} font-mono`} />
                <div className="relative">
                  <Input value={k.name} onChange={(e) => patchKid(k.key, { name: noCommas(e.target.value) })} placeholder="Nombre completo *" className={field} />
                  {k.looking && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-label="Consultando RENIEC" />}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <Input type="number" min={1} max={17} value={k.age} onChange={(e) => patchKid(k.key, { age: e.target.value })} placeholder="Edad" className={field} />
                <GenderButtons value={k.gender} onChange={(g) => patchKid(k.key, { gender: g })} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => { setKids((ks) => [...ks, newKid(nextKey)]); setNextKey((n) => n + 1) }}
            className="flex items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:border-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" /> Agregar otro niño
          </button>
        </section>

        <button onClick={save} disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-brand-600 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
          <UserPlus className="h-5 w-5" /> {saving ? 'Guardando...' : 'Guardar y elegir niño'}
        </button>
      </DialogContent>
    </Dialog>
  )
}
