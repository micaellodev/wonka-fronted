// ============================================================
// PinPad — Minimalist dark redesign
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { Delete, X } from 'lucide-react'

// Login PINs are 5 or 6 digits: auto-submit at 6, "Entrar" button from 5.
const DEFAULT_MAX_LENGTH = 6
const DEFAULT_MIN_LENGTH = 5

interface PinPadProps {
 onComplete: (pin: string) => void
 disabled?: boolean
 hasError?: boolean
 /** Fixed length (e.g. 6 for approval codes). Omit for a 5–6 digit PIN. */
 length?: number
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const
type KeyValue = (typeof KEYS)[number]

export function PinPad({ onComplete, disabled = false, hasError = false, length: fixedLength }: PinPadProps) {
 const length = fixedLength ?? DEFAULT_MAX_LENGTH
 const minLength = fixedLength ?? DEFAULT_MIN_LENGTH
 const [pin, setPin] = useState('')

 // Every submit clears the entry, so after a failed attempt the user retypes directly.
 // onComplete is called outside setState updaters (StrictMode runs updaters twice → double submit).
 const submit = useCallback(() => {
  if (disabled || pin.length < minLength) return
  setPin('')
  onComplete(pin)
 }, [disabled, pin, minLength, onComplete])

 const handleKey = useCallback(
  (key: KeyValue) => {
   if (disabled) return
   if (key === 'clear') { setPin(''); return }
   if (key === 'del') { setPin(pin.slice(0, -1)); return }
   if (pin.length >= length) return
   const next = pin + key
   if (next.length === length) {
    setPin('')
    onComplete(next)
   } else {
    setPin(next)
   }
  },
  [disabled, pin, length, onComplete],
 )

 useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
   if (disabled) return
   const key = event.key === 'Backspace' ? 'del' : event.key === 'Delete' || event.key === 'Escape' ? 'clear' : event.key
   if (event.key === 'Enter') {
    event.preventDefault()
    submit()
   } else if (key === 'del' || key === 'clear' || /^[0-9]$/.test(key)) {
    event.preventDefault()
    handleKey(key as KeyValue)
   }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
 }, [disabled, submit, handleKey])

 return (
 <div className="flex flex-col items-center gap-5 select-none">
 {/* PIN dots */}
 <div
 className={`flex gap-3 ${hasError ? 'animate-shake' : ''}`}
 aria-label={`PIN: ${pin.length} de ${length} dígitos`}
 role="status"
 >
 {Array.from({ length }).map((_, i) => (
 <div
 key={i}
 className={`
 w-3.5 h-3.5 rounded-full border-2 transition-all duration-200
 ${i < pin.length
 ? hasError
 ? 'bg-primary border-primary scale-110'
 : 'bg-brand-500 border-brand-500 scale-110'
 : hasError
 ? 'bg-transparent border-primary/60'
 : 'bg-transparent border-border'
 }
 `}
 />
 ))}
 </div>

 {/* Keypad */}
 <div className="grid w-full grid-cols-3 gap-2" style={{ maxWidth: '260px' }}>
 {KEYS.map((key) => {
 const isClear = key === 'clear'
 const isDel = key === 'del'
 const isSpecial = isClear || isDel

 return (
 <button
 key={key}
 onClick={() => handleKey(key)}
 disabled={disabled}
 aria-label={isClear ? 'Limpiar PIN' : isDel ? 'Borrar dígito' : `Dígito ${key}`}
 className={`
 relative flex items-center justify-center
 h-14 rounded-xl text-lg font-semibold
 transition-all duration-100 active:scale-95
 focus:outline-none
 disabled:opacity-40 disabled:cursor-not-allowed
 ${isSpecial
 ? 'bg-muted text-muted-foreground hover:bg-muted hover:text-foreground text-sm'
 : 'bg-muted text-foreground border border-border hover:bg-muted hover:border-border active:bg-border'
 }
 `}
 >
 {isClear ? <X className="w-4 h-4" /> : isDel ? <Delete className="w-4 h-4" /> : key}
 </button>
 )
 })}
 </div>

 {minLength < length && (
 <button
 type="button"
 onClick={submit}
 disabled={disabled || pin.length < minLength}
 className="h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
 style={{ maxWidth: '260px' }}
 >
 Entrar
 </button>
 )}
 </div>
 )
}
