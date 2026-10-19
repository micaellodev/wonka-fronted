import { useState } from 'react'
import { DollarSign, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
 // Not dismissable: sales stay blocked until the day is opened.
 <Dialog open onOpenChange={() => {}}>
 <DialogContent size="md" showCloseButton={false}>
 <DialogHeader>
 <div className="flex items-center gap-3">
 <DollarSign className="h-5 w-5 text-primary" aria-hidden />
 <div>
 <DialogTitle className="text-xl">Apertura de Caja</DialogTitle>
 <DialogDescription>Ingresa el monto inicial de efectivo en caja</DialogDescription>
 </div>
 </div>
 </DialogHeader>

 <div className="space-y-4">
 <div className="rounded-lg border border-border bg-muted/40 p-4">
 <Label htmlFor="opening-amount" className="mb-1 block font-normal text-muted-foreground">Este será el saldo inicial del día</Label>
 <div className="flex items-center gap-2">
 <span className="text-2xl font-semibold">S/</span>
 <Input
 id="opening-amount"
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
 className="h-12 text-3xl font-bold"
 autoFocus
 />
 </div>
 </div>

 {(error || serverError) && (
 <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-danger-soft p-3">
 <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
 <p className="text-sm text-destructive">{error || serverError}</p>
 </div>
 )}

 <Button onClick={handleSubmit} disabled={!amount || isLoading} className="h-11 w-full">
 {isLoading ? 'Abriendo caja...' : 'Confirmar apertura'}
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 )
}
