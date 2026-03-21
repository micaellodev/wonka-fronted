// ============================================================
//  Shared TypeScript types — mirrors backend Prisma + API shapes
// ============================================================

export interface Role {
    id: string
    name: string
    createdAt: string
}

export interface Worker {
    id: string
    name: string
    isActive: boolean
    createdAt: string
    role: Pick<Role, 'id' | 'name'>
}

export interface AttendanceRecord {
    id: string
    checkIn: string
    checkOut: string | null
    worker: Pick<Worker, 'id' | 'name'>
}

// Attendance API response
export interface AttendanceResult {
    action: 'CHECK_IN' | 'CHECK_OUT'
    worker: Pick<Worker, 'id' | 'name' | 'role'>
    record: AttendanceRecord
}

// API envelope
export interface ApiData<T> {
    data: T
    meta?: Record<string, unknown>
}

export interface ApiError {
    message: string
}

// ── Inventory / POS ──────────────────────────────────────────

export interface Category {
    id: string
    name: string
    imageUrl?: string | null
    createdAt: string
}

export interface Product {
    id: string
    name: string
    sku: string
    imageUrl?: string | null
    price: number
    cost: number
    stock: number
    trackStock: boolean
    isActive: boolean
    createdAt: string
    category: Pick<Category, 'id' | 'name'>
}

export interface CartItem {
    product: Product
    quantity: number
}

export interface SalePayload {
    tenantId: string
    workerId: string
    items: Array<{ productId: string; qty: number }>
}
