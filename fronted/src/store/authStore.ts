// ============================================================
// Auth Store — Zustand
// Holds the active tenant and the currently authenticated worker
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Worker } from '@/types'
import { useAdminStore } from './adminStore'

const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID || 'wonka_main_store_001'

interface AuthState {
 /** Multi-tenant identifier — configurable via VITE_TENANT_ID */
 tenantId: string
 /** The worker who last authenticated via PIN */
 activeWorker: Worker | null
 /** Signed session token from /hr/verify-pin (memory only; never the PIN) */
 token: string | null
 /** Permisos de back-office del rol (los entrega el backend en el login) */
 permissions: string[]

 // Actions
 setSession: (worker: Worker, token: string, permissions?: string[]) => void
 setTenantId: (id: string) => void
 logout: () => void
}

export const useAuthStore = create<AuthState>()(
 persist(
 (set) => ({
 tenantId: DEFAULT_TENANT_ID,
 activeWorker: null,
 token: null,
 permissions: [],

 setSession: (worker, token, permissions = []) => set({ activeWorker: worker, token, permissions }),
 setTenantId: (id) => set({ tenantId: id }),
 logout: () => {
  // Any logout also drops an elevated admin session.
  useAdminStore.getState().logoutAdmin()
  set({ activeWorker: null, token: null, permissions: [] })
 },
 }),
 {
 name: 'wonka-auth',
 // Only persist tenantId — worker session is ephemeral
 partialize: (state) => ({ tenantId: state.tenantId }),
 },
 ),
)
