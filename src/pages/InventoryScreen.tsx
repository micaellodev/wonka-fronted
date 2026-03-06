import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Plus, Search, Edit2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Product, Category } from '@/types'

export function InventoryScreen() {
    const { tenantId } = useAuthStore()
    const navigate = useNavigate()

    const [products, setProducts] = useState<Product[]>([])
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [prodRes, catRes] = await Promise.all([
                api.inventory.products.get({ query: { tenantId, limit: 100, page: 1 } }),
                api.inventory.categories.get({ query: { tenantId } })
            ])

            if (!prodRes.error) {
                const response = prodRes.data as unknown as { data: Product[] }
                setProducts(response.data ?? [])
            }
            if (!catRes.error) {
                const response = catRes.data as unknown as { data: Category[] }
                setCategories(response.data ?? [])
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))

    function formatCurrency(v: number) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
    }

    return (
        <div className="min-h-screen bg-surface-900 text-slate-200 flex flex-col">
            <header className="px-6 py-4 bg-slate-800/80 border-b border-white/5 shadow-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 transition-colors rounded-xl font-medium text-white">Volver</button>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <Package className="w-5 h-5 text-brand-400" /> Inventario
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium text-white transition-all active:scale-95">
                        <Plus className="w-4 h-4" /> Nueva Categoría
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-xl font-medium text-white transition-all active:scale-95">
                        <Plus className="w-4 h-4" /> Nuevo Producto
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
                <div className="flex items-center gap-4 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar producto por nombre o SKU..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                    </div>
                </div>

                <div className="flex-1 bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-800/80 text-slate-400 text-sm border-b border-white/5 uppercase tracking-wider">
                                    <th className="px-4 py-3 font-semibold">SKU</th>
                                    <th className="px-4 py-3 font-semibold">Nombre</th>
                                    <th className="px-4 py-3 font-semibold">Categoría</th>
                                    <th className="px-4 py-3 font-semibold text-right">Precio Venta</th>
                                    <th className="px-4 py-3 font-semibold text-right">Costo</th>
                                    <th className="px-4 py-3 font-semibold text-center">Stock</th>
                                    <th className="px-4 py-3 font-semibold text-center">Estado</th>
                                    <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-400">Cargando productos...</td>
                                    </tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-400">No se encontraron productos.</td>
                                    </tr>
                                ) : (
                                    filteredProducts.map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-4 py-3 text-sm font-mono text-slate-300">{p.sku}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-white">{p.name}</td>
                                            <td className="px-4 py-3 text-sm text-slate-400">
                                                <span className="bg-slate-700/50 px-2 py-0.5 rounded-full text-xs">{p.category.name}</span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-green-400 font-medium text-right">{formatCurrency(p.price)}</td>
                                            <td className="px-4 py-3 text-sm text-slate-400 text-right">{formatCurrency(p.cost)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.stock <= 0 ? 'bg-red-500/10 text-red-400' : p.stock <= 5 ? 'bg-amber-500/10 text-amber-400' : 'bg-green-500/10 text-green-400'}`}>
                                                    {p.stock}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {p.isActive ? (
                                                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Activo"></span>
                                                ) : (
                                                    <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" title="Inactivo"></span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right space-x-2">
                                                <button className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Editar">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    )
}
