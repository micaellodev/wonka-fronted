// ============================================================
//  Auth Store — Zustand
//  Holds the active tenant and the currently authenticated worker
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Worker } from '@/types'

interface AuthState {
    /** Multi-tenant identifier — hardcoded to TENANT_1 for now */
    tenantId: string
    /** The worker who last authenticated via PIN */
    activeWorker: Worker | null

    // Actions
    setWorker: (worker: Worker | null) => void
    setTenantId: (id: string) => void
    logout: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            tenantId: 'wonka_main_store_001',
            activeWorker: null,

            setWorker: (worker) => set({ activeWorker: worker }),
            setTenantId: (id) => set({ tenantId: id }),
            logout: () => set({ activeWorker: null }),
        }),
        {
            name: 'wonka-auth',
            // Only persist tenantId — worker session is ephemeral
            partialize: (state) => ({ tenantId: state.tenantId }),
        },
    ),
)
