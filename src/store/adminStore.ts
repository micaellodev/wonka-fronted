// ============================================================
// Admin Store — Zustand
// Holds the state of the admin session for restricted access
// ============================================================

import { create } from 'zustand'

interface AdminState {
 isAdminAuthenticated: boolean
 /** Elevated token from /hr/verify-admin; lib/api prefers it while set */
 adminToken: string | null
 loginAdmin: (token: string) => void
 logoutAdmin: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
 isAdminAuthenticated: false,
 adminToken: null,
 loginAdmin: (token) => set({ isAdminAuthenticated: true, adminToken: token }),
 logoutAdmin: () => set({ isAdminAuthenticated: false, adminToken: null }),
}))
