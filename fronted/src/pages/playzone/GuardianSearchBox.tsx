// Buscador de apoderado por DNI con sugerencias mientras se escribe.
import { useEffect, useState } from 'react'
import { Search, Baby } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { type Guardian, type Loose, SectionLabel } from './shared'

const MIN_CHARS = 3
const isDni = (v: string) => /^\d+$/.test(v)
const MAX_SUGGESTIONS = 6

function Highlight({ text, match }: { text: string; match: string }) {
 const i = text.indexOf(match)
 if (i < 0) return <>{text}</>
 return <>{text.slice(0, i)}<strong className="text-foreground">{match}</strong>{text.slice(i + match.length)}</>
}

export function GuardianSearchBox({ tenantId, value, onChange, onPick, onSubmit, searching, error }: {
 tenantId: string
 value: string
 onChange: (v: string) => void
 onPick: (g: Guardian) => void
 /** Enter sin sugerencia elegida: búsqueda exacta (si no existe, abre el registro). */
 onSubmit: () => void
 searching: boolean
 error: string
}) {
 const [suggestions, setSuggestions] = useState<Guardian[]>([])
 const [open, setOpen] = useState(false)
 const [active, setActive] = useState(-1)
 const [loading, setLoading] = useState(false)

 useEffect(() => {
 if (!open || value.length < MIN_CHARS) { setSuggestions([]); return }
 let stale = false
 const t = setTimeout(async () => {
 setLoading(true)
 try {
 const res = await (api.playzone.guardians as Loose).get({ query: { tenantId, search: value, limit: MAX_SUGGESTIONS } })
 if (!stale && !res.error) { setSuggestions((res.data as { data: Guardian[] }).data ?? []); setActive(-1) }
 } catch { if (!stale) setSuggestions([]) }
 finally { if (!stale) setLoading(false) }
 }, 200)
 return () => { stale = true; clearTimeout(t) }
 }, [value, open, tenantId])

 const pick = (g: Guardian) => { setOpen(false); setSuggestions([]); onPick(g) }

 const onKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length) }
 else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1)) }
 else if (e.key === 'Escape') setOpen(false)
 else if (e.key === 'Enter') {
 e.preventDefault()
 const chosen = suggestions[active] ?? (suggestions.length === 1 ? suggestions[0] : undefined)
 if (chosen) pick(chosen); else if (isDni(value)) { setOpen(false); onSubmit() }
 }
 }

 const showList = open && value.length >= MIN_CHARS
 return (
 <div className="p-4 border-b border-border">
 <SectionLabel>¿Ya es cliente? Busca por DNI o nombre</SectionLabel>
 <div className="relative">
 <div className="flex gap-2">
 <Input
 type="text" maxLength={40}
 value={value}
 onChange={(e) => { onChange(e.target.value); setOpen(true) }}
 onKeyDown={onKeyDown}
 onBlur={() => setOpen(false)}
 autoFocus role="combobox" aria-expanded={showList} aria-autocomplete="list" aria-label="DNI o nombre del apoderado"
 placeholder="DNI o nombre"
 className="flex-1 bg-muted border-2 border-border focus:border-brand-500 rounded-sm px-3 py-2.5 text-sm font-bold text-foreground font-mono placeholder:text-muted-foreground focus:outline-none transition-colors"
 />
 <button onClick={onSubmit} disabled={searching || !isDni(value)} aria-label="Buscar apoderado"
 className="px-3 py-2.5 bg-muted hover:bg-border disabled:opacity-40 text-foreground font-bold text-xs uppercase tracking-widest rounded-sm transition-none">
 {searching ? '...' : <Search className="w-4 h-4" />}
 </button>
 </div>

 {showList && (
 <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-sm border-2 border-border bg-background shadow-xl">
 {suggestions.map((g, i) => (
 <li key={g.id} role="option" aria-selected={i === active}
 onMouseDown={(e) => { e.preventDefault(); pick(g) }}
 onMouseEnter={() => setActive(i)}
 className={`cursor-pointer border-b border-border px-3 py-2 last:border-b-0 ${i === active ? 'bg-muted' : ''}`}>
 <p className="truncate text-sm font-bold text-foreground">{g.fullName}</p>
 <p className="font-mono text-xs text-muted-foreground"><Highlight text={g.dni} match={value} /></p>
 {g.children.length > 0 && (
 <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
 <Baby className="h-3 w-3 shrink-0" /> {g.children.map((c) => c.fullName).join(', ')}
 </p>
 )}
 </li>
 ))}
 {!suggestions.length && (
 <li className="px-3 py-2 text-xs text-muted-foreground">
 {loading ? 'Buscando...' : isDni(value) ? 'Sin coincidencias. Pulsa Enter para registrar un cliente nuevo.' : 'Sin coincidencias. Prueba con el DNI.'}
 </li>
 )}
 </ul>
 )}
 </div>
 {error && <p className="mt-2 text-[11px] text-brand-500 font-bold uppercase">{error}</p>}
 </div>
 )
}
