// ============================================================
// API Client — @elysiajs/eden treaty
// Connects to the Wonka POS backend via VITE_API_URL
// Adds the session token to every request; on an expired/invalid
// session (401 UNAUTHENTICATED) clears it so the route guards
// send the user back to the login screen.
// ============================================================

import { treaty } from '@elysiajs/eden'
import { useAuthStore } from '@/store/authStore'
import { useAdminStore } from '@/store/adminStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const api = treaty(API_URL, {
 headers() {
  const token = useAdminStore.getState().adminToken ?? useAuthStore.getState().token
  return token ? { authorization: `Bearer ${token}` } : undefined
 },
 async onResponse(response) {
  if (response.status !== 401) return
  // Wrong PIN also answers 401; only a dead session carries this code.
  const body = await response.clone().json().catch(() => null)
  if (body?.code === 'UNAUTHENTICATED') {
   useAuthStore.getState().logout()
  }
 },
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- no shared App type with the backend
}) as any
