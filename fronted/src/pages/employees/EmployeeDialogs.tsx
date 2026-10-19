import type { ChangeEvent } from 'react'
import { X } from 'lucide-react'
import { PinPad } from '@/components/PinPad'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

const AVATAR_FALLBACK = import.meta.env.VITE_AVATAR_FALLBACK_SERVICE || ''

export interface EmployeeForm { name: string; dni: string; roleId: string; isActive: boolean; pin: string; approvalCode: string; avatarUrl: string }

const digits = (v: string) => v.replace(/\D/g, '')

export function WorkerFormDialog(p: {
  open: boolean; onClose: () => void; editing: boolean
  form: EmployeeForm; setForm: (f: EmployeeForm) => void
  roles: { id: string; name: string }[]
  uploadingImage: boolean; onImage: (e: ChangeEvent<HTMLInputElement>) => void
  onNewRole: () => void; isAdminRole: boolean; saving: boolean; invalid: boolean; onSave: () => void
}) {
  const { form, setForm } = p
  return (
    <Dialog open={p.open} onOpenChange={(o) => { if (!o) p.onClose() }}>
      <DialogContent size="md" showCloseButton={false} className="gap-6">
        <div className="flex items-center gap-4">
          <label className="w-16 h-16 rounded-2xl bg-muted overflow-hidden shadow-inner shrink-0 cursor-pointer relative group">
            <img src={form.avatarUrl || `${AVATAR_FALLBACK}?seed=${form.name || 'default'}`} className={`w-full h-full object-cover ${p.uploadingImage ? 'opacity-50' : ''}`} alt="Foto del empleado" />
            <div className="absolute inset-0 bg-scrim flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <span className="text-[11px] font-bold text-primary-foreground text-center px-1 uppercase tracking-wider">Subir Foto</span>
            </div>
            <input type="file" accept="image/*" className="sr-only" onChange={p.onImage} disabled={p.uploadingImage} />
          </label>
          <DialogHeader className="pr-0">
            <DialogTitle className="text-xl font-bold tracking-tight">{p.editing ? 'Editar Empleado' : 'Nuevo Empleado'}</DialogTitle>
            <DialogDescription>{p.editing ? 'Modifica los datos y acceso.' : 'Crea un nuevo perfil para el local.'}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="emp-name">Nombre Completo</Label>
              <Input id="emp-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Carlos Mendoza" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-dni">DNI / Documento</Label>
              <Input id="emp-dni" value={form.dni} onChange={e => setForm({ ...form, dni: digits(e.target.value) })} placeholder="Opcional" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="emp-role">Rol u Ocupacion</Label>
              <button type="button" onClick={p.onNewRole} className="text-xs font-semibold text-primary hover:underline">+ Nueva categoría de rol</button>
            </div>
            <Select id="emp-role" value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>
              {p.roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="emp-pin">PIN de Acceso (5 o 6 dígitos)</Label>
            <Input id="emp-pin" inputMode="numeric" maxLength={6} value={form.pin} onChange={e => setForm({ ...form, pin: digits(e.target.value) })}
              placeholder={p.editing ? 'En blanco si no desea cambiarlo' : 'En blanco = se genera uno'} />
          </div>

          {p.isAdminRole && (
            <div className="space-y-1">
              <Label htmlFor="emp-code">Código de Aprobación del Dueño (6 digitos)</Label>
              <Input id="emp-code" maxLength={6} value={form.approvalCode} onChange={e => setForm({ ...form, approvalCode: digits(e.target.value) })}
                placeholder={p.editing ? (form.approvalCode ? 'Nuevo código' : 'En blanco si no desea cambiarlo') : '6 dígitos (en blanco = se genera)'} />
              <p className="text-xs text-muted-foreground">Solo los dueños/administradores necesitan este código para aprobar anulaciones y cierre de caja.</p>
            </div>
          )}

          {p.editing && (
            <div className="flex items-center gap-3 pt-2">
              <input type="checkbox" id="active-chk" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-5 h-5 rounded border-border accent-primary" />
              <Label htmlFor="active-chk" className="text-muted-foreground">Empleado con cuenta activa (Puede entrar)</Label>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-2">
          <Button variant="outline" className="flex-1" onClick={p.onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={p.onSave} disabled={p.saving || !form.name || p.invalid}>{p.saving ? 'Guardando...' : 'Guardar Empleado'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CloseX({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Cerrar" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors">
      <X className="w-5 h-5" />
    </button>
  )
}

export function AdminPinDialog(p: { open: boolean; saving: boolean; onClose: () => void; onComplete: (pin: string) => void; hasError: boolean; error: string | null }) {
  return (
    <Dialog open={p.open} onOpenChange={(o) => { if (!o && !p.saving) p.onClose() }}>
      <DialogContent size="sm" showCloseButton={false} className="gap-5">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg font-bold">PIN de Administrador</DialogTitle>
          <CloseX onClick={() => { if (!p.saving) p.onClose() }} />
        </div>
        <DialogDescription className="text-center">Ingresa el PIN de un administrador (5 o 6 dígitos) para confirmar este cambio de empleado.</DialogDescription>
        <PinPad onComplete={p.onComplete} disabled={p.saving} hasError={p.hasError} />
        {p.error && <p role="alert" className="text-center text-sm text-destructive">{p.error}</p>}
      </DialogContent>
    </Dialog>
  )
}

export function NewRoleDialog(p: {
  open: boolean; onClose: () => void; saving: boolean; step: 'name' | 'pin'
  name: string; setName: (v: string) => void; onNameSubmit: () => void
  onPin: (pin: string) => void; pinError: boolean; error: string | null
}) {
  return (
    <Dialog open={p.open} onOpenChange={(o) => { if (!o && !p.saving) p.onClose() }}>
      <DialogContent size="sm" showCloseButton={false} className="gap-5">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg font-bold">Nueva Categoría de Rol</DialogTitle>
          <CloseX onClick={() => { if (!p.saving) p.onClose() }} />
        </div>
        {p.step === 'name' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Nombre del rol</Label>
              <Input id="role-name" autoFocus value={p.name} onChange={e => p.setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && p.onNameSubmit()} placeholder="Ej. GERENTE" />
              <p className="text-xs text-muted-foreground">Permisos por nombre: <b>GERENTE</b> (reportes, inventario, aprobaciones, notas; sin empresa ni empleados), <b>COCINA</b> (solo ver inventario), <b>ADMIN</b> (todo). Cualquier otro nombre = cajero.</p>
            </div>
            <Button className="w-full" onClick={p.onNameSubmit} disabled={!p.name.trim()}>Continuar</Button>
          </>
        ) : (
          <>
            <DialogDescription className="text-center">Ingresa el PIN de un administrador (5 o 6 dígitos) para crear el rol "{p.name.trim()}".</DialogDescription>
            <PinPad onComplete={p.onPin} disabled={p.saving} hasError={p.pinError} />
            {p.error && <p role="alert" className="text-center text-sm text-destructive">{p.error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
