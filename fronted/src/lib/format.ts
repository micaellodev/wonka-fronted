// ============================================================
// Format utilities
// ============================================================

export function formatCurrency(value: number): string {
 return new Intl.NumberFormat('es-PE', {
 style: 'currency',
 currency: 'PEN',
 minimumFractionDigits: 2,
 }).format(value)
}

export function formatDate(value: string | Date): string {
 const date = typeof value === 'string' ? new Date(value) : value
 return date.toLocaleDateString('es-PE', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 })
}

export function formatTime(value: string | Date): string {
 const date = typeof value === 'string' ? new Date(value) : value
 return date.toLocaleTimeString('es-PE', {
 hour: '2-digit',
 minute: '2-digit',
 })
}
