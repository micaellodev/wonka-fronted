// ============================================================
//  API Client — @elysiajs/eden treaty
//  Connects to the Wonka POS backend at http://localhost:3000
// ============================================================

import { treaty } from '@elysiajs/eden'
import type { App } from '../../../wonka-backend/src/index'

// @ts-expect-error Cross-project typescript referencing issue due to multiple node_modules for elysia
export const api = treaty<App>('https://wonka-backend-production.up.railway.app')
