// ============================================================
//  POSScreen — Main Sales Dashboard (Industrial Redesign)
//  Enterprise-grade, high-contrast, strict flat design.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import {
    ShoppingCart,
    Minus,
    Plus,
    Trash2,
    CreditCard,
    XCircle,
    Package,
    RefreshCw,
    LogOut,
    Banknote as BanknoteIcon,
    Smartphone,
    Receipt,
    FileText,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    Home,
    FolderKanban,
    Settings2,
    Grid3X3,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCashDrawerStore } from '@/store/cashDrawerStore'
import { useCartStore } from '@/store/cartStore'
import { usePlayzoneTicketStore } from '@/store/playzoneTicketStore'
import { usePaymentLedgerStore } from '@/store/paymentLedgerStore'
import { useAdminStore } from '@/store/adminStore'
import type { Product, Category } from '@/types'
import { useNavigate } from 'react-router-dom'
import { AdminGatekeeper } from '@/components/AdminGatekeeper'
import { AttendanceModal } from '@/components/AttendanceModal'
import { Unlock, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { InventoryScreen } from '@/pages/InventoryScreen'
import { CashierScreen } from '@/pages/CashierScreen'
import { ReportsScreen } from '@/pages/ReportsScreen'
import { EmployeesScreen } from '@/pages/EmployeesScreen'
import { PlayZoneScreen } from '@/pages/PlayZoneScreen'
import { BillingNotesScreen } from '@/pages/BillingNotesScreen'

// ── Types ──────────────────────────────────────────────────────────────────

interface ProductsResponse {
    data: Product[]
    meta: { total: number; page: number; limit: number }
}

interface ToastState {
    type: 'success' | 'error' | 'info'
    message: string
}

// ── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = 'efectivo' | 'yape' | 'tarjeta'
type InvoiceType = 'boleta' | 'boleta_dni' | 'factura'

interface CheckoutDetails {
    paymentMethod: PaymentMethod
    cashGiven?: number      // efectivo: cuánto entrega el cliente
    yapeCode?: string       // yape: código 3 dígitos
    referenceCode?: string  // tarjeta: código de referencia
    invoiceType: InvoiceType
    clientDni?: string      // boleta con dni
    clientRuc?: string      // factura
    clientName?: string     // factura: razón social
}

type ModuleView = 'pos' | 'inventory' | 'cashier' | 'reports' | 'employees' | 'playzone' | 'billing-notes'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        minimumFractionDigits: 2,
    }).format(value)
}

// ── Checkout Modal ───────────────────────────────────────────────────────────

function CheckoutModal({
    total,
    onConfirm,
    onCancel,
}: {
    total: number
    onConfirm: (details: CheckoutDetails) => void
    onCancel: () => void
}) {
    const [step, setStep] = useState<1 | 2>(1)
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo')
    const [cashGiven, setCashGiven] = useState('')
    const [yapeCode, setYapeCode] = useState('')
    const [referenceCode, setReferenceCode] = useState('')
    const [invoiceType, setInvoiceType] = useState<InvoiceType>('boleta')
    const [clientDni, setClientDni] = useState('')
    const [clientRuc, setClientRuc] = useState('')
    const [clientName, setClientName] = useState('')

    const cashGivenNum = parseFloat(cashGiven) || 0
    const change = cashGivenNum - total

    const canGoNext = () => {
        if (paymentMethod === 'efectivo') return cashGivenNum >= total
        if (paymentMethod === 'yape') return yapeCode.length === 3
        if (paymentMethod === 'tarjeta') return referenceCode.trim().length >= 1
        return false
    }

    const canConfirm = () => {
        if (invoiceType === 'boleta_dni') return clientDni.trim().length >= 8
        if (invoiceType === 'factura') return clientRuc.trim().length >= 11 && clientName.trim().length >= 2
        return true
    }

    const handleConfirm = () => {
        onConfirm({
            paymentMethod,
            cashGiven: paymentMethod === 'efectivo' ? cashGivenNum : undefined,
            yapeCode: paymentMethod === 'yape' ? yapeCode : undefined,
            referenceCode: paymentMethod === 'tarjeta' ? referenceCode : undefined,
            invoiceType,
            clientDni: invoiceType === 'boleta_dni' ? clientDni : undefined,
            clientRuc: invoiceType === 'factura' ? clientRuc : undefined,
            clientName: invoiceType === 'factura' ? clientName : undefined,
        })
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-zinc-800/60 border-b border-zinc-800">
                    <div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {step === 1 ? 'PASO 1 DE 2' : 'PASO 2 DE 2'}
                        </p>
                        <h2 className="text-base font-black text-white uppercase tracking-widest">
                            {step === 1 ? 'Método de Pago' : 'Comprobante'}
                        </h2>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-zinc-500 font-mono uppercase">TOTAL</p>
                        <p className="text-xl font-black text-green-400 font-mono">{formatCurrency(total)}</p>
                    </div>
                </div>

                {/* Step 1: Payment Method */}
                {step === 1 && (
                    <div className="p-5 flex flex-col gap-4">
                        {/* Method selector */}
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { id: 'efectivo', label: 'EFECTIVO', icon: <BanknoteIcon className="w-6 h-6" /> },
                                { id: 'yape', label: 'YAPE', icon: <Smartphone className="w-6 h-6" /> },
                                { id: 'tarjeta', label: 'TARJETA', icon: <CreditCard className="w-6 h-6" /> },
                            ] as { id: PaymentMethod; label: string; icon: React.ReactNode }[]).map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setPaymentMethod(m.id)}
                                    className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 font-black text-xs tracking-widest transition-none ${
                                        paymentMethod === m.id
                                            ? 'bg-brand-500 border-brand-400 text-white'
                                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                                    }`}
                                >
                                    {m.icon}
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {/* Efectivo */}
                        {paymentMethod === 'efectivo' && (
                            <div className="flex flex-col gap-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">¿Cuánto entrega el cliente?</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-lg">S/</span>
                                    <input
                                        type="number"
                                        min={total}
                                        step="0.50"
                                        value={cashGiven}
                                        onChange={e => setCashGiven(e.target.value)}
                                        placeholder={total.toFixed(2)}
                                        autoFocus
                                        className="w-full bg-zinc-800 border-2 border-zinc-600 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-2xl font-black text-white font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                                    />
                                </div>
                                {/* Quick amounts */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[10, 20, 50, 100].map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setCashGiven(String(v))}
                                            className="py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white rounded-lg text-xs font-bold font-mono transition-none"
                                        >
                                            S/ {v}
                                        </button>
                                    ))}
                                </div>
                                {/* Change display */}
                                {cashGivenNum >= total && (
                                    <div className={`flex items-center justify-between rounded-xl px-4 py-3 border-2 ${
                                        change === 0 ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                                    }`}>
                                        <span className="text-xs font-bold uppercase tracking-widest">VUELTO</span>
                                        <span className="text-2xl font-black font-mono">{formatCurrency(change)}</span>
                                    </div>
                                )}
                                {cashGivenNum > 0 && cashGivenNum < total && (
                                    <div className="flex items-center justify-between rounded-xl px-4 py-3 border-2 bg-red-500/10 border-red-500/40 text-red-400">
                                        <span className="text-xs font-bold uppercase tracking-widest">FALTA</span>
                                        <span className="text-2xl font-black font-mono">{formatCurrency(total - cashGivenNum)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Yape */}
                        {paymentMethod === 'yape' && (
                            <div className="flex flex-col gap-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Código de seguridad Yape (3 dígitos)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={3}
                                    value={yapeCode}
                                    onChange={e => setYapeCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                    placeholder="···"
                                    autoFocus
                                    className="w-full bg-zinc-800 border-2 border-zinc-600 focus:border-purple-500 rounded-xl px-4 py-4 text-4xl font-black text-white font-mono text-center tracking-[1rem] placeholder:text-zinc-600 focus:outline-none transition-colors"
                                />
                                <div className="flex justify-center gap-1.5 mt-1">
                                    {[0, 1, 2].map(i => (
                                        <div key={i} className={`w-4 h-4 rounded-full border-2 ${
                                            yapeCode.length > i ? 'bg-purple-500 border-purple-400' : 'bg-slate-700 border-slate-600'
                                        }`} />
                                    ))}
                                </div>
                                <p className="text-center text-xs text-slate-500">Ingresa el código que aparece en la app Yape</p>
                            </div>
                        )}

                        {/* Tarjeta */}
                        {paymentMethod === 'tarjeta' && (
                            <div className="flex flex-col gap-3">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Código de referencia / aprobación</label>
                                <input
                                    type="text"
                                    value={referenceCode}
                                    onChange={e => setReferenceCode(e.target.value.toUpperCase())}
                                    placeholder="Ej. TXN-123456"
                                    autoFocus
                                    className="w-full bg-zinc-800 border-2 border-zinc-600 focus:border-blue-500 rounded-xl px-4 py-3 text-lg font-black text-white font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                                />
                                <p className="text-xs text-slate-500 text-center">Ingresa el código que aparece en el POS / voucher de la tarjeta</p>
                            </div>
                        )}

                        {/* Nav */}
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={onCancel}
                                className="flex-[0.4] py-3 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-none"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => setStep(2)}
                                disabled={!canGoNext()}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-xl transition-none"
                            >
                                Siguiente <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Invoice Type */}
                {step === 2 && (
                    <div className="p-5 flex flex-col gap-4">
                        {/* Payment summary */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700">
                            {paymentMethod === 'efectivo' && <BanknoteIcon className="w-5 h-5 text-green-400" />}
                            {paymentMethod === 'yape' && <Smartphone className="w-5 h-5 text-purple-400" />}
                            {paymentMethod === 'tarjeta' && <CreditCard className="w-5 h-5 text-blue-400" />}
                            <div className="flex-1">
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                                    {paymentMethod === 'efectivo' ? 'Efectivo' : paymentMethod === 'yape' ? 'Yape' : 'Tarjeta'}
                                </p>
                                {paymentMethod === 'efectivo' && change >= 0 && (
                                    <p className="text-xs text-amber-400 font-bold">Vuelto: {formatCurrency(change)}</p>
                                )}
                                {paymentMethod === 'yape' && (
                                    <p className="text-xs text-slate-300 font-mono">Código: {yapeCode}</p>
                                )}
                                {paymentMethod === 'tarjeta' && (
                                    <p className="text-xs text-slate-300 font-mono">Ref: {referenceCode}</p>
                                )}
                            </div>
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                        </div>

                        {/* Invoice selector */}
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tipo de comprobante</label>
                        <div className="flex flex-col gap-2">
                            {([
                                { id: 'boleta', label: 'Boleta', desc: 'Sin datos del cliente', icon: <Receipt className="w-5 h-5" /> },
                                { id: 'boleta_dni', label: 'Boleta con DNI', desc: 'Ingresa el DNI del cliente', icon: <FileText className="w-5 h-5" /> },
                                { id: 'factura', label: 'Factura', desc: 'RUC + Razón Social', icon: <FileText className="w-5 h-5" /> },
                            ] as { id: InvoiceType; label: string; desc: string; icon: React.ReactNode }[]).map(inv => (
                                <button
                                    key={inv.id}
                                    onClick={() => setInvoiceType(inv.id)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-none ${
                                        invoiceType === inv.id
                                            ? 'bg-brand-500/20 border-brand-500 text-white'
                                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
                                    }`}
                                >
                                    {inv.icon}
                                    <div>
                                        <p className="text-sm font-black uppercase tracking-widest">{inv.label}</p>
                                        <p className="text-[10px] text-slate-500">{inv.desc}</p>
                                    </div>
                                    {invoiceType === inv.id && <CheckCircle2 className="w-4 h-4 text-brand-400 ml-auto" />}
                                </button>
                            ))}
                        </div>

                        {/* DNI field */}
                        {invoiceType === 'boleta_dni' && (
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">DNI del cliente</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={8}
                                    value={clientDni}
                                    onChange={e => setClientDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                    placeholder="12345678"
                                    autoFocus
                                    className="mt-2 w-full bg-zinc-800 border-2 border-zinc-600 focus:border-brand-500 rounded-xl px-4 py-3 text-xl font-black text-white font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                                />
                            </div>
                        )}

                        {/* RUC + Razón Social */}
                        {invoiceType === 'factura' && (
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">RUC</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={11}
                                        value={clientRuc}
                                        onChange={e => setClientRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                                        placeholder="20123456789"
                                        autoFocus
                                        className="mt-2 w-full bg-zinc-800 border-2 border-zinc-600 focus:border-brand-500 rounded-xl px-4 py-3 text-lg font-black text-white font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Razón Social</label>
                                    <input
                                        type="text"
                                        value={clientName}
                                        onChange={e => setClientName(e.target.value)}
                                        placeholder="Empresa S.A.C."
                                        className="mt-2 w-full bg-zinc-800 border-2 border-zinc-600 focus:border-brand-500 rounded-xl px-4 py-3 text-base font-bold text-white placeholder:text-zinc-600 focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Nav */}
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-[0.4] flex items-center justify-center gap-1 py-3 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-none"
                            >
                                <ChevronLeft className="w-4 h-4" /> Atrás
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!canConfirm()}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-xl transition-none"
                            >
                                <CheckCircle2 className="w-5 h-5" /> Confirmar Cobro
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function useClock() {
    const [now, setNow] = useState(new Date())
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [])
    return now
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ProductCard({
    product,
    onAdd,
    cartQty,
}: {
    product: Product
    onAdd: (p: Product) => void
    cartQty: number
}) {
    const isOutOfStock = product.stock === 0
    const isMaxed = cartQty >= product.stock

    return (
        <button
            onClick={() => onAdd(product)}
            disabled={isOutOfStock || isMaxed}
            aria-label={`Agregar ${product.name}`}
            className={`
                relative flex flex-col items-start overflow-hidden rounded-lg border text-left transition-none
                active:bg-zinc-900 focus:outline-none focus:ring-0
                ${isOutOfStock || isMaxed
                    ? 'border-zinc-800 bg-[#0a0a0a] opacity-50 cursor-not-allowed'
                    : 'border-zinc-800 bg-[#0a0a0a] hover:border-zinc-500 cursor-pointer'
                }
            `}
        >
            {/* Product image */}
            <div className="w-full aspect-square bg-zinc-900 overflow-hidden">
                {product.imageUrl ? (
                    <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-slate-600" />
                    </div>
                )}
            </div>

            <div className="p-2 flex flex-col gap-1 w-full">
                {/* Top row: Name and Price */}
                <div className="flex justify-between items-start w-full gap-2">
                    <p className="text-xs font-bold text-slate-100 leading-tight line-clamp-2 uppercase tracking-wide">
                        {product.name}
                    </p>
                    <p className="text-sm font-bold text-white font-mono tracking-tight shrink-0 bg-black px-1 border border-zinc-700">
                        {formatCurrency(product.price)}
                    </p>
                </div>

                {/* Category */}
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    {product.category.name}
                </span>

                {/* Bottom row: Stock Indicator */}
                <div className="flex justify-between items-end w-full mt-1 pt-2 border-t border-zinc-800">
                    <span className={`text-[12px] font-mono font-bold tracking-tight ${isOutOfStock ? 'text-red-500' : product.stock <= 5 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {isOutOfStock ? 'STOCK: 0' : `STOCK: ${product.stock}`}
                    </span>

                    {cartQty > 0 && (
                        <span className="rounded-sm bg-zinc-100 px-2 text-[12px] font-mono font-bold tracking-tight text-black">
                            +{cartQty}
                        </span>
                    )}
                </div>
            </div>

            {/* Out-of-stock overlay label */}
            {isOutOfStock && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1px]">
                    <span className="text-sm font-black text-red-500 border-2 border-red-600 bg-slate-900 px-3 py-1 uppercase tracking-widest rounded-sm">
                        AGOTADO
                    </span>
                </div>
            )}
        </button>
    )
}

// ── Category Products Modal ────────────────────────────────────────────────

function CategoryProductsModal({
    category,
    products,
    onClose,
    onAdd,
    cartQtyFor,
}: {
    category: Category | undefined
    products: Product[]
    onClose: () => void
    onAdd: (p: Product) => void
    cartQtyFor: (id: string) => number
}) {
    if (!category) return null;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
                <div className="flex items-center justify-between px-5 py-4 bg-zinc-800/60 border-b border-zinc-800">
                    <div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            Seleccionar Producto
                        </p>
                        <h2 className="text-base font-black text-white uppercase tracking-widest">
                            {category.name}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                    >
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-5 overflow-y-auto">
                    {products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                            <Package className="w-12 h-12 mb-4 opacity-50" />
                            <p className="text-sm font-bold uppercase tracking-widest">Sin productos</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {products.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    onAdd={onAdd}
                                    cartQty={cartQtyFor(product.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Main Screen ────────────────────────────────────────────────────────────

export function POSScreen() {
    const { tenantId, activeWorker, logout } = useAuthStore()
    const { openingBalance } = useCashDrawerStore()
    const { items, total, addItem, decrementItem, removeItem, clearCart } = useCartStore()
    const { charges: playzoneCharges, clearAllCharges } = usePlayzoneTicketStore()
    const { recordPayment } = usePaymentLedgerStore()
    const { isAdminAuthenticated, logoutAdmin } = useAdminStore()
    const navigate = useNavigate()
    const now = useClock()
    const playzoneExtraCharges = playzoneCharges.filter((c) => c.kind === 'extra')
    const playzoneExtraTotal = playzoneExtraCharges.reduce((sum, c) => sum + c.total, 0)
    const totalToPay = total + playzoneExtraTotal
    const hasSomethingToCharge = items.length > 0 || playzoneExtraCharges.length > 0
    const displayedOpeningBalance = openingBalance ?? 0

    // ── Local state ──────────────────────────────────────────────
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [paying, setPaying] = useState(false)
    const [toast, setToast] = useState<ToastState | null>(null)
    const [checkoutOpen, setCheckoutOpen] = useState(false)

    // ── Admin Gatekeeper state ───────────────────────────────────
    const [isGatekeeperOpen, setIsGatekeeperOpen] = useState(false)
    const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null)

    // ── Attendance Modal state ───────────────────────────────────
    const [isAttendanceOpen, setIsAttendanceOpen] = useState(false)
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false)
    const [activityRange, setActivityRange] = useState<'hoy' | '7' | '30'>('hoy')
    const [activeView, setActiveView] = useState<ModuleView>('pos')

    // ── Toast helper ─────────────────────────────────────────────
    const showToast = useCallback((t: ToastState, duration = 3500) => {
        setToast(t)
        const id = setTimeout(() => setToast(null), duration)
        return () => clearTimeout(id)
    }, [])

    // ── Fetch products ───────────────────────────────────────────
    const fetchProducts = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await api.inventory.products.get({
                query: { tenantId, limit: 100, page: 1 },
            })
            if (error) {
                showToast({ type: 'error', message: 'Error al cargar productos.' })
                return
            }
            const response = data as unknown as ProductsResponse
            const prods: Product[] = response.data ?? []
            setProducts(prods)

            // Build dynamic category list from fetched products
            const catMap = new Map<string, Category>()
            prods.forEach((p) => {
                if (!catMap.has(p.category.id)) {
                    catMap.set(p.category.id, { ...p.category, createdAt: '' })
                }
            })
            setCategories(Array.from(catMap.values()))
        } catch {
            showToast({ type: 'error', message: 'No se pudo conectar con el servidor.' })
        } finally {
            setLoading(false)
        }
    }, [tenantId, showToast])

    useEffect(() => {
        fetchProducts()
    }, [fetchProducts])

    // ── Filtered products ────────────────────────────────────────
    const visibleProducts =
        selectedCategory === null
            ? []
            : products.filter((p) => p.isActive && p.category.id === selectedCategory)


    // ── Cart helpers ─────────────────────────────────────────────
    const cartQtyFor = (productId: string) =>
        items.find((i) => i.product.id === productId)?.quantity ?? 0

    // ── PAY action ───────────────────────────────────────────────
    const handlePay = async (details: CheckoutDetails) => {
        if (!hasSomethingToCharge || paying) return
        if (!activeWorker) {
            showToast({ type: 'error', message: 'No hay un trabajador activo.' })
            return
        }
        setCheckoutOpen(false)
        setPaying(true)
        try {
            if (items.length > 0) {
                const payload = {
                    tenantId,
                    workerId: activeWorker.id,
                    items: items.map((i) => ({ productId: i.product.id, qty: i.quantity })),
                }
                const { data, error } = await api.pos.sales.post(payload)
                if (error) {
                    const msg = (error.value as { message?: string })?.message ?? 'Error al procesar la venta.'
                    showToast({ type: 'error', message: msg })
                    return
                }
                void data
            }

            const method = details.paymentMethod === 'efectivo' ? 'EFECTIVO' : details.paymentMethod === 'yape' ? 'YAPE' : 'TARJETA'
            const invoice = details.invoiceType === 'boleta' ? 'BOLETA' : details.invoiceType === 'boleta_dni' ? `BOLETA DNI:${details.clientDni}` : `FACTURA RUC:${details.clientRuc}`
            showToast({
                type: 'success',
                message: `VENTA OK · ${method} · ${invoice} · ${formatCurrency(totalToPay)}`,
            }, 5000)

            recordPayment({
                tenantId,
                workerId: activeWorker.id,
                method: details.paymentMethod,
                amount: totalToPay,
            })

            clearCart()
            clearAllCharges()
            fetchProducts()
        } catch {
            showToast({ type: 'error', message: 'Error de conexión. Reintenta.' })
        } finally {
            setPaying(false)
        }
    }

    // ── Cancel / clear cart ──────────────────────────────────────
    const handleCancel = () => {
        if (!hasSomethingToCharge) return
        clearCart()
        clearAllCharges()
        showToast({ type: 'info', message: 'ORDEN CANCELADA' })
    }

    // ── Logout ───────────────────────────────────────────────────
    const handleLogout = () => {
        clearCart()
        clearAllCharges()
        logout()
        logoutAdmin()
        navigate('/')
    }

    // ── Admin Action Handler ─────────────────────────────────────
    const handleAdminAction = (action: () => void) => {
        if (isAdminAuthenticated) {
            action()
        } else {
            setPendingAdminAction(() => action)
            setIsGatekeeperOpen(true)
        }
    }

    const onAdminSuccess = () => {
        if (pendingAdminAction) {
            pendingAdminAction()
            setPendingAdminAction(null)
        }
    }

    const handleAdminMenuToggle = () => {
        handleAdminAction(() => setIsAdminMenuOpen((prev) => !prev))
    }

    // ── Date / time format ───────────────────────────────────────
    const dateStr = now.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
    const timeStr = now.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
    const cartLineCount = items.length + playzoneExtraCharges.length
    const cartUnits = items.reduce((sum, i) => sum + i.quantity, 0) + playzoneExtraCharges.reduce((sum, i) => sum + i.qty, 0)
    const isPosView = activeView === 'pos'

    // ──────────────────────────────────────────────────────────────────────
    return (
        <div className="monochrome-ui flex h-screen flex-col overflow-hidden bg-black font-sans text-zinc-100">

            {/* ══════════════════ HEADER ══════════════════════════════════ */}
            <header className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 bg-[#060606] px-5 py-3">
                {/* Left: Store identity and Operations */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-[#0d0d0d]">
                            <span className="text-xl" role="img" aria-label="Wonka">🍫</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-extrabold uppercase tracking-[0.14em] leading-none text-white">WONKA POS</h1>
                            <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500 leading-none">TID: {tenantId}</p>
                        </div>
                    </div>
                </div>

                {/* Center: Date / time */}
                <div className="hidden min-w-[170px] flex-col items-center rounded-lg border border-zinc-700 bg-[#0a0a0a] px-4 py-1.5 lg:flex">
                    <span className="font-mono text-lg font-bold tabular-nums leading-none tracking-tight text-white">{timeStr}</span>
                    <span className="mt-1 font-mono text-[10px] font-bold tracking-widest text-zinc-500">{dateStr}</span>
                </div>

                {/* Right: Worker + Admin + logout */}
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-none">Apertura</span>
                        <span className="mt-1 font-mono text-sm font-black leading-none text-white">
                            {formatCurrency(displayedOpeningBalance)}
                        </span>
                    </div>

                    {/* Admin Logout Button */}
                    {isAdminAuthenticated && (
                        <button
                            onClick={logoutAdmin}
                            title="Desconectar Administrador"
                            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-[#0a0a0a] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#141414]"
                        >
                            <Unlock className="w-4 h-4" />
                            ADMIN OK
                        </button>
                    )}

                    {activeWorker && (
                        <div className="flex items-center gap-3 border-r border-zinc-800 pr-4 text-right">
                            <div>
                                <p className="text-sm font-bold text-white uppercase tracking-wider leading-none">{activeWorker.name}</p>
                                {activeWorker.role?.name && (
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest leading-none text-zinc-500">{activeWorker.role?.name}</p>
                                )}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        title="Cerrar sesión"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-[#0a0a0a] text-zinc-300 transition-colors hover:bg-[#171717] hover:text-white"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* ══════════════════ BODY ════════════════════════════════════ */}
            <div className="flex flex-1 overflow-hidden">
                <aside className="hidden w-[260px] flex-shrink-0 border-r border-zinc-800 bg-[#080808] px-4 py-3 md:flex md:flex-col">
                    <div className="flex items-center gap-2.5 px-1">
                    </div>

                    <Separator className="my-4 bg-zinc-800" />

                    <p className="mb-2 px-1 text-xs uppercase tracking-widest text-zinc-500">Navegacion</p>
                    <div className="space-y-1">
                        <SidebarNavItem icon={<Home className="w-4 h-4" />} label="Punto de venta" active={activeView === 'pos'} onClick={() => setActiveView('pos')} />
                        <SidebarNavItem icon={<FolderKanban className="w-4 h-4" />} label="Zona de juegos" active={activeView === 'playzone'} onClick={() => setActiveView('playzone')} />
                        <SidebarNavItem icon={<Settings2 className="w-4 h-4" />} label="Administrador" onClick={handleAdminMenuToggle} />
                    </div>

                    {isAdminMenuOpen && (
                        <div className="ml-6 mt-2 space-y-1 border-l border-slate-800 pl-3">
                            <SidebarNavItem label="Inventario" active={activeView === 'inventory'} onClick={() => handleAdminAction(() => setActiveView('inventory'))} compact />
                            <SidebarNavItem label="Cuadre de caja" active={activeView === 'cashier'} onClick={() => handleAdminAction(() => setActiveView('cashier'))} compact />
                            <SidebarNavItem label="Reportes" active={activeView === 'reports'} onClick={() => handleAdminAction(() => setActiveView('reports'))} compact />
                            <SidebarNavItem label="Empleados" active={activeView === 'employees'} onClick={() => handleAdminAction(() => setActiveView('employees'))} compact />
                        </div>
                    )}

                    <p className="mb-2 mt-6 px-1 text-xs uppercase tracking-widest text-zinc-500">Administrador</p>
                    <div className="space-y-1">
                        <SidebarNavItem icon={<Package className="w-4 h-4" />} label="Inventario" active={activeView === 'inventory'} onClick={() => handleAdminAction(() => setActiveView('inventory'))}/>
                        <SidebarNavItem icon={<Package className="w-4 h-4" />} label="Cuadre De Caja" active={activeView === 'cashier'} onClick={() => handleAdminAction(() => setActiveView('cashier'))}/>
                        <SidebarNavItem icon={<Package className="w-4 h-4" />} label="Empleados" active={activeView === 'employees'} onClick={() => handleAdminAction(() => setActiveView('employees'))}/>
                        <SidebarNavItem icon={<Receipt className="w-4 h-4" />} label="Reports" active={activeView === 'reports'} onClick={() => handleAdminAction(() => setActiveView('reports'))} />
                        <SidebarNavItem icon={<FileText className="w-4 h-4" />} label="Word Assistant" onClick={() => setIsAttendanceOpen(true)} />
                        <SidebarNavItem icon={<Receipt className="w-4 h-4" />} label="Notas C/D" active={activeView === 'billing-notes'} onClick={() => handleAdminAction(() => setActiveView('billing-notes'))} />
                    </div>

                        <div className="ml-6 mt-2 max-h-44 space-y-1 overflow-y-auto border-l border-zinc-800 pl-3">
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={`w-full px-2 py-1.5 text-left text-sm transition-colors ${selectedCategory === null ? 'bg-zinc-100 text-black' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
                        >
                            Categorias
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`w-full px-2 py-1.5 text-left text-sm transition-colors ${selectedCategory === cat.id ? 'bg-zinc-100 text-black' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <div className="mt-auto pt-4">
                        <SidebarNavItem icon={<Clock className="w-4 h-4" />} label="Asistencia" onClick={() => setIsAttendanceOpen(true)} />
                    </div>
                </aside>

                <main className={isPosView ? 'flex-1 min-w-0 p-4 md:p-5 overflow-y-auto' : 'flex-1 min-w-0 overflow-y-auto'}>
                    {isPosView && isAdminAuthenticated && isAdminMenuOpen && (
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Badge variant="warning">Administrador</Badge>
                                <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Resumen rapido</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                <DashboardMetric label="Productos Activos" value={String(visibleProducts.length)} hint="Disponibles para venta" tone="cyan" />
                                <DashboardMetric label="Lineas del Ticket" value={String(cartLineCount)} hint="Items distintos en cobro" tone="amber" />
                                <DashboardMetric label="Unidades" value={String(cartUnits)} hint="Total de unidades" tone="slate" />
                                <DashboardMetric label="Total Actual" value={formatCurrency(totalToPay)} hint="Incluye extras de juegos" tone="emerald" />
                            </div>
                        </div>
                    )}

                    {isPosView && isAdminAuthenticated && isAdminMenuOpen && (
                        <Card className="mb-4 rounded-xl border-zinc-800 bg-[#0a0a0a]">
                            <CardHeader className="pb-3">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Actividad de Turno</p>
                                    <h3 className="text-sm font-bold text-zinc-200">Flujo operativo POS</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <TabsList className="border-zinc-800 bg-black p-0.5">
                                        <TabsTrigger active={activityRange === 'hoy'} onClick={() => setActivityRange('hoy')} className="text-[10px] uppercase tracking-widest px-2.5 py-1">Hoy</TabsTrigger>
                                        <TabsTrigger active={activityRange === '7'} onClick={() => setActivityRange('7')} className="text-[10px] uppercase tracking-widest px-2.5 py-1">7 dias</TabsTrigger>
                                        <TabsTrigger active={activityRange === '30'} onClick={() => setActivityRange('30')} className="text-[10px] uppercase tracking-widest px-2.5 py-1">30 dias</TabsTrigger>
                                    </TabsList>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={fetchProducts}
                                        disabled={loading}
                                        title="Recargar productos"
                                        className="uppercase tracking-wider text-[10px] h-7 px-2"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                        Sync
                                    </Button>
                                </div>
                            </div>
                            </CardHeader>
                            <CardContent>
                            <Separator className="mb-3" />
                            <div className="relative h-28 overflow-hidden rounded-lg border border-zinc-800 bg-[linear-gradient(180deg,#0b0b0b,#050505)]">
                                <svg viewBox="0 0 100 30" className="absolute inset-0 w-full h-full opacity-70">
                                    <defs>
                                        <linearGradient id="curveA" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#f5f5f5" stopOpacity="0.22" />
                                            <stop offset="100%" stopColor="#f5f5f5" stopOpacity="0" />
                                        </linearGradient>
                                        <linearGradient id="curveB" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#d4d4d4" stopOpacity="0.18" />
                                            <stop offset="100%" stopColor="#d4d4d4" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0,18 C12,8 25,26 40,18 C55,10 70,20 85,14 C92,11 96,12 100,9 L100,30 L0,30 Z" fill="url(#curveA)" />
                                    <path d="M0,23 C10,18 24,26 40,23 C55,20 72,28 88,20 C94,17 98,18 100,16 L100,30 L0,30 Z" fill="url(#curveB)" />
                                </svg>
                                <div className="absolute top-2 left-3 text-[10px] uppercase tracking-widest text-zinc-500">Rendimiento del turno</div>
                                <div className="absolute right-3 bottom-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">+12.6%</div>
                            </div>
                            </CardContent>
                        </Card>
                    )}

                    {isPosView ? (
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 min-h-[480px]">
                        <section className="flex min-h-0 flex-col rounded-xl border border-zinc-800 bg-[#090909] p-4">
                            <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-2">
                                <p className="text-xs font-bold font-mono uppercase tracking-widest text-zinc-500">[{categories.length} categorias]</p>
                                <div className="text-[11px] uppercase tracking-widest text-zinc-500">Catalogo</div>
                            </div>

                            {loading && (
                                <div className="flex flex-col items-center justify-center h-64 gap-4 text-zinc-600">
                                    <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
                                    <p className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-500">Sincronizando DB...</p>
                                </div>
                            )}

                            {!loading && categories.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-600">
                                    <Grid3X3 className="w-12 h-12 opacity-50" />
                                    <p className="text-sm font-bold uppercase tracking-widest">Sin categorias</p>
                                </div>
                            )}

                            {!loading && categories.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 cursor-default overflow-y-auto pr-1">
                                    {categories.map((cat) => {
                                        const count = products.filter((p) => p.isActive && p.category.id === cat.id).length
                                        return (
                                            <button
                                                key={cat.id}
                                                onClick={() => setSelectedCategory(cat.id)}
                                                className="flex min-h-[120px] flex-col items-start justify-between rounded-lg border border-zinc-800 bg-[#0a0a0a] p-3 text-left transition-none hover:border-zinc-500"
                                            >
                                                <div className="rounded-md border border-zinc-700 bg-black/60 p-2">
                                                    <Grid3X3 className="w-5 h-5 text-zinc-300" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-wide text-zinc-100">{cat.name}</p>
                                                    <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">{count} productos</p>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </section>

                        <aside className="flex min-h-0 flex-col rounded-xl border border-zinc-800 bg-[#070707]">
                            <div className="border-b border-zinc-800 px-4 py-4">
                                <h2 className="text-sm font-bold text-white tracking-widest uppercase">Ticket</h2>
                                <p className="mt-0.5 text-[10px] font-mono text-zinc-500">{dateStr} · {timeStr} · {activeWorker?.name}</p>
                            </div>

                            {hasSomethingToCharge && (
                                <div className="flex justify-between border-b border-zinc-800 px-4 py-2 text-[10px] font-mono font-bold uppercase text-zinc-500">
                                    <span className="flex-1">Descripcion</span>
                                    <span className="w-16 text-center">Cant</span>
                                    <span className="w-20 text-right">Importe</span>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto bg-zinc-950 p-2">
                                {!hasSomethingToCharge ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600 py-12">
                                        <ShoppingCart className="w-10 h-10 opacity-30 text-zinc-600" />
                                        <p className="text-xs font-bold uppercase tracking-widest text-center">
                                            Ticket vacio<br />Esperando...
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {items.map((item) => (
                                            <CartRow
                                                key={item.product.id}
                                                item={item}
                                                onDecrement={() => decrementItem(item.product.id)}
                                                onIncrement={() => addItem(item.product)}
                                                onRemove={() => removeItem(item.product.id)}
                                            />
                                        ))}
                                        {playzoneExtraCharges.map((charge) => (
                                            <PlayzoneChargeRow key={charge.id} charge={charge} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex shrink-0 flex-col gap-4 border-t border-zinc-800 bg-[#090909] p-4">
                                {hasSomethingToCharge && (
                                    <div className="mb-2 flex justify-between border-b border-zinc-800 pb-2 text-[11px] font-mono font-bold text-zinc-500">
                                        <span>Lineas: {cartLineCount}</span>
                                        <span>Total uds: {cartUnits}</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-black uppercase tracking-widest text-zinc-200">Total a pagar</span>
                                    <span className="text-3xl font-black text-emerald-300 font-mono tracking-tighter">{formatCurrency(totalToPay)}</span>
                                </div>

                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={handleCancel}
                                        disabled={!hasSomethingToCharge || paying}
                                        className="
                                            flex-[0.4] flex items-center justify-center
                                            h-14 rounded-lg font-black text-xs uppercase tracking-widest
                                            focus:outline-none focus:ring-0
                                            bg-zinc-800 border border-zinc-700
                                            text-zinc-300 hover:bg-zinc-700 hover:text-white
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                            transition-none
                                        "
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => setCheckoutOpen(true)}
                                        disabled={!hasSomethingToCharge || paying}
                                        className={`
                                            flex-1 flex items-center justify-center gap-2
                                            h-14 rounded-lg font-black text-lg uppercase tracking-widest
                                            focus:outline-none focus:ring-0
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                            transition-none
                                            ${hasSomethingToCharge && !paying
                                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-none'
                                                : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                            }
                                        `}
                                    >
                                        <CreditCard className="w-6 h-6 shrink-0" />
                                        {paying ? 'Proc...' : 'Cobrar'}
                                    </button>
                                </div>
                            </div>
                        </aside>
                    </div>
                    ) : (
                    <div className="h-full w-full overflow-auto p-3 md:p-4">
                        {activeView === 'inventory' && <InventoryScreen />}
                        {activeView === 'cashier' && <CashierScreen />}
                        {activeView === 'reports' && <ReportsScreen />}
                        {activeView === 'employees' && <EmployeesScreen />}
                        {activeView === 'playzone' && <PlayZoneScreen />}
                        {activeView === 'billing-notes' && <BillingNotesScreen />}
                    </div>
                    )}
                </main>
            </div>

            {/* TOAST NOTIFICATION (Blocky, high contrast) */}
            {toast && (
                <div
                    role="alert"
                    aria-live="polite"
                    className={`
                        fixed bottom-8 left-1/2 -translate-x-1/2
                        flex items-center gap-3 px-5 py-3
                        rounded-xl text-sm font-medium backdrop-blur-md
                        border z-50 animate-fade-in
                        ${toast.type === 'success'
                            ? 'bg-emerald-950/90 border-emerald-800/60 text-emerald-300'
                            : toast.type === 'error'
                                ? 'bg-red-950/90 border-red-800/60 text-red-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        }
                    `}
                >
                    {toast.message}
                </div>
            )}

            {/* ══════════════════ CHECKOUT MODAL ═════════════════════════ */}
            {checkoutOpen && (
                <CheckoutModal
                    total={totalToPay}
                    onConfirm={handlePay}
                    onCancel={() => setCheckoutOpen(false)}
                />
            )}

            {/* ══════════════════ CATEGORY MODAL ═════════════════════════ */}
            {selectedCategory !== null && (
                <CategoryProductsModal
                    category={categories.find(c => c.id === selectedCategory)}
                    products={visibleProducts}
                    onClose={() => setSelectedCategory(null)}
                    onAdd={addItem}
                    cartQtyFor={cartQtyFor}
                />
            )}

            {/* ══════════════════ GATEKEEPER MODAL ════════════════════════ */}
            <AdminGatekeeper
                isOpen={isGatekeeperOpen}
                onClose={() => setIsGatekeeperOpen(false)}
                onSuccess={onAdminSuccess}
            />

            {/* ══════════════════ ATTENDANCE MODAL ════════════════════════ */}
            <AttendanceModal
                isOpen={isAttendanceOpen}
                onClose={() => setIsAttendanceOpen(false)}
                onSuccess={(msg) => showToast({ type: 'success', message: msg })}
            />
        </div>
    )
}

// ── Extracted pure-presentational components ────────────────────────────────

function DashboardMetric({
    label,
    value,
    hint,
    tone,
}: {
    label: string
    value: string
    hint: string
    tone: 'cyan' | 'amber' | 'slate' | 'emerald'
}) {
    const tones = {
        cyan: 'text-zinc-100 border-zinc-700 bg-zinc-900/70',
        amber: 'text-zinc-100 border-zinc-700 bg-zinc-900/70',
        slate: 'text-zinc-100 border-zinc-700 bg-zinc-900/70',
        emerald: 'text-zinc-100 border-zinc-700 bg-zinc-900/70',
    }

    return (
        <div className="border border-zinc-800 bg-[#0b0b0b] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
            <p className={`mt-1 w-fit border px-2 py-1 text-2xl font-black ${tones[tone]}`}>{value}</p>
            <p className="mt-2 text-[11px] text-zinc-500">{hint}</p>
        </div>
    )
}

function SidebarNavItem({
    label,
    icon,
    onClick,
    active,
    disabled,
    compact,
}: {
    label: string
    icon?: React.ReactNode
    onClick?: () => void
    active?: boolean
    disabled?: boolean
    compact?: boolean
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                'w-full flex items-center gap-2 rounded-md text-left transition-colors',
                compact ? 'px-2 py-1.5 text-sm' : 'px-2 py-2 text-sm',
                active
                    ? 'bg-zinc-100 text-black'
                    : 'text-zinc-300 hover:bg-zinc-900 hover:text-white',
                disabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-zinc-500' : '',
            ].join(' ')}
        >
            {icon ? <span className="shrink-0">{icon}</span> : <span className="w-4" />}
            <span className="leading-none">{label}</span>
        </button>
    )
}

function CartRow({
    item,
    onDecrement,
    onIncrement,
    onRemove,
}: {
    item: import('@/types').CartItem
    onDecrement: () => void
    onIncrement: () => void
    onRemove: () => void
}) {
    const subtotal = item.product.price * item.quantity
    const isMaxed = item.quantity >= item.product.stock

    return (
        <div className="flex items-center gap-2 px-2 py-2 border-b border-zinc-800 hover:bg-zinc-900/50 relative group">
            {/* Delete button (shows on hover) */}
            <button
                onClick={onRemove}
                className="absolute -left-1 top-1/2 -translate-y-1/2 bg-red-600 text-white p-1 rounded opacity-0 transition-opacity group-hover:opacity-100"
            >
                <Trash2 className="w-3 h-3" />
            </button>

            {/* Product Desc */}
            <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
                <p className="text-xs font-bold text-zinc-100 leading-tight uppercase truncate">
                    {item.product.name}
                </p>
                <p className="text-[10px] font-mono text-zinc-500">
                    {formatCurrency(item.product.price)} UN.
                </p>
            </div>

            {/* Controls */}
            <div className="w-20 flex flex-col items-center shrink-0">
                <div className="flex items-center rounded-md border border-zinc-700 bg-zinc-800">
                    <button
                        onClick={onDecrement}
                        className="border-r border-zinc-700 px-1.5 py-1 text-zinc-400 transition-none hover:bg-zinc-700 hover:text-white"
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-black font-mono text-white py-1">
                        {item.quantity}
                    </span>
                    <button
                        onClick={onIncrement}
                        disabled={isMaxed}
                        className="border-l border-zinc-700 px-1.5 py-1 text-zinc-400 transition-none hover:bg-zinc-700 hover:text-white disabled:opacity-30"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
                {isMaxed && (
                    <span className="text-[8px] font-bold text-red-500 uppercase mt-0.5">MÁX</span>
                )}
            </div>

            {/* Subtotal */}
            <div className="w-20 text-right shrink-0">
                <span className="text-sm font-black font-mono text-emerald-400 tracking-tighter">
                    {new Intl.NumberFormat('es-PE', {
                        style: 'currency',
                        currency: 'PEN',
                        minimumFractionDigits: 2,
                    }).format(subtotal)}
                </span>
            </div>
        </div>
    )
}

function PlayzoneChargeRow({
    charge,
}: {
    charge: import('@/store/playzoneTicketStore').PlayzoneChargeLine
}) {
    return (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-2 py-2">
            <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
                <p className="text-xs font-bold text-zinc-100 leading-tight uppercase truncate">
                    {charge.label}
                </p>
                <p className="text-[10px] font-mono text-amber-500">
                    {formatCurrency(charge.unitPrice)} UN.
                </p>
            </div>

            <div className="w-20 flex flex-col items-center shrink-0">
                <span className="w-16 rounded-md border border-amber-800/50 bg-amber-900/30 py-1 text-center text-xs font-black font-mono text-amber-300">
                    {charge.qty}
                </span>
            </div>

            <div className="w-20 text-right shrink-0">
                <span className="text-sm font-black font-mono text-emerald-400 tracking-tighter">
                    {formatCurrency(charge.total)}
                </span>
            </div>
        </div>
    )
}
