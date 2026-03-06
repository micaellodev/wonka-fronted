// ============================================================
//  Admin Screen — Placeholder for back-office features
// ============================================================

import { useNavigate } from 'react-router-dom'
import { LogOut, Users, Package, BarChart2, Banknote, Timer } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export function AdminScreen() {
    const { activeWorker, logout } = useAuthStore()
    const navigate = useNavigate()

    const handleLogout = () => {
        logout()
        navigate('/')
    }

    return (
        <div className="min-h-screen flex flex-col items-center bg-surface-900 text-slate-200">
            {/* ── Top Nav ── */}
            <header className="w-full flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-white/5 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-600 shadow-md">
                        <span className="text-xl" role="img" aria-label="Wonka">🍫</span>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-xl font-bold text-white tracking-tight">Wonka Admin</h1>
                        <p className="text-xs text-brand-400 font-medium">Panel de Control</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-white">{activeWorker?.name}</p>
                        <p className="text-xs text-slate-400">{activeWorker?.role.name}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="hidden sm:inline font-medium">Salir</span>
                    </button>
                </div>
            </header>

            {/* ── Main Content ── */}
            <main className="flex-1 w-full max-w-6xl p-6 sm:p-10 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Inicio rápido</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Empleados */}
                    <div onClick={() => navigate('/admin/employees')} className="group flex flex-col gap-3 p-6 rounded-3xl bg-slate-800/40 border border-white/5 hover:bg-slate-800/60 hover:border-brand-500/30 transition-all cursor-pointer">
                        <div className="p-3 w-fit rounded-2xl bg-brand-500/10 text-brand-400 group-hover:scale-110 group-hover:bg-brand-500/20 transition-all">
                            <Users className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Empleados</h3>
                            <p className="text-sm text-slate-400 mt-1">Gestiona usuarios, roles y asistencias.</p>
                        </div>
                    </div>

                    {/* Inventario */}
                    <div onClick={() => navigate('/admin/inventory')} className="group flex flex-col gap-3 p-6 rounded-3xl bg-slate-800/40 border border-white/5 hover:bg-slate-800/60 hover:border-blue-500/30 transition-all cursor-pointer">
                        <div className="p-3 w-fit rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all">
                            <Package className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Inventario</h3>
                            <p className="text-sm text-slate-400 mt-1">Administra productos, categorías y stock.</p>
                        </div>
                    </div>

                    {/* Reportes */}
                    <div onClick={() => navigate('/admin/reports')} className="group flex flex-col gap-3 p-6 rounded-3xl bg-slate-800/40 border border-white/5 hover:bg-slate-800/60 hover:border-emerald-500/30 transition-all cursor-pointer">
                        <div className="p-3 w-fit rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all">
                            <BarChart2 className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Reportes</h3>
                            <p className="text-sm text-slate-400 mt-1">Analiza las ventas diarias y métricas.</p>
                        </div>
                    </div>

                    {/* Arqueo */}
                    <div onClick={() => navigate('/admin/cashier')} className="group flex flex-col gap-3 p-6 rounded-3xl bg-slate-800/40 border border-white/5 hover:bg-slate-800/60 hover:border-amber-500/30 transition-all cursor-pointer">
                        <div className="p-3 w-fit rounded-2xl bg-amber-500/10 text-amber-400 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                            <Banknote className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Arqueo de Caja</h3>
                            <p className="text-sm text-slate-400 mt-1">Control de ingresos y transacciones.</p>
                        </div>
                    </div>

                    {/* Zona de Juegos */}
                    <div onClick={() => navigate('/admin/playzone')} className="group flex flex-col gap-3 p-6 rounded-3xl bg-slate-800/40 border border-white/5 hover:bg-slate-800/60 hover:border-brand-500/30 transition-all cursor-pointer">
                        <div className="p-3 w-fit rounded-2xl bg-brand-500/10 text-brand-400 group-hover:scale-110 group-hover:bg-brand-500/20 transition-all">
                            <Timer className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Zona de Juegos</h3>
                            <p className="text-sm text-slate-400 mt-1">Registro y control de tiempo de niños.</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
