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
                                ? 'bg-primary border-primary scale-110'
                                : 'bg-transparent border-border'
                            }
              ${hasError ? 'border-red-500 bg-red-500' : ''}
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
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isSpecial
                                                                        ? 'bg-muted text-muted-foreground hover:bg-accent text-sm'
                                                                        : 'bg-card text-card-foreground border border-border hover:bg-accent active:bg-accent/80'
                                }
                                shadow-sm
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
