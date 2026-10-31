// Sexo del niño: dos botones, M celeste y F rosado. Tocar el elegido otra vez lo deja sin marcar (el dato es opcional).
type Gender = 'M' | 'F' | ''

const OPTIONS = [
 { value: 'M', name: 'Masculino', on: 'border-sky-500 bg-sky-500 text-white', off: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300' },
 { value: 'F', name: 'Femenino', on: 'border-pink-500 bg-pink-500 text-white', off: 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300' },
] as const

export function GenderButtons({ value, onChange }: { value: Gender; onChange: (v: Gender) => void }) {
 return (
 <div role="group" aria-label="Sexo del niño" className="flex gap-2">
 {OPTIONS.map((o) => (
 <button
 key={o.value}
 type="button"
 aria-pressed={value === o.value}
 aria-label={o.name}
 title={o.name}
 onClick={() => onChange(value === o.value ? '' : o.value)}
 className={`h-10 flex-1 rounded-md border-2 text-sm font-black transition-colors ${value === o.value ? o.on : o.off}`}
 >
 {o.value}
 </button>
 ))}
 </div>
 )
}
