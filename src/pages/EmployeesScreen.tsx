import { useEffect, useState, useCallback } from 'react'
import { Users, Plus, Clock, BarChart2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/format'
import { WorkerFormDialog, AdminPinDialog, NewRoleDialog } from './employees/EmployeeDialogs'
import { WorkersTable, AttendanceTable, HistoryTable, type HistoryRow } from './employees/EmployeeTables'
import type { AttendanceRecord } from '@/types'
import { useCan } from '@/lib/permissions'

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
 const canManage = useCan().can('employees.manage')
 const { tenantId } = useAuthStore()

 type TabType = 'empleados' | 'asistencia' | 'historial'
const [creds, setCreds] = useState<{ pin: string; code?: string } | null>(null)
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
 return formatDateTime(iso)
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
 toast.error("Error subiendo la foto.")
 }
 } catch (error) {
 console.error("Error al subir archivo", error)
 toast.error("Hubo un problema al subir la foto.")
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
 setCreds({ pin: meta.rawPin, code: meta.rawApprovalCode })
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
 {activeTab === 'empleados' && canManage && (
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
 <WorkersTable loading={loading} workers={workers} onEdit={canManage ? openEditModal : undefined} />
 )}

 {activeTab === 'asistencia' && (
 <AttendanceTable loading={loading} workers={workers} todayRecords={todayRecords} getAttendanceStatus={getAttendanceStatus} getDuration={getDuration} formatDate={formatDate} />
 )}

 {activeTab === 'historial' && (
 <HistoryTable loading={loading} historyData={historyData} />
 )}
 </div>
 </div>
 </main>

 <WorkerFormDialog
 open={isModalOpen} onClose={() => setIsModalOpen(false)} editing={!!editingWorker}
 form={formData} setForm={setFormData} roles={roles}
 uploadingImage={uploadingImage} onImage={handleImageUpload}
 onNewRole={openNewRoleModal} isAdminRole={isAdminRole} saving={saving} invalid={formInvalid} onSave={handleSaveWorker}
 />
 <Dialog open={!!creds} onOpenChange={o => { if (!o) setCreds(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Empleado creado</DialogTitle>
            <DialogDescription>Anótalos ahora: no se podrán volver a ver.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 font-mono text-lg select-all">
            <p>PIN de acceso: <strong>{creds?.pin}</strong></p>
            {creds?.code && <p>Código de aprobación: <strong>{creds.code}</strong></p>}
          </div>
          <DialogFooter><Button onClick={() => setCreds(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AdminPinDialog open={showAdminPinModal} saving={saving} onClose={() => setShowAdminPinModal(false)} onComplete={performSaveWorker} hasError={adminPinError} error={saveError} />
 <NewRoleDialog
 open={showNewRoleModal} onClose={() => setShowNewRoleModal(false)} saving={newRoleSaving} step={newRoleStep}
 name={newRoleName} setName={setNewRoleName} onNameSubmit={handleNewRoleNameSubmit}
 onPin={handleNewRolePinComplete} pinError={newRolePinError} error={newRoleError}
 />
 </div>
 )
}



