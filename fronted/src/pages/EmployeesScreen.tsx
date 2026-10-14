import { useEffect, useState, useCallback } from 'react'
import { Users, Plus, UserCheck, UserX, Clock, BarChart2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { PinPad } from '@/components/PinPad'
import type { AttendanceRecord } from '@/types'

const AVATAR_FALLBACK = import.meta.env.VITE_AVATAR_FALLBACK_SERVICE || '${AVATAR_FALLBACK}'

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
interface HistoryRow { worker: Worker; totalHours: number; tardanzas: number; faltas: number; attendedDays: number }

export function EmployeesScreen() {
 const { tenantId } = useAuthStore()

 type TabType = 'empleados' | 'asistencia' | 'historial'
 const [activeTab, setActiveTab] = useState<TabType>('empleados')
 const [historyPeriod, setHistoryPeriod] = useState<'semana' | 'mes'>('semana')

 const [workers, setWorkers] = useState<Worker[]>([])
 const [roles, setRoles] = useState<Role[]>([])
 const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
 const [historyData, setHistoryData] = useState<HistoryRow[]>([])
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState<string | null>(null)

 // Modal state
 const [isModalOpen, setIsModalOpen] = useState(false)
 const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
 const [formData, setFormData] = useState({ name: '', dni: '', roleId: '', isActive: true, pin: '', approvalCode: '', avatarUrl: '' })
 const [saving, setSaving] = useState(false)
 const [uploadingImage, setUploadingImage] = useState(false)
 const [showAdminPinModal, setShowAdminPinModal] = useState(false)
 const [adminPinError, setAdminPinError] = useState(false)
 const [saveError, setSaveError] = useState<string | null>(null)

 // New role modal state
 const [showNewRoleModal, setShowNewRoleModal] = useState(false)
 const [newRoleStep, setNewRoleStep] = useState<'name' | 'pin'>('name')
 const [newRoleName, setNewRoleName] = useState('')
 const [newRoleSaving, setNewRoleSaving] = useState(false)
 const [newRolePinError, setNewRolePinError] = useState(false)
 const [newRoleError, setNewRoleError] = useState<string | null>(null)

 const fetchWorkers = useCallback(async () => {
 setLoading(true)
 setLoadError(null)
 try {
 const [wRes, rRes] = await Promise.all([
 api.hr.workers.get({ query: { tenantId } }),
 api.hr.roles.get({ query: { tenantId } })
 ])
 if (wRes.error || rRes.error) setLoadError("No se pudo cargar la información.")
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
 setLoadError("Error de conexión.")
 } finally {
 setLoading(false)
 }
 }, [tenantId])

 const fetchAttendance = useCallback(async () => {
 setLoading(true)
 setLoadError(null)
 try {
 const res = await api.hr.attendance.get({ query: { tenantId } })
 if (!res.error) {
 const response = res.data as unknown as { data: AttendanceRecord[] }
 setAttendance(response.data ?? [])
 } else setLoadError("No se pudo cargar la asistencia.")
 } catch (e) {
 console.error(e)
 setLoadError("Error de conexión.")
 } finally {
 setLoading(false)
 }
 }, [tenantId])

 const fetchHistory = useCallback(async () => {
 setLoading(true)
 setLoadError(null)
 try {
 const today = new Date()
 const startDate = new Date()

 if (historyPeriod === 'semana') {
 const day = startDate.getDay() || 7 // 1-7
 startDate.setDate(startDate.getDate() - day + 1)
 } else {
 startDate.setDate(1) // primer dia del mes
 }

 const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
 const startStr = ymd(startDate)
 const endStr = ymd(today)

 // We cast query to any to bypass eden strict type issues if they haven't synced yet
 const res = await api.hr.attendance.get({
 query: { tenantId, startDate: startStr, endDate: endStr, limit: 1000 }
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
 } else setLoadError("No se pudo cargar el historial.")
 } catch (e) {
 console.error(e)
 setLoadError("Error de conexión.")
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
 if (now.getHours() < 17) return { label: 'PENDIENTE', color: 'text-muted-foreground bg-muted' }
 return { label: 'FALTA', color: 'text-destructive bg-danger-soft' }
 }

 const date = new Date(record.checkIn)
 const totalMinutes = date.getHours() * 60 + date.getMinutes()
 const cutoffMinutes = 17 * 60

 if (totalMinutes <= cutoffMinutes) {
 return { label: 'A TIEMPO', color: 'text-secondary-500 bg-secondary-500/10' }
 } else {
 return { label: 'TARDE', color: 'text-accent-500 bg-accent-100' }
 }
 }

 const openCreateModal = () => {
 setEditingWorker(null)
 setFormData({ name: '', dni: '', roleId: roles[0]?.id || '', isActive: true, pin: '', approvalCode: '', avatarUrl: '' })
 setIsModalOpen(true)
 }

 const openEditModal = (w: Worker) => {
 setEditingWorker(w)
 setFormData({
 name: w.name,
 dni: w.dni || '',
 avatarUrl: w.avatarUrl || '',
 roleId: w.roleId || roles.find(r => r.name === w.role.name)?.id || '',
 isActive: w.isActive, pin: '', approvalCode: ''
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

 const openNewRoleModal = () => {
 setNewRoleName('')
 setNewRoleError(null)
 setNewRolePinError(false)
 setNewRoleStep('name')
 setShowNewRoleModal(true)
 }

 const handleNewRoleNameSubmit = () => {
 if (!newRoleName.trim()) return
 setNewRoleError(null)
 setNewRoleStep('pin')
 }

 const handleNewRolePinComplete = async (adminPin: string) => {
 setNewRoleSaving(true)
 setNewRolePinError(false)
 setNewRoleError(null)
 try {
 const res = await api.hr.roles.post({ tenantId, name: newRoleName.trim(), adminPin })
 if (res.error) {
 const msg = (res.error.value as { message?: string })?.message ?? 'Error creando el rol.'
 setNewRolePinError(true)
 setNewRoleError(msg)
 return
 }
 setShowNewRoleModal(false)
 fetchWorkers()
 } catch (e) {
 console.error(e)
 setNewRolePinError(true)
 setNewRoleError('Error creando el rol.')
 } finally {
 setNewRoleSaving(false)
 }
 }

 const selectedRole = roles.find(r => r.id === formData.roleId)
 const isAdminRole = selectedRole?.name === 'ADMIN' || selectedRole?.name === 'ADMINISTRADOR'

 // Same rules as the backend: PIN 5–6 digits, approval code exactly 6 (both optional).
 const formInvalid =
 (formData.pin !== '' && !/^\d{5,6}$/.test(formData.pin)) ||
 (isAdminRole && formData.approvalCode !== '' && !/^\d{6}$/.test(formData.approvalCode))

 const handleSaveWorker = () => {
 if (!formData.name || !formData.roleId || formInvalid) return
 setSaveError(null)
 setAdminPinError(false)
 setShowAdminPinModal(true)
 }

 const performSaveWorker = async (adminPin: string) => {
 setSaving(true)
 setAdminPinError(false)
 setSaveError(null)
 try {
 const adminPayload = isAdminRole && formData.approvalCode
 ? { approvalCode: formData.approvalCode }
 : {}

 let res
 if (editingWorker) {
 res = await api.hr.workers({ id: editingWorker.id }).patch(
 {
 name: formData.name,
 roleId: formData.roleId,
 isActive: formData.isActive,
 ...(formData.dni ? { dni: formData.dni } : {}),
 ...(formData.avatarUrl ? { avatarUrl: formData.avatarUrl } : {}),
 ...(formData.pin ? { pin: formData.pin } : {}),
 ...adminPayload,
 adminPin,
 },
 { query: { tenantId } }
 )
 } else {
 res = await api.hr.workers.post({
 tenantId,
 name: formData.name,
 roleId: formData.roleId,
 ...(formData.dni ? { dni: formData.dni } : {}),
 ...(formData.avatarUrl ? { avatarUrl: formData.avatarUrl } : {}),
 ...(formData.pin ? { pin: formData.pin } : {}),
 ...adminPayload,
 adminPin,
 })
 }

 if (res.error) {
 const msg = (res.error.value as { message?: string })?.message ?? 'PIN de administrador incorrecto o error al guardar.'
 setAdminPinError(true)
 setSaveError(msg)
 return
 }

 setShowAdminPinModal(false)
 setIsModalOpen(false)
 // Credentials are returned only once on creation; show them to the admin now.
 const meta = (res.data as { meta?: { rawPin?: string; rawApprovalCode?: string } })?.meta
 if (!editingWorker && meta?.rawPin) {
 alert(`Empleado creado.\nPIN de acceso: ${meta.rawPin}${meta.rawApprovalCode ? `\nCódigo de aprobación: ${meta.rawApprovalCode}` : ''}\n\nAnótalos ahora: no se podrán volver a ver.`)
 }
 fetchWorkers()
 } catch (e) {
 console.error(e)
 setAdminPinError(true)
 setSaveError("Error guardando el empleado. Verifique los datos o el PIN.")
 } finally {
 setSaving(false)
 }
 }

 return (
 <div className="flex flex-col -m-4 sm:-m-6">
 <header className="px-6 py-4 bg-card border-b border-border flex items-center justify-between shrink-0">
 <div className="flex items-center gap-4">
  <div>
 <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
 <Users className="w-5 h-5 text-primary" /> Empleados y Asistencia
 </h1>
 </div>
 </div>
 <div className="flex items-center gap-3">
 {activeTab === 'empleados' && (
 <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl font-medium text-primary-foreground transition-all active:scale-95">
 <Plus className="w-4 h-4" /> Nuevo Empleado
 </button>
 )}
 </div>
 </header>

 <div className="px-6 pt-6 shrink-0 flex items-center justify-between">
 <div className="flex space-x-2 bg-muted p-1.5 rounded-xl w-fit border border-border">
 <button
 onClick={() => setActiveTab('empleados')}
 className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'empleados' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 <Users className="w-4 h-4" /> Directorio
 </button>
 <button
 onClick={() => setActiveTab('asistencia')}
 className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'asistencia' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 <Clock className="w-4 h-4" /> Asistencia de Hoy
 </button>
 <button
 onClick={() => setActiveTab('historial')}
 className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'historial' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 <BarChart2 className="w-4 h-4" /> Historial y Metricas
 </button>
 </div>

 {activeTab === 'asistencia' && (
 <div className="text-sm text-muted-foreground font-medium">
 Fecha: {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
 </div>
 )}

 {activeTab === 'historial' && (
 <div className="flex bg-muted border border-border rounded-lg p-1">
 <button
 onClick={() => setHistoryPeriod('semana')}
 className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${historyPeriod === 'semana' ? 'bg-muted text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
 >
 Esta Semana
 </button>
 <button
 onClick={() => setHistoryPeriod('mes')}
 className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${historyPeriod === 'mes' ? 'bg-muted text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
 >
 Este Mes
 </button>
 </div>
 )}
 </div>

 <main className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
 {loadError && (
 <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
 <span>{loadError}</span>
 <button className="font-semibold underline" onClick={() => (activeTab === 'empleados' ? fetchWorkers() : activeTab === 'asistencia' ? fetchAttendance() : fetchHistory())}>Reintentar</button>
 </div>
 )}
 <div className="flex-1 bg-muted border border-border rounded-2xl overflow-hidden flex flex-col">
 <div className="overflow-x-auto flex-1">
 {activeTab === 'empleados' && (
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-muted text-muted-foreground text-sm border-b border-border uppercase tracking-wider">
 <th className="px-4 py-3 font-semibold">Nombre</th>
 <th className="px-4 py-3 font-semibold">Rol</th>
 <th className="px-4 py-3 font-semibold text-center">Estado</th>
 <th className="px-4 py-3 font-semibold text-right">Acciones</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {loading ? (
 <tr>
 <td colSpan={4} className="p-8 text-center text-muted-foreground">Cargando empleados...</td>
 </tr>
 ) : workers.length === 0 ? (
 <tr>
 <td colSpan={4} className="p-8 text-center text-muted-foreground">No hay empleados registrados.</td>
 </tr>
 ) : (
 workers.map((w) => (
 <tr key={w.id} className="hover:bg-muted transition-colors">
 <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
 <div className="w-8 h-8 rounded-full bg-muted overflow-hidden border border-border">
 <img src={w.avatarUrl || `${AVATAR_FALLBACK}?seed=${w.name}`} className="w-full h-full object-cover" alt="avatar" />
 </div>
 <div>
 <div className="font-semibold">{w.name}</div>
 {w.dni && <div className="text-xs text-muted-foreground font-mono">DNI: {w.dni}</div>}
 </div>
 </td>
 <td className="px-4 py-3 text-sm text-muted-foreground">
 <span className="bg-muted px-2 py-0.5 rounded-full text-xs">{w.role.name}</span>
 </td>
 <td className="px-4 py-3 text-center">
 {w.isActive ? (
 <span className="inline-flex items-center gap-1 text-secondary-500 text-xs font-medium px-2 py-1 bg-secondary-500/10 rounded-full">
 <UserCheck className="w-3.5 h-3.5" /> Activo
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-medium px-2 py-1 bg-muted rounded-full">
 <UserX className="w-3.5 h-3.5" /> Inactivo
 </span>
 )}
 </td>
 <td className="px-4 py-3 text-right">
 <button onClick={() => openEditModal(w)} className="text-sm font-medium text-primary hover:text-primary">Editar</button>
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
 <tr className="bg-muted text-muted-foreground text-sm border-b border-border uppercase tracking-wider">
 <th className="px-4 py-3 font-semibold">Empleado</th>
 <th className="px-4 py-3 font-semibold text-center">Estado (Hoy)</th>
 <th className="px-4 py-3 font-semibold">Hora de Entrada</th>
 <th className="px-4 py-3 font-semibold">Hora de Salida</th>
 <th className="px-4 py-3 font-semibold text-right">Duración de Turno</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {loading ? (
 <tr>
 <td colSpan={5} className="p-8 text-center text-muted-foreground">Cargando registros...</td>
 </tr>
 ) : workers.length === 0 ? (
 <tr>
 <td colSpan={5} className="p-8 text-center text-muted-foreground">No hay empleados registrados.</td>
 </tr>
 ) : (
 workers.map((w) => {
 const record = todayRecords.find(r => r.worker.id === w.id)
 const status = getAttendanceStatus(w.id)

 return (
 <tr key={w.id} className="hover:bg-muted transition-colors">
 <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
 <div className="w-8 h-8 rounded-full bg-muted overflow-hidden border border-border">
 <img src={w.avatarUrl || `${AVATAR_FALLBACK}?seed=${w.name}`} className="w-full h-full object-cover" alt="avatar" />
 </div>
 {w.name}
 </td>
 <td className="px-4 py-3 text-center">
 <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${status.color}`}>
 {status.label}
 </span>
 </td>
 <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
 {record?.checkIn ? formatDate(record.checkIn) : '-'}
 </td>
 <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
 {record?.checkOut ? formatDate(record.checkOut) : (
 record ? <span className="text-accent-500 text-xs font-semibold bg-accent-100 px-2 py-1 rounded">EN TURNO</span> : '-'
 )}
 </td>
 <td className="px-4 py-3 text-sm text-right font-medium text-muted-foreground">
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
 <tr className="bg-muted text-muted-foreground text-sm border-b border-border uppercase tracking-wider">
 <th className="px-4 py-3 font-semibold">Empleado</th>
 <th className="px-4 py-3 font-semibold text-center">Horas Trabajadas</th>
 <th className="px-4 py-3 font-semibold text-center">Tardanzas</th>
 <th className="px-4 py-3 font-semibold text-center">Faltas</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {loading ? (
 <tr>
 <td colSpan={4} className="p-8 text-center text-muted-foreground">Calculando métricas...</td>
 </tr>
 ) : historyData.length === 0 ? (
 <tr>
 <td colSpan={4} className="p-8 text-center text-muted-foreground">No hay datos suficientes en este periodo.</td>
 </tr>
 ) : (
 historyData.map((h) => (
 <tr key={h.worker.id} className="hover:bg-muted transition-colors">
 <td className="px-4 py-4 text-sm font-medium text-foreground flex items-center gap-2">
 <div className="w-8 h-8 rounded-full bg-muted overflow-hidden border border-border shrink-0">
 <img src={h.worker.avatarUrl || `${AVATAR_FALLBACK}?seed=${h.worker.name}`} className="w-full h-full object-cover" alt="avatar" />
 </div>
 {h.worker.name}
 </td>
 <td className="px-4 py-3 text-center">
 <span className="text-lg font-bold text-primary">{h.totalHours.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">hrs</span></span>
 </td>
 <td className="px-4 py-3 text-center">
 <span className={`text-lg font-bold ${h.tardanzas > 0 ? 'text-accent-500' : 'text-muted-foreground'}`}>
 {h.tardanzas}
 </span>
 </td>
 <td className="px-4 py-3 text-center">
 <span className={`text-lg font-bold ${h.faltas > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
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
 <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center p-4 z-50">
 <div className="bg-muted border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-6">
 <div className="flex items-center gap-4">
 <label className="w-16 h-16 rounded-2xl bg-muted overflow-hidden shadow-inner shrink-0 cursor-pointer relative group">
 <img src={formData.avatarUrl || `${AVATAR_FALLBACK}?seed=${formData.name || 'default'}`} className={`w-full h-full object-cover ${uploadingImage ? 'opacity-50' : ''}`} alt="avatar prep" />
 <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
 <span className="text-[10px] font-bold text-foreground text-center px-1 uppercase tracking-wider">Subir Foto</span>
 </div>
 <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
 </label>
 <div>
 <h2 className="text-xl font-bold text-foreground tracking-tight">{editingWorker ? 'Editar Empleado' : 'Nuevo Empleado'}</h2>
 <p className="text-sm text-muted-foreground">{editingWorker ? 'Modifica los datos y acceso.' : 'Crea un nuevo perfil para el local.'}</p>
 </div>
 </div>

 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-semibold text-muted-foreground mb-1 ml-1">Nombre Completo</label>
 <input
 type="text"
 value={formData.name}
 onChange={e => setFormData({ ...formData, name: e.target.value })}
 className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
 placeholder="Ej. Carlos Mendoza"
 />
 </div>
 <div>
 <label className="block text-sm font-semibold text-muted-foreground mb-1 ml-1">DNI / Documento</label>
 <input
 type="text"
 value={formData.dni}
 onChange={e => setFormData({ ...formData, dni: e.target.value.replace(/\D/g, '') })}
 className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
 placeholder="Opcional"
 />
 </div>
 </div>

 <div>
 <div className="flex items-center justify-between mb-1 ml-1">
 <label className="block text-sm font-semibold text-muted-foreground">Rol u Ocupacion</label>
 <button
 type="button"
 onClick={openNewRoleModal}
 className="text-xs font-semibold text-primary hover:text-primary"
 >
 + Nueva categoría de rol
 </button>
 </div>
 <select
 value={formData.roleId}
 onChange={e => setFormData({ ...formData, roleId: e.target.value })}
 className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:border-primary transition-colors"
 >
 {roles.map(r => (
 <option key={r.id} value={r.id}>{r.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-sm font-semibold text-muted-foreground mb-1 ml-1">PIN de Acceso (5 o 6 dígitos)</label>
 <input
 type="text"
 inputMode="numeric"
 maxLength={6}
 value={formData.pin}
 onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
 className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
 placeholder={editingWorker ? "En blanco si no desea cambiarlo" : "En blanco = se genera uno"}
 />
 </div>

 {isAdminRole && (
 <div>
 <label className="block text-sm font-semibold text-muted-foreground mb-1 ml-1">Código de Aprobación del Dueño (6 digitos)</label>
 <input
 type="text"
 maxLength={6}
 value={formData.approvalCode}
 onChange={e => setFormData({ ...formData, approvalCode: e.target.value.replace(/\D/g, '') })}
 className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
 placeholder={editingWorker ? (formData.approvalCode ? "Nuevo código" : "En blanco si no desea cambiarlo") : "6 dígitos (en blanco = se genera)"}
 />
 <p className="text-xs text-muted-foreground mt-1 ml-1">Solo los dueños/administradores necesitan este código para aprobar anulaciones y cierre de caja.</p>
 </div>
 )}

 {editingWorker && (
 <div className="flex items-center gap-3 pt-2">
 <input
 type="checkbox"
 id="active-chk"
 checked={formData.isActive}
 onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
 className="w-5 h-5 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-slate-800"
 />
 <label htmlFor="active-chk" className="text-sm font-medium text-muted-foreground">Empleado con cuenta activa (Puede entrar)</label>
 </div>
 )}
 </div>

 <div className="flex gap-3 mt-2">
 <button
 onClick={() => setIsModalOpen(false)}
 className="flex-1 py-3 font-semibold text-muted-foreground bg-muted hover:bg-muted rounded-xl transition-colors"
 >
 Cancelar
 </button>
 <button
 onClick={handleSaveWorker}
 disabled={saving || !formData.name || formInvalid}
 className="flex-1 py-3 font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
 >
 {saving ? "Guardando..." : "Guardar Empleado"}
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Admin PIN confirmation modal */}
 {showAdminPinModal && (
 <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center p-4 z-[60]">
 <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-5">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-bold text-foreground">PIN de Administrador</h2>
 <button
 onClick={() => { if (!saving) setShowAdminPinModal(false) }}
 className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 <p className="text-center text-sm text-muted-foreground">
 Ingresa el PIN de un administrador (5 o 6 dígitos) para confirmar este cambio de empleado.
 </p>
 <PinPad onComplete={performSaveWorker} disabled={saving} hasError={adminPinError} />
 {saveError && (
 <p className="text-center text-sm text-primary">{saveError}</p>
 )}
 </div>
 </div>
 )}

 {/* New role modal */}
 {showNewRoleModal && (
 <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center p-4 z-[60]">
 <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-5">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-bold text-foreground">Nueva Categoría de Rol</h2>
 <button
 onClick={() => { if (!newRoleSaving) setShowNewRoleModal(false) }}
 className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {newRoleStep === 'name' ? (
 <>
 <div>
 <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Nombre del rol</label>
 <input
 type="text"
 autoFocus
 value={newRoleName}
 onChange={e => setNewRoleName(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleNewRoleNameSubmit()}
 className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
 placeholder="Ej. Supervisor"
 />
 </div>
 <button
 onClick={handleNewRoleNameSubmit}
 disabled={!newRoleName.trim()}
 className="w-full py-3 font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
 >
 Continuar
 </button>
 </>
 ) : (
 <>
 <p className="text-center text-sm text-muted-foreground">
 Ingresa el PIN de un administrador (5 o 6 dígitos) para crear el rol "{newRoleName.trim()}".
 </p>
 <PinPad onComplete={handleNewRolePinComplete} disabled={newRoleSaving} hasError={newRolePinError} />
 {newRoleError && (
 <p className="text-center text-sm text-primary">{newRoleError}</p>
 )}
 </>
 )}
 </div>
 </div>
 )}
 </div>
 )
}



