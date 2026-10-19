// Búsqueda local por código de pulsera (3 dígitos). Extraído de PlayZoneScreen sin cambios de comportamiento.
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { type ActiveSession, type DurationOpt, SectionLabel, SessionCard } from './shared'

export function WristbandSearch({ codeSearch, setCodeSearch, codeResult, codeSearching, onSearch, onCheckout, checkingOut, nowTick, durationOptions }: {
 codeSearch: string
 setCodeSearch: (v: string) => void
 codeResult: ActiveSession | 'not_found' | null
 codeSearching: boolean
 onSearch: () => void
 onCheckout: (sessionId: string) => void
 checkingOut: string | null
 nowTick: number
 durationOptions: DurationOpt[]
}) {
 return (
 <div className="mt-auto p-4 border-t border-border bg-background">
 <SectionLabel>Código de Pulsera (Búsqueda local)</SectionLabel>
 <div className="flex gap-2">
 <Input type="text" inputMode="numeric" maxLength={3}
 value={codeSearch}
 onChange={e => setCodeSearch(e.target.value.replace(/\D/g, '').slice(0, 3))}
 onKeyDown={e => e.key === 'Enter' && onSearch()}
 placeholder="···"
 className="flex-1 bg-muted border-2 border-border focus:border-primary rounded-sm px-3 py-2 text-xl font-black text-foreground font-mono text-center tracking-[0.6rem] placeholder:text-foreground focus:outline-none" />
 <button onClick={onSearch} disabled={!codeSearch || codeSearching}
 className="px-3 bg-muted border border-border hover:bg-border text-foreground font-bold text-xs uppercase tracking-widest rounded-sm disabled:opacity-40 transition-none">
 {codeSearching ? '...' : <Search className="w-4 h-4" />}
 </button>
 </div>
 {codeResult && codeResult !== 'not_found' && (
 <div className="mt-3">
 <SessionCard session={codeResult as ActiveSession} onCheckout={onCheckout}
 checking={checkingOut === (codeResult as ActiveSession).id} nowTick={nowTick} durationOptions={durationOptions} />
 </div>
 )}
 {codeResult === 'not_found' && codeSearch.length === 3 && (
 <p className="mt-2 text-xs font-bold text-brand-500 text-center border border-primary bg-brand-600/10 rounded-sm py-1.5 uppercase tracking-widest">
 Código incorrecto o inactivo
 </p>
 )}
 </div>
 )
}
