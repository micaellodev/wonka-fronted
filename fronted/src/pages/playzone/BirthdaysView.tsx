import { useEffect, useState, useCallback } from 'react'
import { Plus, PartyPopper, Calendar, Users, Search, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { apiErrorMessage as getApiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { formatPEN } from '@/lib/format'
import { usePlayzoneTicketStore, type PlayzoneCharge } from '@/store/playzoneTicketStore'
import { Label } from '@/components/ui/label'
import { type Loose, SectionLabel } from './shared'

// ── Birthdays View ─────────────────────────────────────────────

export function BirthdaysView() {
 const { tenantId } = useAuthStore()
 const [reservations, setReservations] = useState<Loose[]>([])
 const [loading, setLoading] = useState(true)
 const [selectedResId, setSelectedResId] = useState<string | null>(null)
 const [details, setDetails] = useState<Loose>(null)

 // Create form
 const [showCreate, setShowCreate] = useState(false)
 const [searchQ, setSearchQ] = useState('')
 const [guardian, setGuardian] = useState<Loose>(null)
 const [date, setDate] = useState('')
 const [guestCount, setGuestCount] = useState(10)
 const [notes, setNotes] = useState('')
 const [creating, setCreating] = useState(false)
 const addCharge = usePlayzoneTicketStore((s) => s.addCharge)

 // Plan, extras y precio (el precio cambia según la fecha de la reserva)
 const [plans, setPlans] = useState<Plan[]>([])
 const [planId, setPlanId] = useState('')
 const [extras, setExtras] = useState<Record<string, number>>({})
 const [quote, setQuote] = useState<Quote | null>(null)
 // Modificar una reserva existente
 const [editing, setEditing] = useState(false)
 const [editDate, setEditDate] = useState('')
 const [editGuests, setEditGuests] = useState(10)
 const [editExtras, setEditExtras] = useState<Record<string, number>>({})
 const [editQuote, setEditQuote] = useState<Quote | null>(null)
 const [saving, setSaving] = useState(false)

 useEffect(() => {
 (async () => {
 try {
 const res = await (api.birthdays as Loose).plans.get({ query: { tenantId, active: 'true' } })
 if (!res.error) setPlans((res.data as Loose).data ?? [])
 } catch { /* sin planes: la reserva funciona como antes */ }
 })()
 }, [tenantId])

 const toList = (m: Record<string, number>) => Object.entries(m).filter(([, q]) => q > 0).map(([name, qty]) => ({ name, qty }))
 const fetchQuote = useCallback(async (pid: string, d: string, guests: number, ex: Record<string, number>, set: (q: Quote | null) => void) => {
 if (!pid || !d || !(guests >= 1)) return set(null)
 try {
 const res = await (api.birthdays as Loose).quote.post({ tenantId, planId: pid, date: d, guestCount: guests, extras: toList(ex) })
 set(res.error ? null : (res.data as Loose).data)
 } catch { set(null) }
 }, [tenantId])
 useEffect(() => { const t = setTimeout(() => void fetchQuote(planId, date, guestCount, extras, setQuote), 250); return () => clearTimeout(t) }, [planId, date, guestCount, extras, fetchQuote])
 useEffect(() => {
 if (!editing || !details?.planId) { setEditQuote(null); return }
 const t = setTimeout(() => void fetchQuote(details.planId, editDate, editGuests, editExtras, setEditQuote), 250)
 return () => clearTimeout(t)
 }, [editing, details?.planId, editDate, editGuests, editExtras, fetchQuote])

 const pushCharge = (charge: PlayzoneCharge | null | undefined) => {
 if (!charge) return
 addCharge(charge)
 toast.success(`Agregado al carrito: ${formatPEN(charge.amount)}`)
 }
 const startEdit = () => {
 setEditing(true)
 setEditDate(String(details.date).slice(0, 10))
 setEditGuests(details.guestCount)
 setEditExtras(Object.fromEntries(((details.extras ?? []) as Array<{ name: string; qty: number }>).map((e) => [e.name, e.qty])))
 }
 const saveEdit = async () => {
 setSaving(true)
 try {
 const res = await (api.birthdays as Loose)({ id: selectedResId }).patch({ tenantId, date: new Date(editDate).toISOString(), guestCount: editGuests, ...(details.planId ? { planId: details.planId, extras: toList(editExtras) } : {}) })
 if (res.error) { toast.error(getApiErrorMessage(res.error, 'No se pudo modificar la reserva')); return }
 const charge = (res.data as Loose).data?.charge as PlayzoneCharge | null
 // Si la reserva ya estaba en el carrito, se actualiza con el precio nuevo
 if (charge && usePlayzoneTicketStore.getState().charges.some((c) => c.id === charge.sku)) addCharge(charge)
 setEditing(false)
 fetchDetails(selectedResId!)
 fetchReservations()
 } catch { toast.error('Error de conexión') } finally { setSaving(false) }
 }

 const fetchReservations = useCallback(async () => {
 setLoading(true)
 try {
 const res = await (api.birthdays as Loose).get({ query: { tenantId } })
 if (!res.error) setReservations((res.data as Loose).data ?? [])
 } finally { setLoading(false) }
 }, [tenantId])

 useEffect(() => { fetchReservations() }, [fetchReservations])

 const fetchDetails = async (id: string) => {
 try {
 const res = await (api.birthdays as Loose)({ id }).get({ query: { tenantId } })
 if (!res.error) setDetails((res.data as Loose).data)
 else toast.error(getApiErrorMessage(res.error, 'Error al cargar detalles'))
 } catch { toast.error('Error al cargar detalles') }
 }

 const handleSearchGuardian = async () => {
 if (!searchQ) return
 try {
 const res = await (api.playzone.guardians.lookup as Loose).get({ query: { tenantId, q: searchQ } })
 if (!res.error && (res.data as Loose).found) setGuardian((res.data as Loose).data)
 else { setGuardian(null); toast.error('Apoderado no encontrado') }
 } catch { toast.error('Error de conexión') }
 }

 const handleCreate = async () => {
 if (!guardian || !date) return
 if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 300) {
 toast.error('La cantidad de invitados debe estar entre 1 y 300.')
 return
 }
 setCreating(true)
 try {
 const res = await (api.birthdays as Loose).post({
 tenantId,
 guardianId: guardian.id,
 date: new Date(date).toISOString(),
 guestCount,
 notes,
 ...(planId ? { planId, extras: toList(extras) } : {})
 })
 if (!res.error) {
 pushCharge((res.data as Loose).data?.charge as PlayzoneCharge | null)
 setShowCreate(false)
 fetchReservations()
 setGuardian(null); setDate(''); setGuestCount(10); setNotes(''); setSearchQ(''); setPlanId(''); setExtras({}); setQuote(null)
 } else toast.error(getApiErrorMessage(res.error, 'Error al crear reserva'))
 } catch { toast.error('Error de conexión') }
 finally { setCreating(false) }
 }

 const handleUpdateGuest = async (guestId: string, data: Loose) => {
 if (!selectedResId) return
 try {
 const res = await (api.birthdays as Loose)({ id: selectedResId }).guests({ guestId }).patch(data, { query: { tenantId } })
 if (res.error) toast.error(getApiErrorMessage(res.error, 'Error al actualizar invitado'))
 fetchDetails(selectedResId)
 } catch { toast.error('Error al actualizar invitado') }
 }

 return (
 <div className="flex flex-1 flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-background">
 {/* List Panel */}
 <div className="w-full lg:w-[320px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-background flex flex-col max-h-72 lg:max-h-none">
 <div className="p-3 border-b border-border bg-muted">
 <button onClick={() => { setShowCreate(true); setSelectedResId(null) }}
 className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 text-primary-foreground font-black text-xs uppercase tracking-widest rounded-sm">
 <Plus className="w-4 h-4" /> Nueva Reserva
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
 <SectionLabel>Próximos Cumpleaños</SectionLabel>
 {loading ? <p className="text-muted-foreground text-xs">Cargando...</p> :
 reservations.map(r => (
 <button key={r.id} onClick={() => { setSelectedResId(r.id); fetchDetails(r.id); setShowCreate(false) }}
 className={`flex flex-col text-left p-3 rounded-sm border-2 transition-colors ${selectedResId === r.id ? 'border-brand-500 bg-brand-900/20' : 'border-border bg-muted hover:border-border'}`}>
 <div className="flex items-center gap-2 text-foreground font-bold text-sm">
 <PartyPopper className="w-4 h-4 text-brand-500" />
 {new Date(r.date).toLocaleDateString('es-PE', { timeZone: 'UTC' })}
 </div>
 <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
 <span>{r.guardian.fullName}</span>
 <span className="flex items-center gap-1 font-mono text-brand-400">
 <Users className="w-3 h-3" /> {r.guestCount}
 </span>
 </div>
 {r.totalPrice > 0 && (
 <div className="mt-1 flex items-center justify-between text-xs">
 <span className="truncate text-muted-foreground">{r.planName}</span>
 <span className={`font-mono font-bold ${r.paid ? 'text-success' : 'text-warning'}`}>{formatPEN(r.totalPrice)} · {r.paid ? 'Pagado' : 'Por cobrar'}</span>
 </div>
 )}
 </button>
 ))
 }
 </div>
 </div>

 {/* Details / Create Panel */}
 <div className="flex-1 overflow-y-auto bg-background">
 {showCreate && (
 <div className="max-w-xl mx-auto p-8 flex flex-col gap-4">
 <h2 className="text-xl font-black text-foreground uppercase tracking-wider mb-2 border-b border-border pb-2">Crear Reserva de Cumpleaños</h2>

 <div className="bg-muted p-4 rounded-sm border border-border">
 <SectionLabel>1. Buscar Apoderado</SectionLabel>
 <div className="flex gap-2">
 <Input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="DNI apoderado" className="flex-1 bg-background border border-border rounded-sm px-3 py-2 text-foreground" />
 <button onClick={handleSearchGuardian} className="px-4 bg-muted text-foreground rounded-sm font-bold text-xs uppercase"><Search className="w-4 h-4" /></button>
 </div>
 {guardian && (
 <div className="mt-3 p-3 bg-background border border-secondary-200 rounded-sm">
 <p className="text-sm font-bold text-foreground">{guardian.fullName}</p>
 <p className="text-xs text-muted-foreground font-mono">DNI: {guardian.dni} | Niños: {guardian.children?.length}</p>
 </div>
 )}
 </div>

 {guardian && (
 <div className="bg-muted p-4 rounded-sm border border-border flex flex-col gap-3">
 <SectionLabel>2. Detalles de Reserva</SectionLabel>
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Fecha</Label>
 <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground scheme-dark" />
 </div>
 <PlanFields plans={plans} planId={planId} setPlanId={(id) => { setPlanId(id); const p = plans.find((x) => x.id === id); if (p) setGuestCount(p.includedGuests); setExtras({}) }}
 guestCount={guestCount} setGuestCount={setGuestCount} extras={extras} setExtras={setExtras} quote={quote} />
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Notas Adicionales</Label>
 <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground" />
 </div>
 <button onClick={handleCreate} disabled={!date || creating} className="w-full mt-2 py-3 bg-brand-600 hover:bg-brand-500 text-primary-foreground font-black text-sm uppercase tracking-widest rounded-sm disabled:opacity-50">
 {creating ? 'Guardando...' : planId && quote ? `Reservar y agregar al carrito · ${formatPEN(quote.total)}` : 'Confirmar Reserva'}
 </button>
 </div>
 )}
 </div>
 )}

 {!showCreate && !selectedResId && (
 <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
 <PartyPopper className="w-16 h-16 opacity-20 mb-4" />
 <p className="font-bold uppercase tracking-widest">Selecciona una reserva para ver detalles</p>
 </div>
 )}

 {!showCreate && selectedResId && details && (
 <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6">
 {/* Header Details */}
 <div className="bg-muted border-2 border-brand-800 rounded-sm p-5 flex items-start justify-between">
 <div>
 <h2 className="text-2xl font-black text-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
 <Calendar className="w-6 h-6 text-brand-500" />
 {new Date(details.date).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
 </h2>
 <p className="text-muted-foreground text-sm">
 Reserva por <strong className="text-foreground">{details.guardian.fullName}</strong> (DNI: {details.guardian.dni})
 </p>
 {details.notes && (
 <p className="mt-3 text-sm text-muted-foreground bg-background border border-border p-3 rounded-sm">
 <em>"{details.notes}"</em>
 </p>
 )}
 </div>
 <div className="bg-background border border-brand-500/30 px-4 py-2 rounded-sm text-center">
 <span className="block text-[11px] font-black uppercase text-muted-foreground tracking-widest">Total Invitados</span>
 <span className="text-3xl font-black text-brand-500">{details.guestCount}</span>
 <span className="block text-xs font-bold text-secondary-500 mt-1">
 {details.guests.filter((g: Loose) => g.attended).length} asistieron
 </span>
 </div>
 </div>

 {/* Plan, precio y cobro */}
 {details.planName && (
 <div className="bg-muted border border-border rounded-sm p-5 flex flex-col gap-3">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <SectionLabel className="text-brand-500">Plan: {details.planName}</SectionLabel>
 <p className="text-xs text-muted-foreground">{details.priceBreakdown?.dayKind === 'saturday' ? 'Precio de sábado' : details.priceBreakdown?.dayKind === 'sunday' ? 'Precio de domingo / feriado' : 'Precio de lunes a viernes'}{details.priceBreakdown?.extraGuests > 0 ? ` · ${details.priceBreakdown.extraGuests} niño(s) adicional(es)` : ''}</p>
 </div>
 <div className="text-right">
 <span className="block text-2xl font-black font-mono text-foreground">{formatPEN(details.totalPrice ?? 0)}</span>
 <span className={`text-xs font-bold ${details.paid ? 'text-success' : 'text-warning'}`}>{details.paid ? 'Pagado' : 'Por cobrar'}</span>
 </div>
 </div>
 {details.priceBreakdown && (
 <ul className="text-xs text-muted-foreground space-y-0.5">
 <li>Plan base: {formatPEN(details.priceBreakdown.basePrice)}</li>
 {details.priceBreakdown.extraGuests > 0 && <li>Niños adicionales ({details.priceBreakdown.extraGuests}): {formatPEN(details.priceBreakdown.extraGuestsAmount)}</li>}
 {(details.priceBreakdown.extras ?? []).map((e: Loose) => <li key={e.name}>{e.name} × {e.qty}: {formatPEN(e.amount)}</li>)}
 </ul>
 )}
 {!details.paid && !editing && (
 <div className="flex flex-wrap gap-2">
 {details.charge && <button onClick={() => pushCharge(details.charge)} className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-primary-foreground font-black text-xs uppercase tracking-widest rounded-sm">Agregar al carrito</button>}
 <button onClick={startEdit} className="px-4 py-2 border border-border bg-background text-foreground font-bold text-xs uppercase tracking-widest rounded-sm">Modificar fecha / niños / extras</button>
 </div>
 )}
 {editing && (
 <div className="flex flex-col gap-3 border-t border-border pt-3">
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Nueva fecha</Label>
 <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground scheme-dark" />
 </div>
 <PlanFields plans={plans.filter((p) => p.id === details.planId)} planId={details.planId} setPlanId={() => {}} guestCount={editGuests} setGuestCount={setEditGuests} extras={editExtras} setExtras={setEditExtras} quote={editQuote} fixedPlan />
 <div className="flex gap-2">
 <button onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-primary-foreground font-black text-xs uppercase tracking-widest rounded-sm disabled:opacity-50">{saving ? 'Guardando...' : `Guardar${editQuote ? ` · ${formatPEN(editQuote.total)}` : ''}`}</button>
 <button onClick={() => setEditing(false)} className="px-4 py-2 border border-border bg-background text-foreground font-bold text-xs uppercase tracking-widest rounded-sm">Cancelar</button>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Guest List */}
 <div>
 <SectionLabel className="mb-3 text-brand-500">Lista de Invitados ({details.guestCount})</SectionLabel>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {details.guests.map((guest: Loose, idx: number) => {
 return (
 <div key={guest.id} className={`flex items-center gap-3 p-3 rounded-sm border ${guest.attended ? 'bg-secondary-50 border-secondary-200' : 'bg-muted border-border'}`}>
 <div className="w-6 font-mono text-xs text-muted-foreground font-bold text-center">{idx + 1}</div>
 <div className="flex-1 grid grid-cols-2 gap-2">
 <Input
 className="bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-foreground focus:border-brand-500 placeholder:text-muted-foreground"
 placeholder="Nombre"
 defaultValue={guest.firstName}
 onBlur={e => e.target.value !== guest.firstName && handleUpdateGuest(guest.id, { firstName: e.target.value })}
 />
 <Input
 className="bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-foreground focus:border-brand-500 placeholder:text-muted-foreground"
 placeholder="Apellido"
 defaultValue={guest.lastName}
 onBlur={e => e.target.value !== guest.lastName && handleUpdateGuest(guest.id, { lastName: e.target.value })}
 />
 </div>
 <button
 onClick={() => handleUpdateGuest(guest.id, { attended: !guest.attended })}
 className={`w-10 h-10 flex items-center justify-center shrink-0 rounded-sm border-2 ${guest.attended ? 'bg-success border-success text-success-foreground' : 'bg-background border-border text-muted-foreground hover:text-foreground'}`}
 >
 <CheckCircle2 className="w-5 h-5" />
 </button>
 </div>
 )
 })}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 )
}

// ── Plan, niños y extras con el precio calculado por el servidor ─────────────

export interface Plan { id: string; name: string; description: string | null; benefits: string | null; includedGuests: number; extraGuestPrice: number; priceWeekday: number; priceSaturday: number; priceSunday: number; extras: Array<{ name: string; price: number }> }
export interface Quote { dayKind: 'weekday' | 'saturday' | 'sunday'; basePrice: number; extraGuests: number; extraGuestsAmount: number; extras: Array<{ name: string; qty: number; amount: number }>; total: number }

function PlanFields({ plans, planId, setPlanId, guestCount, setGuestCount, extras, setExtras, quote, fixedPlan }: {
 plans: Plan[]; planId: string; setPlanId: (id: string) => void; guestCount: number; setGuestCount: (n: number) => void
 extras: Record<string, number>; setExtras: (m: Record<string, number>) => void; quote: Quote | null; fixedPlan?: boolean
}) {
 const plan = plans.find((p) => p.id === planId)
 return (
 <div className="flex flex-col gap-3">
 {plans.length > 0 && !fixedPlan && (
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Plan</Label>
 <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground">
 <option value="">Sin plan (solo reservar la fecha)</option>
 {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
 </select>
 </div>
 )}
 {plan?.benefits && (
 <ul className="list-disc pl-5 text-xs text-muted-foreground">
 {plan.benefits.split('\n').filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
 </ul>
 )}
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Cantidad de Niños (Invitados){plan ? ` · ${plan.includedGuests} incluidos, extra ${formatPEN(plan.extraGuestPrice)} c/u` : ''}</Label>
 <Input type="number" min="1" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground" />
 </div>
 {plan && plan.extras.length > 0 && (
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Extras</Label>
 <div className="mt-1 flex flex-col gap-1.5">
 {plan.extras.map((x) => (
 <label key={x.name} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2 text-sm">
 <span>{x.name} <span className="font-mono text-xs text-muted-foreground">{formatPEN(x.price)}</span></span>
 <input type="number" min="0" max="50" value={extras[x.name] ?? 0} onChange={(e) => setExtras({ ...extras, [x.name]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="w-16 rounded border border-border bg-muted px-2 py-1 text-right text-foreground" aria-label={`Cantidad de ${x.name}`} />
 </label>
 ))}
 </div>
 </div>
 )}
 {plan && quote && (
 <div className="rounded-sm border border-brand-500/40 bg-background p-3 text-sm">
 <p className="font-bold text-foreground">Total: {formatPEN(quote.total)}</p>
 <p className="text-xs text-muted-foreground">{quote.dayKind === 'saturday' ? 'Sábado' : quote.dayKind === 'sunday' ? 'Domingo / feriado' : 'Lunes a viernes'}: {formatPEN(quote.basePrice)}{quote.extraGuests > 0 ? ` + ${quote.extraGuests} niño(s) adicional(es) ${formatPEN(quote.extraGuestsAmount)}` : ''}{quote.extras.map((e) => ` + ${e.name} ×${e.qty} ${formatPEN(e.amount)}`).join('')}</p>
 </div>
 )}
 {plan && !quote && <p className="text-xs text-muted-foreground">Elige la fecha para ver el precio.</p>}
 </div>
 )
}
