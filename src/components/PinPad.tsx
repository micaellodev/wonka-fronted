// ============================================================
//  PinPad — Minimalist dark redesign
// ============================================================

import { useState, useCallback } from 'react'
import { Delete, X } from 'lucide-react'

const PIN_LENGTH = 5

interface PinPadProps {
    onComplete: (pin: string) => void
    disabled?: boolean
    hasError?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const
type KeyValue = (typeof KEYS)[number]

export function PinPad({ onComplete, disabled = false, hasError = false }: PinPadProps) {
    const [pin, setPin] = useState('')

    const handleKey = useCallback(
        (key: KeyValue) => {
            if (disabled) return
            if (key === 'clear') { setPin(''); return }
            if (key === 'del') { setPin((prev) => prev.slice(0, -1)); return }
            setPin((prev) => {
                if (prev.length >= PIN_LENGTH) return prev
                const next = prev + key
                if (next.length === PIN_LENGTH) setTimeout(() => onComplete(next), 0)
                return next
            })
        },
        [disabled, onComplete],
    )

    return (
        <div className="flex flex-col items-center gap-5 select-none">
            {/* PIN dots */}
            <div
                className={`flex gap-3 ${hasError ? 'animate-shake' : ''}`}
                aria-label={`PIN entered: ${pin.length} of ${PIN_LENGTH} digits`}
                role="status"
            >
                {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                    <div
                        key={i}
                        className={`
                            w-3.5 h-3.5 rounded-full border-2 transition-all duration-200
                            ${i < pin.length
                                ? hasError
                                    ? 'bg-red-500 border-red-500 scale-110'
                                    : 'bg-brand-500 border-brand-500 scale-110'
                                : hasError
                                    ? 'bg-transparent border-red-500/60'
                                    : 'bg-transparent border-zinc-600'
                            }
                        `}
                    />
                ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
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
                                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 text-sm'
                                    : 'bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 active:bg-zinc-600'
                                }
                            `}
                        >
                            {isClear ? <X className="w-4 h-4" /> : isDel ? <Delete className="w-4 h-4" /> : key}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
