import { useEffect, useState, useCallback } from 'react'
import { Plus, PartyPopper, Calendar, Users, Search, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { apiErrorMessage as getApiErrorMessage } from '@/lib/api-error'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
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
 notes
 })
 if (!res.error) {
 setShowCreate(false)
 fetchReservations()
 setGuardian(null); setDate(''); setGuestCount(10); setNotes(''); setSearchQ('')
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
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Cantidad de Niños (Invitados)</Label>
 <Input type="number" min="1" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground" />
 </div>
 <div>
 <Label className="text-xs font-bold text-muted-foreground uppercase">Notas Adicionales</Label>
 <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-background border border-border rounded-sm px-3 py-2 text-foreground" />
 </div>
 <button onClick={handleCreate} disabled={!date || creating} className="w-full mt-2 py-3 bg-brand-600 hover:bg-brand-500 text-primary-foreground font-black text-sm uppercase tracking-widest rounded-sm disabled:opacity-50">
 {creating ? 'Guardando...' : 'Confirmar Reserva'}
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

