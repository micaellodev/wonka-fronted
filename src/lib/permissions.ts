// Permisos por rol. La lista viene del backend en el login (POST /hr/verify-pin → permissions) y el backend los hace cumplir;
// aquí solo se usan para ocultar lo que el rol no puede hacer. ADMIN/ADMINISTRADOR siempre pasan (compatibilidad).
import { useAuthStore } from '@/store/authStore'

export type Permission =
  | 'employees.view' | 'employees.manage' | 'inventory.view' | 'inventory.edit' | 'reports.view'
  | 'approvals.resolve' | 'billing.notes' | 'cash.manage' | 'playzone.rates' | 'company.settings'

/** Pantallas de back-office y el permiso que exigen; el resto de rutas es de trabajador. */
const ROUTE_PERMISSION: Record<string, Permission> = {
  '/admin/approvals': 'approvals.resolve',
  '/admin/company': 'company.settings',
  '/admin/inventory': 'inventory.view',
  '/admin/employees': 'employees.view',
  '/admin/billing-notes': 'billing.notes',
  '/admin/reports': 'reports.view',
  '/admin/cashier': 'reports.view',
}

const isAdminName = (name?: string) => name === 'ADMIN' || name === 'ADMINISTRADOR'

export function useCan() {
  const worker = useAuthStore((s) => s.activeWorker)
  const permissions = useAuthStore((s) => s.permissions)
  const admin = isAdminName(worker?.role?.name)
  const can = (p: Permission) => admin || permissions.includes(p)
  /** Puede entrar al panel de administración (admin o cualquier rol con permisos de back-office). */
  const canEnterAdmin = admin || permissions.length > 0
  const canRoute = (to: string) => {
    const perm = ROUTE_PERMISSION[to.split('?')[0]]
    return !perm || can(perm)
  }
  return { can, canEnterAdmin, canRoute }
}
