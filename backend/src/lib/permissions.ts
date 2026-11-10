// ============================================================
//  Permisos por rol. El rol viaja en el token (nombre del Role del tenant).
//  Solo gobierna las rutas "de back-office"; las rutas de trabajador (POS, caja, zona de juegos) siguen abiertas
//  a cualquier rol, como antes. Roles desconocidos = sin permisos extra (igual que CAJERO).
// ============================================================

export const PERMISSIONS = [
    "employees.view", "employees.manage", "inventory.view", "inventory.stock.add", "inventory.edit", "reports.view",
    "approvals.resolve", "billing.notes", "cash.manage", "playzone.rates", "company.settings",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Coincidencia exacta: POST /hr/roles guarda el nombre en mayúsculas, y no se debe ampliar quién cuenta como ADMIN.
const normalize = (role?: string | null) => role ?? "";

const GERENTE: readonly Permission[] = [
    "employees.view", "inventory.view", "inventory.edit", "reports.view",
    "approvals.resolve", "billing.notes", "cash.manage", "playzone.rates",
];

// shortcut: mapa fijo en código (por nombre de rol); si hace falta editarlo por negocio, mover a una tabla RolePermission.
const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
    ADMIN: PERMISSIONS,
    ADMINISTRADOR: PERMISSIONS,
    GERENTE,
    COCINA: ["inventory.view"],
    CAJERO: ["inventory.view", "inventory.stock.add"],
};

export const permissionsFor = (role?: string | null): readonly Permission[] => ROLE_PERMISSIONS[normalize(role)] ?? [];
export const can = (role: string | null | undefined, p: Permission) => permissionsFor(role).includes(p);

/** Rutas de back-office fuera de la regla por prefijo, con el permiso que exigen. Clave: "METHOD /ruta" como la reporta Elysia. */
const ROUTE_PERMISSIONS: Record<string, Permission> = {
    "GET /hr/roles": "employees.view", "GET /hr/workers": "employees.view", "GET /hr/attendance": "employees.view",
    "GET /dashboard/metrics": "reports.view", "GET /dashboard/audit": "company.settings", "GET /playzone/reports/summary": "reports.view", "GET /playzone/clients": "reports.view",
    "GET /inventory/movements": "inventory.view",
    "GET /pos/void": "approvals.resolve", "POST /pos/void/:id/resolve": "approvals.resolve",
    "GET /billing/notes": "billing.notes", "GET /billing/document": "billing.notes", "GET /billing/documents": "billing.notes",
    "DELETE /cash/movements/:id": "cash.manage",
    "PUT /playzone/rates": "playzone.rates",
    // Anular un juego sin cobrar: el cajero debe cobrarlo; solo un gerente/admin puede deshacerlo
    "DELETE /playzone/sessions/:id/cancel": "approvals.resolve", "DELETE /playzone/sessions/:id/extend": "approvals.resolve",
};

/** Escrituras (no-GET) bajo estos prefijos exigen permiso por defecto, para no dejar abiertas rutas nuevas. */
const WRITE_PREFIX_PERMISSIONS: Array<[string, Permission]> = [
    ["/inventory", "inventory.edit"], ["/combos", "inventory.edit"], ["/birthdays/plans", "playzone.rates"], ["/birthdays/holidays", "playzone.rates"], ["/upload", "inventory.edit"], ["/hr", "employees.manage"],
    ["/dashboard/settings", "company.settings"], ["/billing", "billing.notes"],
];
/** Escrituras que cualquier trabajador puede hacer (login por PIN, asistencia). Aprobar un cierre usa código de admin en la ruta. */
const WORKER_WRITES = new Set(["POST /hr/verify-pin", "POST /hr/attendance", "POST /hr/verify-admin"]);

/** Permiso que exige la ruta, o null si es de trabajador. */
export function requiredPermission(method: string, route: string): Permission | null {
    const key = `${method} ${route}`;
    const explicit = ROUTE_PERMISSIONS[key];
    if (explicit) return explicit;
    if (method === "GET" || WORKER_WRITES.has(key)) return null;
    return WRITE_PREFIX_PERMISSIONS.find(([p]) => route === p || route.startsWith(p + "/"))?.[1] ?? null;
}
