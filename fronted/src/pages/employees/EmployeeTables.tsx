// Tablas de la pantalla de empleados (lista, asistencia de hoy, historial). Extraído de EmployeesScreen sin cambios de comportamiento.
import { UserCheck, UserX } from 'lucide-react'
import type { AttendanceRecord } from '@/types'
import type { Worker } from '../EmployeesScreen'

const AVATAR_FALLBACK = import.meta.env.VITE_AVATAR_FALLBACK_SERVICE || ''

export interface HistoryRow { worker: Worker; totalHours: number; tardanzas: number; faltas: number; attendedDays: number }

export function WorkersTable({ loading, workers, onEdit }: { loading: boolean; workers: Worker[]; onEdit?: (w: Worker) => void }) {
 return (
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
 {onEdit && <button onClick={() => onEdit(w)} className="text-sm font-medium text-primary hover:text-primary">Editar</button>}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 )
}

export function AttendanceTable({ loading, workers, todayRecords, getAttendanceStatus, getDuration, formatDate }: {
 loading: boolean
 workers: Worker[]
 todayRecords: AttendanceRecord[]
 getAttendanceStatus: (workerId: string) => { label: string; color: string }
 getDuration: (checkIn: string, checkOut: string | null) => string
 formatDate: (iso: string | null) => string
}) {
 return (
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
 )
}

export function HistoryTable({ loading, historyData }: { loading: boolean; historyData: HistoryRow[] }) {
 return (
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
 )
}
