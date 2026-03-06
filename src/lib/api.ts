// ============================================================
//  API Client — @elysiajs/eden treaty
//  Connects to the Wonka POS backend at http://localhost:3000
// ============================================================

import { treaty } from '@elysiajs/eden'

export const api = treaty('http://localhost:3000') as any
