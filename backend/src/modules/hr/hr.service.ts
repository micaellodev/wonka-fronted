import { prisma } from "../../lib/prisma.ts";
import { checkRateLimit, resetRateLimit, undoAttempt } from "../../lib/rateLimiter.ts";
import { Prisma } from "@prisma/client";
import { invalidateWorkerCache, signToken } from "../../lib/auth.ts";

import { CryptoHasher } from "bun";

// ============================================================
//  HR Service — Business Logic
// ============================================================

// ── Helpers ──────────────────────────────────────────────────

export function generatePin(): string {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const pin = 10000 + (array[0]! % 90000);
    return pin.toString();
}

export function isValidPin(pin: string): boolean {
    return /^\d{5,6}$/.test(pin);
}

// ── Brute-force limits ───────────────────────────────────────
// Per client (IP) AND per tenant. The client key is checked first, so a
// single blocked client stops consuming the tenant budget; the tenant cap is
// higher so one attacker cannot lock out the whole store. Only failures
// accumulate (successes undo their attempt), so a valid login cannot be used
// to wipe the tenant counter.
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = {
    pin: { client: 10, tenant: 50 },
    attendance: { client: 15, tenant: 60 },
    admin: { client: 8, tenant: 30 },
    approval: { client: 8, tenant: 30 },
} as const;
type Scope = keyof typeof LIMITS;

function limitAttempt(scope: Scope, tenantId: string, client?: string) {
    if (client) checkRateLimit(`${scope}:c:${tenantId}:${client}`, LIMITS[scope].client, WINDOW_MS);
    checkRateLimit(`${scope}:t:${tenantId}`, LIMITS[scope].tenant, WINDOW_MS);
}

function clearAttempt(scope: Scope, tenantId: string, client?: string) {
    if (client) resetRateLimit(`${scope}:c:${tenantId}:${client}`);
    undoAttempt(`${scope}:t:${tenantId}`);
}

/** Throws if another active worker of the tenant already uses this PIN (a duplicate would log in as the wrong worker). */
async function assertPinFree(tenantId: string, pinHash: string, exceptWorkerId?: string) {
    const clash = await prisma.worker.findFirst({
        where: { tenantId, pinHash, isActive: true, ...(exceptWorkerId ? { NOT: { id: exceptWorkerId } } : {}) },
        select: { id: true },
    });
    if (clash) throw new Error("Ese PIN ya está en uso por otro trabajador.");
}

export function isValidApprovalCode(code: string): boolean {
    return /^\d{6}$/.test(code);
}

export function generateApprovalCode(): string {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const code = 100000 + (array[0]! % 900000);
    return code.toString();
}

/**
 * Genera un Hash determinista ultrarrápido usando SHA-256.
 * Usamos el tenantId como "Salt" para que el mismo PIN en distintas 
 * sucursales genere un hash completamente diferente.
 */
export function hashPin(tenantId: string, pin: string): string {
    return new CryptoHasher("sha256")
        .update(`${tenantId}:${pin}`)
        .digest("hex");
}

export async function verifyApprovalCode(
    tenantId: string,
    workerId: string,
    rawCode: string
): Promise<{ success: true; worker: { id: string; name: string } }> {
    if (!isValidApprovalCode(rawCode)) {
        throw new Error("Approval code must be exactly 6 numeric digits.");
    }
    // Client key = the approver: these routes already require a session token.
    limitAttempt("approval", tenantId, `approver:${workerId}`);

    const targetHash = hashPin(tenantId, rawCode);

    const worker = await prisma.worker.findFirst({
        where: {
            id: workerId,
            tenantId,
            approvalCodeHash: targetHash,
            isActive: true,
        },
        include: { role: true },
    });

    if (!worker) {
        throw new Error("Invalid approval code.");
    }

    const isAdmin = worker.role?.name === "ADMIN" || worker.role?.name === "ADMINISTRADOR";
    if (!isAdmin) {
        throw new Error("Only administrators can use an approval code.");
    }

    clearAttempt("approval", tenantId, `approver:${workerId}`);
    return {
        success: true,
        worker: { id: worker.id, name: worker.name },
    };
}

// ── Worker ───────────────────────────────────────────────────

export type CreatedWorkerResult = {
    worker: {
        id: string;
        name: string;
        tenantId: string;
        roleId: string;
        dni?: string;
        avatarUrl?: string;
        isActive: boolean;
        createdAt: Date;
    };
    rawPin: string;
};

export async function createWorker({
    tenantId,
    name,
    roleId,
    dni,
    avatarUrl,
    pin,
    approvalCode,
}: {
    tenantId: string;
    name: string;
    roleId: string;
    dni?: string;
    avatarUrl?: string;
    pin?: string;
    approvalCode?: string;
}) {
    const rawPin = pin ?? generatePin();

    if (!isValidPin(rawPin)) {
        throw new Error("PIN must be 5 or 6 numeric digits.");
    }

    const role = await prisma.role.findFirst({
        where: { id: roleId, tenantId: tenantId },
    });

    if (!role) {
        throw new Error("Role not found for this tenant.");
    }

    const isAdminRole = role.name === "ADMIN" || role.name === "ADMINISTRADOR";

    let approvalCodeHash: string | undefined;
    let rawApprovalCode: string | undefined;
    if (isAdminRole) {
        rawApprovalCode = approvalCode ?? generateApprovalCode();
        if (!isValidApprovalCode(rawApprovalCode)) {
            throw new Error("Approval code must be exactly 6 numeric digits.");
        }
        approvalCodeHash = hashPin(tenantId, rawApprovalCode);
    }

    // 🚀 HASH DETERMINISTA: Se calcula en microsegundos
    const pinHash = hashPin(tenantId, rawPin);
    await assertPinFree(tenantId, pinHash);

    const worker = await prisma.worker.create({
        data: {
            tenantId,
            name,
            roleId,
            pinHash, // Guardamos el hash SHA-256
            ...(approvalCodeHash ? { approvalCodeHash } : {}),
            ...(dni ? { dni } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
        },
        select: {
            id: true,
            name: true,
            tenantId: true,
            roleId: true,
            dni: true,
            avatarUrl: true,
            isActive: true,
            createdAt: true,
        },
    });

    return { worker, rawPin, rawApprovalCode };
}

export async function updateWorker({
    tenantId,
    workerId,
    name,
    roleId,
    dni,
    avatarUrl,
    isActive,
    pin,
    approvalCode,
}: {
    tenantId: string;
    workerId: string;
    name?: string;
    roleId?: string;
    dni?: string;
    avatarUrl?: string;
    isActive?: boolean;
    pin?: string; // Nuevo PIN
    approvalCode?: string; // Nuevo código de aprobación (6 dígitos)
}) {
    let newPinHash;
    if (pin) {
        if (!isValidPin(pin)) {
            throw new Error("PIN must be 5 or 6 numeric digits.");
        }
        newPinHash = hashPin(tenantId, pin);
        await assertPinFree(tenantId, newPinHash, workerId);
    }

    let newApprovalCodeHash;
    if (approvalCode !== undefined) {
        if (approvalCode === null) {
            newApprovalCodeHash = null;
        } else {
            if (!isValidApprovalCode(approvalCode)) {
                throw new Error("Approval code must be exactly 6 numeric digits.");
            }
            newApprovalCodeHash = hashPin(tenantId, approvalCode);
        }
    }

    if (roleId) {
        const role = await prisma.role.findFirst({
            where: { id: roleId, tenantId: tenantId },
        });
        if (!role) {
            throw new Error("Role not found for this tenant.");
        }
    }

    const dataToUpdate: Prisma.WorkerUncheckedUpdateInput = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (roleId !== undefined) dataToUpdate.roleId = roleId;
    if (isActive !== undefined) dataToUpdate.isActive = isActive;
    if (dni !== undefined) dataToUpdate.dni = dni;
    if (avatarUrl !== undefined) dataToUpdate.avatarUrl = avatarUrl;
    if (newPinHash !== undefined) dataToUpdate.pinHash = newPinHash;
    if (newApprovalCodeHash !== undefined) dataToUpdate.approvalCodeHash = newApprovalCodeHash;

    const exists = await prisma.worker.findFirst({ where: { id: workerId, tenantId }, select: { id: true } });
    if (!exists) throw new Error("Worker not found for this tenant.");

    const worker = await prisma.worker.update({
        where: { id: workerId, tenantId: tenantId },
        data: dataToUpdate,
        select: {
            id: true,
            name: true,
            tenantId: true,
            roleId: true,
            dni: true,
            avatarUrl: true,
            isActive: true,
            createdAt: true,
        },
    });

    invalidateWorkerCache(workerId);
    return worker;
}

// ── Attendance ───────────────────────────────────────────────

export type AttendanceResult = {
    action: "CHECK_IN" | "CHECK_OUT";
    attendance: {
        id: string;
        workerId: string;
        checkIn: Date;
        checkOut: Date | null;
    };
    worker: { id: string; name: string; role: { id: string; name: string } };
};

export async function processAttendance(
    tenantId: string,
    rawPin: string,
    client?: string
): Promise<AttendanceResult> {
    if (!isValidPin(rawPin)) throw new Error("Pin Inválido.");
    // Generous limit: normal kiosk flow, typos during shift-change are expected.
    limitAttempt("attendance", tenantId, client);

    // 1. Calculamos instantáneamente qué hash estamos buscando
    const targetHash = hashPin(tenantId, rawPin);

    // 2. 🚀 BÚSQUEDA O(1): Le pedimos a Postgres que encuentre el match exacto.
    // Adiós al bucle de bcrypt. Esto tarda 1 milisegundo sin importar si hay 1,000 empleados.
    const matchedWorker = await prisma.worker.findFirst({
        where: {
            tenantId,
            pinHash: targetHash,
            isActive: true,
        },
        select: { id: true, name: true, role: { select: { id: true, name: true } } },
    });

    if (!matchedWorker) {
        throw new Error("Pin Inválido.");
    }

    clearAttempt("attendance", tenantId, client);

    // 3. Revisar si hay un registro de hoy (asume turnos en el mismo día)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecord = await prisma.attendance.findFirst({
        where: {
            workerId: matchedWorker.id,
            tenantId,
            checkIn: { gte: today },
        },
        orderBy: { checkIn: "desc" },
    });

    if (todayRecord) {
        if (!todayRecord.checkOut) {
            // ── CHECK OUT ──────────────────────────────────────────
            const updated = await prisma.attendance.update({
                where: { id: todayRecord.id },
                data: { checkOut: new Date() },
                select: { id: true, workerId: true, checkIn: true, checkOut: true },
            });
            return { action: "CHECK_OUT", attendance: updated, worker: matchedWorker };
        } else {
            // Ya cumplió su entrada y salida de hoy
            throw new Error("Ya has registrado tu entrada y salida por hoy.");
        }
    }

    // ── CHECK IN ────────────────────────────────────────────
    const created = await prisma.attendance.create({
        data: {
            tenantId,
            workerId: matchedWorker.id,
        },
        select: { id: true, workerId: true, checkIn: true, checkOut: true },
    });

    return { action: "CHECK_IN", attendance: created, worker: matchedWorker };
}

// ── Admin Gatekeeper ─────────────────────────────────────────

export async function verifyAdmin(
    tenantId: string,
    rawPin: string,
    client?: string
): Promise<{ success: true; worker: { id: string; name: string; role: { name: string } } }> {
    if (!isValidPin(rawPin)) throw new Error("Pin Inválido.");
    limitAttempt("admin", tenantId, client);

    const targetHash = hashPin(tenantId, rawPin);

    const matchedWorker = await prisma.worker.findFirst({
        where: {
            tenantId,
            pinHash: targetHash,
            isActive: true,
        },
        select: { id: true, name: true, role: { select: { name: true } } },
    });

    if (!matchedWorker) {
        throw new Error("Pin Inválido.");
    }

    if (matchedWorker.role.name !== "ADMINISTRADOR" && matchedWorker.role.name !== "ADMIN") {
        throw new Error("Worker does not have ADMIN privileges.");
    }

    clearAttempt("admin", tenantId, client);
    return {
        success: true,
        worker: { id: matchedWorker.id, name: matchedWorker.name, role: matchedWorker.role },
    };
}

// ── PIN login ────────────────────────────────────────────────

export async function verifyPin(tenantId: string, rawPin: string, client?: string) {
    if (!isValidPin(rawPin)) throw new Error("Pin Inválido.");
    limitAttempt("pin", tenantId, client);

    const worker = await prisma.worker.findFirst({
        where: { tenantId, pinHash: hashPin(tenantId, rawPin), isActive: true },
        select: { id: true, name: true, role: { select: { id: true, name: true } } },
    });
    if (!worker) throw new Error("Pin Inválido.");

    clearAttempt("pin", tenantId, client);
    return { worker, token: signToken({ workerId: worker.id, tenantId, role: worker.role.name }) };
}
/** Resolves the active ADMIN of the tenant owning this 6-digit approval code. Rate-limited per caller (failures count, success undoes). */
export async function verifyApprovalCodeAny(
    tenantId: string,
    rawCode: string,
    callerId: string
): Promise<{ success: true; worker: { id: string; name: string } }> {
    if (!isValidApprovalCode(rawCode)) throw new Error("Approval code must be exactly 6 numeric digits.");
    limitAttempt("approval", tenantId, `approver:${callerId}`);
    const worker = await prisma.worker.findFirst({
        where: {
            tenantId,
            isActive: true,
            approvalCodeHash: hashPin(tenantId, rawCode),
            role: { name: { in: ["ADMIN", "ADMINISTRADOR"] } },
        },
        select: { id: true, name: true },
    });
    if (!worker) throw new Error("Invalid approval code.");
    clearAttempt("approval", tenantId, `approver:${callerId}`);
    return { success: true, worker };
}
