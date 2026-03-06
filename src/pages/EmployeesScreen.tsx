import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, UserCheck, UserX, Clock, BarChart2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { AttendanceRecord } from '@/types'

// Extending Worker type explicitly locally or importing it if updated.
export interface Worker {
    id: string;
    name: string;
    roleId: string;
    dni?: string | null;
    avatarUrl?: string | null;
    isActive: boolean;
    role: { id: string; name: string };
}

interface Role { id: string; name: string }

export function EmployeesScreen() {
    const { tenantId } = useAuthStore()
    const navigate = useNavigate()

    type TabType = 'empleados' | 'asistencia' | 'historial'
    const [activeTab, setActiveTab] = useState<TabType>('empleados')
    const [historyPeriod, setHistoryPeriod] = useState<'semana' | 'mes'>('semana')

    const [workers, setWorkers] = useState<Worker[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
    const [historyData, setHistoryData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
    const [formData, setFormData] = useState({ name: '', dni: '', roleId: '', isActive: true, pin: '', avatarUrl: '' })
    const [saving, setSaving] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)

    const fetchWorkers = useCallback(async () => {
        setLoading(true)
        try {
            const [wRes, rRes] = await Promise.all([
                api.hr.workers.get({ query: { tenantId } }),
                api.hr.roles.get({ query: { tenantId } })
            ])
            if (!wRes.error) {
                const response = wRes.data as unknown as { data: Worker[] }
                setWorkers(response.data ?? [])
            }
            if (!rRes.error) {
                const response = rRes.data as unknown as { data: Role[] }
                setRoles(response.data ?? [])
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId])

    const fetchAttendance = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.hr.attendance.get({ query: { tenantId } as any })
            if (!res.error) {
                const response = res.data as unknown as { data: AttendanceRecord[] }
                setAttendance(response.data ?? [])
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId])

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        try {
            const today = new Date()
            const startDate = new Date()

            if (historyPeriod === 'semana') {
                const day = startDate.getDay() || 7 // 1-7
                startDate.setDate(startDate.getDate() - day + 1)
            } else {
                startDate.setDate(1) // primer dia del mes
            }

            const startStr = startDate.toISOString().split('T')[0]
            const endStr = today.toISOString().split('T')[0]

            // We cast query to any to bypass eden strict type issues if they haven't synced yet
            const res = await api.hr.attendance.get({
                query: { tenantId, startDate: startStr, endDate: endStr, limit: 1000 } as any
            })

            if (!res.error) {
                const response = res.data as unknown as { data: AttendanceRecord[] }
                const records = response.data ?? []

                // Calculate elapsed days in the period
                // Set both to midnight to avoid partial day issues
                const d1 = new Date(startStr); d1.setHours(0, 0, 0, 0)
                const d2 = new Date(endStr); d2.setHours(0, 0, 0, 0)
                const timeDiff = d2.getTime() - d1.getTime()
                const daysElapsed = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1)

                const workersRes = await api.hr.workers.get({ query: { tenantId } })
                const allWorkers = !workersRes.error ? (workersRes.data as unknown as { data: Worker[] }).data : []

                const historical = allWorkers.map(w => {
                    const wRecords = records.filter(r => r.worker.id === w.id)
                    let totalHours = 0
                    let tardanzas = 0

                    const attendedDays = new Set()

                    wRecords.forEach(r => {
                        const rDate = new Date(r.checkIn)
                        attendedDays.add(rDate.toDateString())

                        const totalMinutes = rDate.getHours() * 60 + rDate.getMinutes()
                        if (totalMinutes > 17 * 60) tardanzas++ // Tarde if after 17:00

                        if (r.checkOut) {
                            const diff = new Date(r.checkOut).getTime() - rDate.getTime()
                            totalHours += diff / (1000 * 60 * 60)
                        }
                    })

                    const faltas = Math.max(0, daysElapsed - attendedDays.size)

                    return {
                        worker: w,
                        totalHours,
                        tardanzas,
                        faltas,
                        attendedDays: attendedDays.size
                    }
                })

                setHistoryData(historical)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [tenantId, historyPeriod])

    useEffect(() => {
        if (activeTab === 'empleados') fetchWorkers()
        else if (activeTab === 'asistencia') fetchAttendance()
        else fetchHistory()
    }, [activeTab, historyPeriod, fetchWorkers, fetchAttendance, fetchHistory])

    function formatDate(iso: string | null) {
        if (!iso) return '-'
        return new Date(iso).toLocaleString('es-CO', {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        })
    }

    function getDuration(checkIn: string, checkOut: string | null) {
        if (!checkOut) return 'En turno'
        const start = new Date(checkIn).getTime()
        const end = new Date(checkOut).getTime()
        const diffHours = (end - start) / (1000 * 60 * 60)
        return `${diffHours.toFixed(1)}h`
    }

    const todayRecords = attendance.filter(a => new Date(a.checkIn).toDateString() === new Date().toDateString())

    function getAttendanceStatus(workerId: string) {
        const record = todayRecords.find(r => r.worker.id === workerId)
        if (!record) {
            const now = new Date()
            if (now.getHours() < 17) return { label: 'PENDIENTE', color: 'text-slate-400 bg-slate-500/10' }
            return { label: 'FALTA', color: 'text-red-400 bg-red-500/10' }
        }

        const date = new Date(record.checkIn)
        const totalMinutes = date.getHours() * 60 + date.getMinutes()
        const cutoffMinutes = 17 * 60

        if (totalMinutes <= cutoffMinutes) {
            return { label: 'A TIEMPO', color: 'text-green-400 bg-green-500/10' }
        } else {
            return { label: 'TARDE', color: 'text-amber-400 bg-amber-500/10' }
        }
    }

    const openCreateModal = () => {
        setEditingWorker(null)
        setFormData({ name: '', dni: '', roleId: roles[0]?.id || '', isActive: true, pin: '', avatarUrl: '' })
        setIsModalOpen(true)
    }

    const openEditModal = (w: Worker) => {
        setEditingWorker(w)
        setFormData({
            name: w.name,
            dni: w.dni || '',
            avatarUrl: w.avatarUrl || '',
            roleId: w.roleId || roles.find(r => r.name === w.role.name)?.id || '',
            isActive: w.isActive, pin: ''
        })
        setIsModalOpen(true)
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploadingImage(true)

            // Usamos un FormData standard o el body de la petición, Elysia Eden lo convierte automáticamente
            const res = await api.upload.post({
                tenantId,
                file,
                folder: 'avatars'
            })

            if (!res.error) {
                const response = res.data as unknown as { data: { url: string } }
                setFormData(prev => ({ ...prev, avatarUrl: response.data.url }))
            } else {
                alert("Error subiendo la foto.")
            }
        } catch (error) {
            console.error("Error al subir archivo", error)
            alert("Hubo un problema al subir la foto.")
        } finally {
            setUploadingImage(false)
        }
    }

    const handleSaveWorker = async () => {
        if (!formData.name || !formData.roleId) return
        setSaving(true)
        try {
            if (editingWorker) {
                await api.hr.workers({ id: editingWorker.id }).patch({
                    query: { tenantId },
                    ...({
                        name: formData.name,
                        roleId: formData.roleId,
                        isActive: formData.isActive,
                        ...(formData.dni ? { dni: formData.dni } : {}),
                        ...(formData.avatarUrl ? { avatarUrl: formData.avatarUrl } : {})
                    } as any),
                    ...(formData.pin ? { pin: formData.pin } : {})
                } as any)
            } else {
                await api.hr.workers.post({
                    tenantId,
                    name: formData.name,
                    roleId: formData.roleId,
                    ...(formData.dni ? { dni: formData.dni } : {}),
                    ...(formData.avatarUrl ? { avatarUrl: formData.avatarUrl } : {}),
                    ...(formData.pin ? { pin: formData.pin } : {})
                } as any)
            }
            setIsModalOpen(false)
            fetchWorkers()
        } catch (e) {
            console.error(e)
            alert("Error guardando el empleado. Verifique los datos o el PIN.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-surface-900 text-slate-200 flex flex-col">
            <header className="px-6 py-4 bg-slate-800/80 border-b border-white/5 shadow-md flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 transition-colors rounded-xl font-medium text-white">Volver</button>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <Users className="w-5 h-5 text-brand-400" /> Empleados y Asistencia
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {activeTab === 'empleados' && (
                        <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-xl font-medium text-white transition-all active:scale-95">
                            <Plus className="w-4 h-4" /> Nuevo Empleado
                        </button>
                    )}
                </div>
            </header>

            <div className="px-6 pt-6 shrink-0 flex items-center justify-between">
                <div className="flex space-x-2 bg-slate-800/50 p-1.5 rounded-xl w-fit border border-slate-700/50">
                    <button
                        onClick={() => setActiveTab('empleados')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'empleados' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            }`}
                    >
                        <Users className="w-4 h-4" /> Directorio
                    </button>
                    <button
                        onClick={() => setActiveTab('asistencia')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'asistencia' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            }`}
                    >
                        <Clock className="w-4 h-4" /> Asistencia de Hoy
                    </button>
                    <button
                        onClick={() => setActiveTab('historial')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'historial' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            }`}
                    >
                        <BarChart2 className="w-4 h-4" /> Historial y Métricas
                    </button>
                </div>

                {activeTab === 'asistencia' && (
                    <div className="text-sm text-slate-400 font-medium">
                        Fecha: {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                )}

                {activeTab === 'historial' && (
                    <div className="flex bg-slate-800 border border-slate-700/50 rounded-lg p-1">
                        <button
                            onClick={() => setHistoryPeriod('semana')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${historyPeriod === 'semana' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            Esta Semana
                        </button>
                        <button
                            onClick={() => setHistoryPeriod('mes')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${historyPeriod === 'mes' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            Este Mes
                        </button>
                    </div>
                )}
            </div>

            <main className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
                <div className="flex-1 bg-slate-800/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                    <div className="overflow-x-auto flex-1">
                        {activeTab === 'empleados' && (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800/80 text-slate-400 text-sm border-b border-white/5 uppercase tracking-wider">
                                        <th className="px-4 py-3 font-semibold">Nombre</th>
                                        <th className="px-4 py-3 font-semibold">Rol</th>
                                        <th className="px-4 py-3 font-semibold text-center">Estado</th>
                                        <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">Cargando empleados...</td>
                                        </tr>
                                    ) : workers.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">No hay empleados registrados.</td>
                                        </tr>
                                    ) : (
                                        workers.map((w) => (
                                            <tr key={w.id} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="px-4 py-3 text-sm font-medium text-white flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden border border-slate-600">
                                                        <img src={w.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${w.name}`} className="w-full h-full object-cover" alt="avatar" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">{w.name}</div>
                                                        {w.dni && <div className="text-xs text-slate-400 font-mono">DNI: {w.dni}</div>}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-400">
                                                    <span className="bg-slate-700/50 px-2 py-0.5 rounded-full text-xs">{w.role.name}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {w.isActive ? (
                                                        <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium px-2 py-1 bg-green-500/10 rounded-full">
                                                            <UserCheck className="w-3.5 h-3.5" /> Activo
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-slate-400 text-xs font-medium px-2 py-1 bg-slate-500/10 rounded-full">
                                                            <UserX className="w-3.5 h-3.5" /> Inactivo
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => openEditModal(w)} className="text-sm font-medium text-brand-400 hover:text-brand-300">Editar</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}

                        {activeTab === 'asistencia' && (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800/80 text-slate-400 text-sm border-b border-white/5 uppercase tracking-wider">
                                        <th className="px-4 py-3 font-semibold">Empleado</th>
                                        <th className="px-4 py-3 font-semibold text-center">Estado (Hoy)</th>
                                        <th className="px-4 py-3 font-semibold">Hora de Entrada</th>
                                        <th className="px-4 py-3 font-semibold">Hora de Salida</th>
                                        <th className="px-4 py-3 font-semibold text-right">Duración de Turno</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400">Cargando registros...</td>
                                        </tr>
                                    ) : workers.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400">No hay empleados registrados.</td>
                                        </tr>
                                    ) : (
                                        workers.map((w) => {
                                            const record = todayRecords.find(r => r.worker.id === w.id)
                                            const status = getAttendanceStatus(w.id)

                                            return (
                                                <tr key={w.id} className="hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-3 text-sm font-medium text-white flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden border border-slate-600">
                                                            <img src={w.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${w.name}`} className="w-full h-full object-cover" alt="avatar" />
                                                        </div>
                                                        {w.name}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${status.color}`}>
                                                            {status.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                                                        {record?.checkIn ? formatDate(record.checkIn) : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                                                        {record?.checkOut ? formatDate(record.checkOut) : (
                                                            record ? <span className="text-amber-400 text-xs font-semibold bg-amber-500/10 px-2 py-1 rounded">EN TURNO</span> : '-'
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-400">
                                                        {record ? getDuration(record.checkIn, record.checkOut) : '-'}
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}

                        {activeTab === 'historial' && (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800/80 text-slate-400 text-sm border-b border-white/5 uppercase tracking-wider">
                                        <th className="px-4 py-3 font-semibold">Empleado</th>
                                        <th className="px-4 py-3 font-semibold text-center">Horas Trabajadas</th>
                                        <th className="px-4 py-3 font-semibold text-center">Tardanzas</th>
                                        <th className="px-4 py-3 font-semibold text-center">Faltas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">Calculando métricas...</td>
                                        </tr>
                                    ) : historyData.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">No hay datos suficientes en este periodo.</td>
                                        </tr>
                                    ) : (
                                        historyData.map((h) => (
                                            <tr key={h.worker.id} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="px-4 py-4 text-sm font-medium text-white flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden border border-slate-600 shrink-0">
                                                        <img src={h.worker.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${h.worker.name}`} className="w-full h-full object-cover" alt="avatar" />
                                                    </div>
                                                    {h.worker.name}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-lg font-bold text-brand-400">{h.totalHours.toFixed(1)} <span className="text-xs text-slate-400 font-normal">hrs</span></span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-lg font-bold ${h.tardanzas > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                                        {h.tardanzas}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-lg font-bold ${h.faltas > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                                        {h.faltas}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <label className="w-16 h-16 rounded-2xl bg-slate-700 overflow-hidden shadow-inner shrink-0 cursor-pointer relative group">
                                <img src={formData.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${formData.name || 'default'}`} className={`w-full h-full object-cover ${uploadingImage ? 'opacity-50' : ''}`} alt="avatar prep" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] font-bold text-white text-center px-1 uppercase tracking-wider">Subir Foto</span>
                                </div>
                                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                            </label>
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight">{editingWorker ? 'Editar Empleado' : 'Nuevo Empleado'}</h2>
                                <p className="text-sm text-slate-400">{editingWorker ? 'Modifica los datos y acceso.' : 'Crea un nuevo perfil para el local.'}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-1 ml-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
                                        placeholder="Ej. Carlos Mendoza"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-1 ml-1">DNI / Documento</label>
                                    <input
                                        type="text"
                                        value={formData.dni}
                                        onChange={e => setFormData({ ...formData, dni: e.target.value.replace(/\D/g, '') })}
                                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1 ml-1">Rol u Ocupación</label>
                                <select
                                    value={formData.roleId}
                                    onChange={e => setFormData({ ...formData, roleId: e.target.value })}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 transition-colors"
                                >
                                    {roles.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1 ml-1">PIN de Acceso (5 dígitos)</label>
                                <input
                                    type="text"
                                    maxLength={5}
                                    value={formData.pin}
                                    onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
                                    placeholder={editingWorker ? "En blanco si no desea cambiarlo" : "Máximo 5 dígitos"}
                                />
                            </div>

                            {editingWorker && (
                                <div className="flex items-center gap-3 pt-2">
                                    <input
                                        type="checkbox"
                                        id="active-chk"
                                        checked={formData.isActive}
                                        onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-700 bg-slate-900/50 text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-800"
                                    />
                                    <label htmlFor="active-chk" className="text-sm font-medium text-slate-300">Empleado con cuenta activa (Puede entrar)</label>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-2">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 py-3 font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveWorker}
                                disabled={saving || !formData.name}
                                className="flex-1 py-3 font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                            >
                                {saving ? "Guardando..." : "Guardar Empleado"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
