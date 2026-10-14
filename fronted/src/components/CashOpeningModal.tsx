import { useState } from 'react'
import { DollarSign, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CashOpeningModalProps {
 onConfirm: (amount: number) => void
 isLoading?: boolean
 defaultAmount?: number | null
 serverError?: string | null
}

export function CashOpeningModal({ onConfirm, isLoading = false, defaultAmount = null, serverError = null }: CashOpeningModalProps) {
 const [amount, setAmount] = useState<string>(defaultAmount !== null ? String(defaultAmount) : '')
 const [error, setError] = useState<string>('')

 const handleSubmit = () => {
 const value = Number(amount)
 if (amount.trim() === '' || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
 setError('Por favor ingresa un monto válido')
 return
 }

 setError('')
 onConfirm(Math.round(value * 100) / 100)
 }

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !isLoading) {
 handleSubmit()
 }
 }

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 ">
 <Card className="w-full max-w-md">
 <CardHeader>
 <div className="flex items-center gap-3">
 <DollarSign className="h-5 w-5 text-primary" />
 <div>
 <CardTitle className="text-xl">Apertura de Caja</CardTitle>
 <CardDescription>Ingresa el monto inicial de efectivo en caja</CardDescription>
 </div>
 </div>
 </CardHeader>

 <CardContent className="space-y-4">
 <div className="rounded-lg border bg-muted/40 p-4">
 <p className="mb-1 text-sm text-muted-foreground">Este sera el saldo inicial del dia</p>
 <div className="flex items-center gap-2">
 <span className="text-2xl font-semibold">S/</span>
 <Input
 type="number"
 value={amount}
 onChange={(e) => {
 setAmount(e.target.value)
 setError('')
 }}
 onKeyDown={handleKeyDown}
 placeholder="0.00"
 step="0.01"
 min="0"
 disabled={isLoading}
 className="h-12 border-input/70 text-3xl font-bold"
 autoFocus
 />
 </div>
 </div>

 {(error || serverError) && (
 <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-100 p-3">
 <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
 <p className="text-sm text-brand-400">{error || serverError}</p>
 </div>
 )}

 <Button
 onClick={handleSubmit}
 disabled={!amount || isLoading}
 className="h-11 w-full"
 >
 {isLoading ? 'Abriendo caja...' : 'Confirmar apertura'}
 </Button>
 </CardContent>
 </Card>
 </div>
 )
}

