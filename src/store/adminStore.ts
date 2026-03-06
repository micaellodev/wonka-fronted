// ============================================================
//  Admin Store — Zustand
//  Holds the state of the admin session for restricted access
// ============================================================

import { create } from 'zustand'

interface AdminState {
    isAdminAuthenticated: boolean
    loginAdmin: () => void
    logoutAdmin: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
    isAdminAuthenticated: false,
    loginAdmin: () => set({ isAdminAuthenticated: true }),
    logoutAdmin: () => set({ isAdminAuthenticated: false }),
}))
