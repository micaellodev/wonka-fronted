// ============================================================
//  API Client — @elysiajs/eden treaty
//  Connects to the Wonka POS backend at http://localhost:3000
// ============================================================

import { treaty } from '@elysiajs/eden'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const api = treaty(API_URL) as any
