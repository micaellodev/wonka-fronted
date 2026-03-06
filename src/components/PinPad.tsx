// ============================================================
//  PinPad — Touch-friendly 5-digit PIN entry component
// ============================================================

import { useState, useCallback } from 'react'
import { Delete, X } from 'lucide-react'

const PIN_LENGTH = 5

interface PinPadProps {
    onComplete: (pin: string) => void
    disabled?: boolean
    /** If true, shows a shake animation on the dots (for invalid PIN) */
    hasError?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const
type KeyValue = (typeof KEYS)[number]

export function PinPad({ onComplete, disabled = false, hasError = false }: PinPadProps) {
    const [pin, setPin] = useState('')

    const handleKey = useCallback(
        (key: KeyValue) => {
            if (disabled) return
            if (key === 'clear') {
                setPin('')
                return
            }
            if (key === 'del') {
                setPin((prev) => prev.slice(0, -1))
                return
            }
            setPin((prev) => {
                if (prev.length >= PIN_LENGTH) return prev
                const next = prev + key
                if (next.length === PIN_LENGTH) {
                    // Defer so state settles before calling parent
                    setTimeout(() => onComplete(next), 0)
                }
                return next
            })
        },
        [disabled, onComplete],
    )

    return (
        <div className="flex flex-col items-center gap-6 select-none">
            {/* PIN dots indicator */}
            <div
                className={`flex gap-4 ${hasError ? 'animate-shake' : ''}`}
                aria-label={`PIN entered: ${pin.length} of ${PIN_LENGTH} digits`}
                role="status"
            >
                {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                    <div
                        key={i}
                        className={`
              w-4 h-4 rounded-full border-2 transition-all duration-200
              ${i < pin.length
                                ? 'bg-brand-400 border-brand-400 scale-110'
                                : 'bg-transparent border-slate-500'
                            }
              ${hasError ? 'border-red-400 bg-red-400' : ''}
            `}
                    />
                ))}
            </div>

            {/* Keypad grid */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                {KEYS.map((key) => {
                    const isClear = key === 'clear'
                    const isDel = key === 'del'
                    const isSpecial = isClear || isDel

                    return (
                        <button
                            key={key}
                            onClick={() => handleKey(key)}
                            disabled={disabled}
                            aria-label={isClear ? 'Clear PIN' : isDel ? 'Delete last digit' : `Digit ${key}`}
                            className={`
                relative flex items-center justify-center
                h-16 rounded-2xl text-xl font-semibold
                transition-all duration-150 active:scale-95
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isSpecial
                                    ? 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80 text-sm'
                                    : 'bg-slate-700/80 text-white hover:bg-brand-700/70 active:bg-brand-600'
                                }
                shadow-lg shadow-black/30
                border border-white/5
              `}
                        >
                            {isClear ? <X className="w-5 h-5" /> : isDel ? <Delete className="w-5 h-5" /> : key}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
