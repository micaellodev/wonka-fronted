// Panel central: niño elegido, tarifas y botón de inicio. Extraído de PlayZoneScreen sin cambios de comportamiento.
import { Timer, Clock, XCircle, Infinity as InfinityIcon } from 'lucide-react'
import { formatPEN } from '@/lib/format'
import { type Child, type DurationOpt, fmtPrice, SectionLabel } from './shared'

export function SessionStartPanel({ selectedChild, setSelectedChild, durationOptions, selectedDuration, setSelectedDuration, starting, onStart, lastCode }: {
 selectedChild: (Child & { guardianName: string }) | null
 setSelectedChild: (c: null) => void
 durationOptions: DurationOpt[]
 selectedDuration: DurationOpt
 setSelectedDuration: (d: DurationOpt) => void
 starting: boolean
 onStart: () => void
 lastCode: { code: string; price: number | null; childName: string } | null
}) {
 return (
 <section className="flex flex-col w-full lg:w-65 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-background/60 overflow-y-auto shadow-xl z-10 relative">
 <div className="p-4 border-b border-border">
 <div className="flex items-center gap-2 text-muted-foreground">
 <Timer className="w-4 h-4" />
 <h2 className="text-xs font-black uppercase tracking-widest mt-0.5">Asignar Tiempo</h2>
 </div>
 </div>

 {!selectedChild ? (
 <div className="flex flex-col items-center justify-center flex-1 gap-3 text-foreground p-8 text-center">
 <Clock className="w-10 h-10 opacity-30" />
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-2">
 Elija al niño a la izquierda
 </p>
 </div>
 ) : (
 <div className="flex flex-col gap-4">
 {/* Selected child header */}
 <div className="px-4 py-3 bg-brand-900/30 border-b border-brand-800">
 <SectionLabel className="text-brand-500">Niño Seleccionado</SectionLabel>
 <div className="flex items-start justify-between">
 <div>
 <p className="text-sm font-black text-foreground">{selectedChild.fullName}</p>
 <p className="text-[11px] text-brand-300 font-mono mt-0.5">
 {selectedChild.age && `${selectedChild.age}A `}{selectedChild.gender} {selectedChild.dni && `· DNI: ${selectedChild.dni}`}
 </p>
 </div>
 <button onClick={() => setSelectedChild(null)} className="text-muted-foreground hover:text-foreground transition-none p-1">
 <XCircle className="w-4 h-4" />
 </button>
 </div>
 </div>

 {/* Duration picker */}
 <div className="px-4">
 <SectionLabel>Tarifas / Tiempos</SectionLabel>
 <div className="grid grid-cols-2 gap-2">
 {durationOptions.map(opt => {
 const isSel = selectedDuration.label === opt.label
 return (
 <button key={opt.label} onClick={() => setSelectedDuration(opt)}
 className={`flex flex-col items-center justify-center py-3 rounded-sm border-2 transition-none ${isSel ? 'bg-brand-600 border-brand-500 text-primary-foreground' : 'bg-muted border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
 }`}>
 <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest">
 {opt.minutes === null ? <InfinityIcon className="w-4 h-4" /> : <Clock className="w-3 h-3" />}
 {opt.label}
 </div>
 <span className={`text-[11px] font-black font-mono mt-1 ${isSel ? 'text-foreground/80' : 'text-brand-500'}`}>
 {opt.price !== null ? formatPEN(opt.price) : 'libre'}
 </span>
 </button>
 )
 })}
 </div>
 </div>

 {/* Start action */}
 <div className="px-4 pb-4">
 <button onClick={onStart} disabled={starting}
 className="flex items-center justify-center gap-2 w-full py-4 bg-brand-600 hover:bg-brand-600 disabled:opacity-40 text-primary-foreground font-black text-sm uppercase tracking-widest rounded-sm transition-none relative overflow-hidden group">
 <span className="absolute inset-0 w-full h-full bg-background/10 translate-y-full group-hover:translate-y-0 transition-transform"></span>
 <Timer className="w-5 h-5 relative z-10" />
 <span className="relative z-10">
 {starting ? 'Iniciando...' : 'INICIAR JUEGO'}
 </span>
 </button>
 </div>

 {/* Last generated code alert */}
 {lastCode && (
 <div className="mt-auto p-4 pt-6 border-t border-border bg-muted">
 <p className="text-[11px] text-secondary-500 font-black uppercase tracking-widest text-center mb-2">
 Código Generado: Escribir en pulsera
 </p>
 <div className="bg-background border-2 border-secondary-500 rounded-sm p-4 text-center shadow-inner">
 <span className="text-6xl font-black font-mono text-secondary-500 tracking-widest">
 {lastCode.code}
 </span>
 </div>
 <div className="flex items-center justify-between mt-3 text-muted-foreground">
 <span className="text-[11px] font-bold uppercase tracking-widest truncate max-w-30">{lastCode.childName}</span>
 <span className="text-sm font-black font-mono text-secondary-500">{fmtPrice(lastCode.price)}</span>
 </div>
 </div>
 )}
 </div>
 )}
 </section>
 )
}
