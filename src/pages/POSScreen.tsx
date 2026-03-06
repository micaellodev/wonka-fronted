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
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { useAdminStore } from '@/store/adminStore'
import type { Product, Category } from '@/types'
import { useNavigate } from 'react-router-dom'
import { AdminGatekeeper } from '@/components/AdminGatekeeper'
import { AttendanceModal } from '@/components/AttendanceModal'
import { Lock, Unlock, Clock, BarChart2, Banknote, Users, Timer } from 'lucide-react'

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

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_CATEGORY_ID = '__ALL__'

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
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-slate-800 border-b border-slate-700">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {step === 1 ? 'PASO 1 DE 2' : 'PASO 2 DE 2'}
                        </p>
                        <h2 className="text-base font-black text-white uppercase tracking-widest">
                            {step === 1 ? 'Método de Pago' : 'Comprobante'}
                        </h2>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-mono uppercase">TOTAL</p>
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
                                            ? 'bg-brand-600 border-brand-500 text-white'
                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
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
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">¿Cuánto entrega el cliente?</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">S/</span>
                                    <input
                                        type="number"
                                        min={total}
                                        step="0.50"
                                        value={cashGiven}
                                        onChange={e => setCashGiven(e.target.value)}
                                        placeholder={total.toFixed(2)}
                                        autoFocus
                                        className="w-full bg-slate-800 border-2 border-slate-600 focus:border-green-500 rounded-xl pl-10 pr-4 py-3 text-2xl font-black text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
                                    />
                                </div>
                                {/* Quick amounts */}
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[10, 20, 50, 100].map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setCashGiven(String(v))}
                                            className="py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-xs font-bold font-mono transition-none"
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
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Código de seguridad Yape (3 dígitos)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={3}
                                    value={yapeCode}
                                    onChange={e => setYapeCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                    placeholder="···"
                                    autoFocus
                                    className="w-full bg-slate-800 border-2 border-slate-600 focus:border-purple-500 rounded-xl px-4 py-4 text-4xl font-black text-white font-mono text-center tracking-[1rem] placeholder:text-slate-600 focus:outline-none transition-colors"
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
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Código de referencia / aprobación</label>
                                <input
                                    type="text"
                                    value={referenceCode}
                                    onChange={e => setReferenceCode(e.target.value.toUpperCase())}
                                    placeholder="Ej. TXN-123456"
                                    autoFocus
                                    className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 rounded-xl px-4 py-3 text-lg font-black text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
                                />
                                <p className="text-xs text-slate-500 text-center">Ingresa el código que aparece en el POS / voucher de la tarjeta</p>
                            </div>
                        )}

                        {/* Nav */}
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={onCancel}
                                className="flex-[0.4] py-3 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-none"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => setStep(2)}
                                disabled={!canGoNext()}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-xl transition-none"
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
                        <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 rounded-xl border border-slate-700">
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
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo de comprobante</label>
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
                                            ? 'bg-brand-600/20 border-brand-500 text-white'
                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
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
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">DNI del cliente</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={8}
                                    value={clientDni}
                                    onChange={e => setClientDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                    placeholder="12345678"
                                    autoFocus
                                    className="mt-2 w-full bg-slate-800 border-2 border-slate-600 focus:border-brand-500 rounded-xl px-4 py-3 text-xl font-black text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
                                />
                            </div>
                        )}

                        {/* RUC + Razón Social */}
                        {invoiceType === 'factura' && (
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">RUC</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={11}
                                        value={clientRuc}
                                        onChange={e => setClientRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                                        placeholder="20123456789"
                                        autoFocus
                                        className="mt-2 w-full bg-slate-800 border-2 border-slate-600 focus:border-brand-500 rounded-xl px-4 py-3 text-lg font-black text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Razón Social</label>
                                    <input
                                        type="text"
                                        value={clientName}
                                        onChange={e => setClientName(e.target.value)}
                                        placeholder="Empresa S.A.C."
                                        className="mt-2 w-full bg-slate-800 border-2 border-slate-600 focus:border-brand-500 rounded-xl px-4 py-3 text-base font-bold text-white placeholder:text-slate-600 focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Nav */}
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-[0.4] flex items-center justify-center gap-1 py-3 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-none"
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
                relative flex flex-col items-start text-left bg-slate-800 transition-none
                active:bg-slate-700 focus:outline-none focus:ring-0
                rounded-md overflow-hidden
                border-2
                ${isOutOfStock || isMaxed
                    ? 'border-slate-700 opacity-50 cursor-not-allowed'
                    : 'border-slate-700 hover:border-brand-600 cursor-pointer'
                }
            `}
        >
            {/* Product image */}
            <div className="w-full aspect-square bg-slate-700 overflow-hidden">
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
                    <p className="text-sm font-bold text-green-500 font-mono tracking-tight shrink-0 bg-slate-900 px-1 border border-slate-700 rounded-sm">
                        {formatCurrency(product.price)}
                    </p>
                </div>

                {/* Category */}
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">
                    {product.category.name}
                </span>

                {/* Bottom row: Stock Indicator */}
                <div className="flex justify-between items-end w-full mt-1 pt-2 border-t border-slate-700">
                    <span className={`text-[12px] font-mono font-bold tracking-tight ${isOutOfStock ? 'text-red-500' : product.stock <= 5 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {isOutOfStock ? 'STOCK: 0' : `STOCK: ${product.stock}`}
                    </span>

                    {cartQty > 0 && (
                        <span className="text-[12px] font-mono font-bold text-white bg-brand-600 px-2 rounded-sm tracking-tight">
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

// ── Main Screen ────────────────────────────────────────────────────────────

export function POSScreen() {
    const { tenantId, activeWorker, logout } = useAuthStore()
    const { items, total, addItem, decrementItem, removeItem, clearCart } = useCartStore()
    const { isAdminAuthenticated, logoutAdmin } = useAdminStore()
    const navigate = useNavigate()
    const now = useClock()

    // ── Local state ──────────────────────────────────────────────
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY_ID)
    const [loading, setLoading] = useState(true)
    const [paying, setPaying] = useState(false)
    const [toast, setToast] = useState<ToastState | null>(null)
    const [checkoutOpen, setCheckoutOpen] = useState(false)

    // ── Admin Gatekeeper state ───────────────────────────────────
    const [isGatekeeperOpen, setIsGatekeeperOpen] = useState(false)
    const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null)

    // ── Attendance Modal state ───────────────────────────────────
    const [isAttendanceOpen, setIsAttendanceOpen] = useState(false)

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
        selectedCategory === ALL_CATEGORY_ID
            ? products.filter((p) => p.isActive)
            : products.filter((p) => p.isActive && p.category.id === selectedCategory)

    // ── Cart helpers ─────────────────────────────────────────────
    const cartQtyFor = (productId: string) =>
        items.find((i) => i.product.id === productId)?.quantity ?? 0

    // ── PAY action ───────────────────────────────────────────────
    const handlePay = async (details: CheckoutDetails) => {
        if (items.length === 0 || paying) return
        if (!activeWorker) {
            showToast({ type: 'error', message: 'No hay un trabajador activo.' })
            return
        }
        setCheckoutOpen(false)
        setPaying(true)
        try {
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
            const method = details.paymentMethod === 'efectivo' ? 'EFECTIVO' : details.paymentMethod === 'yape' ? 'YAPE' : 'TARJETA'
            const invoice = details.invoiceType === 'boleta' ? 'BOLETA' : details.invoiceType === 'boleta_dni' ? `BOLETA DNI:${details.clientDni}` : `FACTURA RUC:${details.clientRuc}`
            showToast({
                type: 'success',
                message: `VENTA OK · ${method} · ${invoice} · ${formatCurrency(total)}`,
            }, 5000)
            clearCart()
            fetchProducts()
        } catch {
            showToast({ type: 'error', message: 'Error de conexión. Reintenta.' })
        } finally {
            setPaying(false)
        }
    }

    // ── Cancel / clear cart ──────────────────────────────────────
    const handleCancel = () => {
        if (items.length === 0) return
        clearCart()
        showToast({ type: 'info', message: 'ORDEN CANCELADA' })
    }

    // ── Logout ───────────────────────────────────────────────────
    const handleLogout = () => {
        clearCart()
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

    // ──────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen bg-slate-900 overflow-hidden font-sans">

            {/* ══════════════════ HEADER ══════════════════════════════════ */}
            <header className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
                {/* Left: Store identity and Operations */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 bg-slate-800 border-2 border-slate-600 rounded-md">
                            <span className="text-xl" role="img" aria-label="Wonka">🍫</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-white uppercase tracking-wider leading-none">WONKA POS</h1>
                            <p className="text-[12px] text-slate-400 font-mono leading-none mt-1 uppercase tracking-widest">TID: {tenantId}</p>
                        </div>
                    </div>
                </div>

                {/* Center: Date / time */}
                <div className="hidden lg:flex flex-col items-center bg-slate-800 px-4 py-1.5 border border-slate-700 rounded-md">
                    <span className="text-lg font-bold text-brand-400 font-mono tabular-nums leading-none tracking-tight">{timeStr}</span>
                    <span className="text-[10px] font-bold text-slate-400 font-mono mt-1 tracking-widest">{dateStr}</span>
                </div>

                {/* Right: Worker + Admin + logout */}
                <div className="flex items-center gap-4">
                    {/* Admin Logout Button */}
                    {isAdminAuthenticated && (
                        <button
                            onClick={logoutAdmin}
                            title="Desconectar Administrador"
                            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-brand-400 rounded-md text-xs font-bold uppercase tracking-wider transition-none"
                        >
                            <Unlock className="w-4 h-4" />
                            ADMIN OK
                        </button>
                    )}

                    {activeWorker && (
                        <div className="text-right flex items-center gap-3 pr-4 border-r border-slate-700">
                            <div>
                                <p className="text-sm font-bold text-white uppercase tracking-wider leading-none">{activeWorker.name}</p>
                                {activeWorker.role?.name && (
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">{activeWorker.role.name}</p>
                                )}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        title="Cerrar sesión"
                        className="flex items-center justify-center w-10 h-10 bg-slate-800 border border-slate-600 text-slate-300 hover:bg-red-600 hover:border-red-600 hover:text-white rounded-md transition-none"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* ══════════════════ BODY ════════════════════════════════════ */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT SIDEBAR: Categories & Operations ─────────────────────────── */}
                <aside className="flex flex-col w-[120px] flex-shrink-0 bg-slate-900 border-r border-slate-700">
                    {/* Categories */}
                    <div className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto">
                        {/* Play Zone link — above TODO */}
                        <OperationButton
                            icon={<Timer className="w-5 h-5" />}
                            label="JUEGOS"
                            onClick={() => navigate('/playzone')}
                        />
                        <div className="border-t border-slate-700/50 mt-1 mb-1" />
                        <CategoryButton
                            label="TODO"
                            active={selectedCategory === ALL_CATEGORY_ID}
                            onClick={() => setSelectedCategory(ALL_CATEGORY_ID)}
                        />
                        {categories.map((cat) => (
                            <CategoryButton
                                key={cat.id}
                                label={cat.name}
                                active={selectedCategory === cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                            />
                        ))}
                    </div>

                    {/* Operations */}
                    <div className="p-2 border-t border-slate-700 flex flex-col gap-2 relative">
                        <div className="text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest mb-1">SISTEMA</div>
                        <OperationButton
                            icon={<Clock className="w-5 h-5" />}
                            label="ASIST."
                            onClick={() => setIsAttendanceOpen(true)}
                        />
                        <OperationButton
                            icon={<Package className="w-5 h-5" />}
                            label="INVENT."
                            locked={!isAdminAuthenticated}
                            onClick={() => handleAdminAction(() => navigate('/admin/inventory'))}
                        />
                        <OperationButton
                            icon={<BarChart2 className="w-5 h-5" />}
                            label="REPORT."
                            locked={!isAdminAuthenticated}
                            onClick={() => handleAdminAction(() => navigate('/admin/reports'))}
                        />
                        <OperationButton
                            icon={<Banknote className="w-5 h-5" />}
                            label="CAJA"
                            locked={!isAdminAuthenticated}
                            onClick={() => handleAdminAction(() => navigate('/admin/cashier'))}
                        />
                        <OperationButton
                            icon={<Users className="w-5 h-5" />}
                            label="EMPL."
                            locked={!isAdminAuthenticated}
                            onClick={() => handleAdminAction(() => navigate('/admin/employees'))}
                        />
                    </div>
                </aside>

                {/* ── CENTER: Product grid ─────────────────────────────── */}
                <main className="flex-1 overflow-y-auto bg-slate-900 p-4">
                    {/* Toolbar row */}
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                        <p className="text-xs font-bold font-mono text-slate-500 tracking-widest uppercase">
                            [{visibleProducts.length} ITEMS]
                        </p>
                        <button
                            onClick={fetchProducts}
                            disabled={loading}
                            title="Recargar productos"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[11px] font-bold text-slate-400 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:text-white uppercase tracking-wider transition-none disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'SINC...' : 'SYNC'}
                        </button>
                    </div>

                    {/* States */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500">
                            <RefreshCw className="w-8 h-8 animate-spin text-brand-600" />
                            <p className="text-sm font-mono font-bold uppercase tracking-widest">Sincronizando DB...</p>
                        </div>
                    )}

                    {!loading && visibleProducts.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-600">
                            <Package className="w-12 h-12 opacity-50" />
                            <p className="text-sm font-bold uppercase tracking-widest">CERO RESULTADOS</p>
                        </div>
                    )}

                    {!loading && visibleProducts.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 cursor-default">
                            {visibleProducts.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    onAdd={addItem}
                                    cartQty={cartQtyFor(product.id)}
                                />
                            ))}
                        </div>
                    )}
                </main>

                {/* ── RIGHT SIDEBAR: Cart / Checkout (Receipt Style) ─────────────── */}
                <aside className="flex flex-col w-[320px] flex-shrink-0 bg-slate-50 border-l-2 border-slate-400">

                    {/* Receipt Header */}
                    <div className="flex flex-col items-center justify-center gap-1 px-4 py-4 bg-white border-b-2 border-slate-300">
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">TICKET WONKA</h2>
                        <p className="text-[10px] font-mono font-bold text-slate-500">{dateStr} - {timeStr}</p>
                        <p className="text-[10px] font-mono font-bold text-slate-500">CAJERO: {activeWorker?.name}</p>
                    </div>

                    {/* Cart Header Columns */}
                    {items.length > 0 && (
                        <div className="flex justify-between px-4 py-2 bg-slate-100 border-b border-slate-300 text-[10px] font-mono font-bold text-slate-600 uppercase">
                            <span className="flex-1">DESCRIPCIÓN</span>
                            <span className="w-16 text-center">CANT</span>
                            <span className="w-20 text-right">IMPORTE</span>
                        </div>
                    )}

                    {/* Cart items (scrollable) */}
                    <div className="flex-1 overflow-y-auto bg-white p-2">
                        {items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 py-12">
                                <ShoppingCart className="w-10 h-10 opacity-30 text-slate-400" />
                                <p className="text-xs font-bold uppercase tracking-widest text-center">
                                    TICKET VACÍO<br />ESPERANDO...
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
                            </div>
                        )}
                    </div>

                    {/* Total + actions */}
                    <div className="bg-slate-100 border-t-2 border-dashed border-slate-400 p-4 shrink-0 flex flex-col gap-4">

                        {/* Items count summary */}
                        {items.length > 0 && (
                            <div className="flex justify-between text-[11px] font-mono font-bold text-slate-500 mb-2 border-b border-slate-300 pb-2">
                                <span>LÍNEAS: {items.length}</span>
                                <span>TOTAL UDS: {items.reduce((s, i) => s + i.quantity, 0)}</span>
                            </div>
                        )}

                        {/* Total display */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-slate-800 uppercase tracking-widest">TOTAL A PAGAR</span>
                            <span className="text-3xl font-black text-slate-900 font-mono tracking-tighter">
                                {formatCurrency(total)}
                            </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-2">
                            {/* CANCEL button */}
                            <button
                                onClick={handleCancel}
                                disabled={items.length === 0 || paying}
                                className="
                                    flex-[0.4] flex items-center justify-center 
                                    h-14 rounded-md font-black text-xs uppercase tracking-widest
                                    focus:outline-none focus:ring-0
                                    bg-slate-200 border-2 border-slate-300
                                    text-slate-600 hover:bg-slate-300 hover:text-slate-800
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                    transition-none
                                "
                            >
                                <XCircle className="w-5 h-5" />
                            </button>

                            {/* PAY button */}
                            <button
                                onClick={() => setCheckoutOpen(true)}
                                disabled={items.length === 0 || paying}
                                className={`
                                    flex-1 flex items-center justify-center gap-2
                                    h-14 rounded-md font-black text-lg uppercase tracking-widest
                                    focus:outline-none focus:ring-0
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                    transition-none
                                    ${items.length > 0 && !paying
                                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-none'
                                        : 'bg-slate-300 text-slate-500 border-2 border-slate-400'
                                    }
                                `}
                            >
                                <CreditCard className="w-6 h-6 shrink-0" />
                                {paying ? 'PROC...' : 'COBRAR'}
                            </button>
                        </div>
                    </div>
                </aside>
            </div>

            {/* TOAST NOTIFICATION (Blocky, high contrast) */}
            {toast && (
                <div
                    role="alert"
                    aria-live="polite"
                    className={`
                        fixed bottom-8 left-1/2 -translate-x-1/2
                        flex items-center gap-3 px-6 py-4
                        rounded-sm text-sm font-bold uppercase tracking-widest shadow-none
                        border-2 z-50
                        ${toast.type === 'success'
                            ? 'bg-green-600 border-green-800 text-white'
                            : toast.type === 'error'
                                ? 'bg-red-600 border-red-800 text-white'
                                : 'bg-slate-800 border-slate-900 text-white'
                        }
                    `}
                >
                    {toast.message}
                </div>
            )}

            {/* ══════════════════ CHECKOUT MODAL ═════════════════════════ */}
            {checkoutOpen && (
                <CheckoutModal
                    total={total}
                    onConfirm={handlePay}
                    onCancel={() => setCheckoutOpen(false)}
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

function CategoryButton({
    label,
    active,
    onClick,
}: {
    label: string
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={`
                w-full px-2 py-3 rounded-md text-[11px] font-black uppercase text-center tracking-widest
                transition-none focus:outline-none focus:ring-0
                border-2
                ${active
                    ? 'bg-brand-600 text-white border-brand-600 shadow-none'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }
            `}
        >
            {label}
        </button>
    )
}

function OperationButton({
    label, icon, onClick, locked
}: {
    label: string; icon: React.ReactNode; onClick: () => void; locked?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`
                flex flex-col items-center justify-center gap-1 w-full py-2
                rounded-md border-2 transition-none relative
                ${!locked && label === 'ASIST.' ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white' : ''}
                ${!locked && label !== 'ASIST.' ? 'bg-amber-500/10 border-amber-600/30 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/50' : ''}
                ${locked ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:bg-slate-800 hover:text-slate-400' : ''}
            `}
        >
            {icon}
            <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
            {locked && <Lock className="w-3 h-3 absolute top-1 right-1 text-slate-600" />}
        </button>
    );
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
        <div className="flex items-center gap-2 p-2 border-b border-slate-200 hover:bg-slate-50 relative group">
            {/* Delete button (shows on hover) */}
            <button
                onClick={onRemove}
                className="absolute -left-2 top-1/2 -translate-y-1/2 bg-red-500 text-white p-1 rounded-sm opacity-0 group-hover:opacity-100 transition-none"
            >
                <Trash2 className="w-4 h-4" />
            </button>

            {/* Product Desc */}
            <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
                <p className="text-xs font-bold text-slate-800 leading-tight uppercase truncate">
                    {item.product.name}
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                    {formatCurrency(item.product.price)} UN.
                </p>
            </div>

            {/* Controls */}
            <div className="w-20 flex flex-col items-center shrink-0">
                <div className="flex items-center bg-slate-200 border border-slate-300 rounded-sm">
                    <button
                        onClick={onDecrement}
                        className="px-1.5 py-1 text-slate-600 hover:bg-slate-300 hover:text-slate-900 border-r border-slate-300 transition-none"
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-black font-mono text-slate-900 py-1">
                        {item.quantity}
                    </span>
                    <button
                        onClick={onIncrement}
                        disabled={isMaxed}
                        className="px-1.5 py-1 text-slate-600 hover:bg-slate-300 hover:text-slate-900 border-l border-slate-300 disabled:opacity-30 transition-none"
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
                <span className="text-sm font-black font-mono text-slate-900 tracking-tighter">
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
