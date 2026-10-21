import { prisma } from "../../lib/prisma.ts";
import type { Prisma } from "@prisma/client";
import { aggregateSales } from "../cash/summary.ts";

// ============================================================
//  Play Zone Service — Business Logic (CRM + Sessions)
// ============================================================

// ── Types ────────────────────────────────────────────────────

export type GuardianWithChildren = {
    id: string;
    dni: string;
    phone: string | null;
    fullName: string;
    tenantId: string;
    createdAt: Date;
    children: Array<{ id: string; fullName: string; dni: string | null; age: number | null; gender: string | null; tenantId: string; guardianId: string; createdAt: Date; updatedAt: Date }>;
};

export type CreateGuardianInput = {
    tenantId: string;
    dni: string;
    phone?: string;
    fullName: string;
    childName: string;
    childDni?: string;
    childAge?: number;
    childGender?: string;
};

export type AddChildInput = {
    tenantId: string;
    guardianId: string;
    fullName: string;
    dni?: string;
    age?: number;
    gender?: string;
};

export type CreatePlaySessionInput = {
    tenantId: string;
    childId: string;
    durationMinutes?: number;
    companions?: number;
    notes?: string;
};

export type PlayzoneReportSummary = {
    periodDays: number;
    completedSessions: number;
    activeSessions: number;
    uniqueChildren: number;
    totalPlayedMinutes: number;
    averageMinutesPerSession: number;
    averageMinutesPerChild: number;
    totalOvertimeMinutes: number;
    /** Cobrado en caja: líneas pz- de ventas ACTIVE del periodo (misma regla que caja) */
    billed: { count: number; total: number };
    topChildren: Array<{
        childId: string;
        childName: string;
        sessions: number;
        totalMinutes: number;
        averageMinutes: number;
    }>;
    recentCompleted: Array<{
        id: string;
        wristbandCode: string;
        childName: string;
        guardianName: string;
        startTime: Date;
        endTime: Date;
        elapsedMinutes: number;
        overtimeMinutes: number;
    }>;
};

// ── Tarifas (configuradas por tenant; nunca confiadas del cliente) ──

export type PlayzoneRates = {
    durations: Array<{ minutes: number; price: number; label: string }>;
    /** S/ por minuto pasado del tiempo contratado */
    extraPerMinute: number;
    /** S/ por minuto jugado en sesiones de tiempo libre (sin duración) */
    freePerMinute: number;
};

export const DEFAULT_PLAYZONE_RATES: PlayzoneRates = {
    durations: [
        { minutes: 30, price: 10, label: "30 Min" },
        { minutes: 60, price: 15, label: "1 Hora" },
    ],
    extraPerMinute: 1,
    freePerMinute: 0.5,
};

function isPlayzoneRates(v: unknown): v is PlayzoneRates {
    const r = v as PlayzoneRates | null;
    return (
        !!r &&
        Array.isArray(r.durations) &&
        r.durations.every((d) => Number.isInteger(d.minutes) && d.minutes > 0 && d.price >= 0 && typeof d.label === "string") &&
        typeof r.extraPerMinute === "number" && r.extraPerMinute >= 0 &&
        typeof r.freePerMinute === "number" && r.freePerMinute >= 0
    );
}

export async function getPlayzoneRates(tenantId: string): Promise<PlayzoneRates> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Tenant not found.");
    return isPlayzoneRates(tenant.playzoneRates) ? tenant.playzoneRates : DEFAULT_PLAYZONE_RATES;
}

export async function updatePlayzoneRates(tenantId: string, rates: PlayzoneRates): Promise<PlayzoneRates> {
    if (!isPlayzoneRates(rates)) throw new Error("Tarifas inválidas.");
    const minutes = rates.durations.map((d) => d.minutes);
    if (new Set(minutes).size !== minutes.length) throw new Error("Hay duraciones repetidas.");
    await prisma.tenant.update({
        where: { id: tenantId },
        data: { playzoneRates: rates as unknown as Prisma.InputJsonValue },
    });
    return rates;
}

export type PlayzoneChargeKind = "base" | "extra" | "free" | "comp";

// shortcut: tarifas de acompañante fijas en código, pasar a playzoneRates si cambian por local
export const MAX_COMPANIONS = 2;
const COMPANION_PRICE = 5; // menor de 3 años: 1 acompañante ya va incluido
/** Menor de 3 años: entra gratis. Sin edad registrada se cobra como mayor. */
export const isUnder3 = (age: number | null | undefined) => age != null && age < 3;

export type PlayzoneCharge = {
    /** virtualSku único por sesión y tipo: pz-base-<id> / pz-extra-<id> / pz-free-<id> */
    sku: string;
    kind: PlayzoneChargeKind;
    sessionId: string;
    label: string;
    amount: number;
};

type ChargeableSession = {
    id: string;
    durationMinutes: number | null;
    companions: number;
    startTime: Date;
    endTime: Date | null;
    wristbandCode: string;
    child: { fullName: string; age: number | null };
};

function elapsedMinutesOf(start: Date, end: Date): number {
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

/**
 * Calcula el monto de un cargo de zona de juegos desde la sesión y las
 * tarifas del tenant. Usado al iniciar/finalizar sesión (para mostrar) y en
 * processSale (para cobrar) — así ambos montos siempre coinciden.
 */
export function computePlayzoneCharge(
    session: ChargeableSession,
    kind: PlayzoneChargeKind,
    rates: PlayzoneRates
): PlayzoneCharge {
    const tag = `[${session.wristbandCode}] ${session.child.fullName}`;
    const base = { sku: `pz-${kind}-${session.id}`, kind, sessionId: session.id };

    if (kind === "base") {
        if (session.durationMinutes === null) throw new Error(`La sesión ${session.wristbandCode} es de tiempo libre; no tiene tarifa base.`);
        if (isUnder3(session.child.age)) return { ...base, label: `JUEGOS GRATIS <3 AÑOS ${tag}`, amount: 0 };
        const rate = rates.durations.find((d) => d.minutes === session.durationMinutes);
        if (!rate) throw new Error(`No hay tarifa configurada para ${session.durationMinutes} min.`);
        return { ...base, label: `JUEGOS ${rate.label} ${tag}`, amount: rate.price };
    }

    if (kind === "comp") {
        if (session.companions <= 0) throw new Error(`La sesión ${session.wristbandCode} no tiene acompañantes.`);
        return { ...base, label: `ADICIONAL ACOMPAÑANTE x${session.companions} ${tag}`, amount: round2(session.companions * COMPANION_PRICE) };
    }

    if (!session.endTime) throw new Error(`La sesión ${session.wristbandCode} aún está activa; finalízala antes de cobrar el tiempo.`);
    const elapsed = elapsedMinutesOf(session.startTime, session.endTime);

    if (kind === "extra") {
        if (session.durationMinutes === null) throw new Error(`La sesión ${session.wristbandCode} es de tiempo libre; no tiene tiempo extra.`);
        const extraMinutes = Math.max(0, elapsed - session.durationMinutes);
        if (extraMinutes === 0) throw new Error(`La sesión ${session.wristbandCode} no tiene tiempo extra.`);
        return { ...base, label: `EXTRA JUEGOS ${extraMinutes} MIN ${tag}`, amount: round2(extraMinutes * rates.extraPerMinute) };
    }

    if (session.durationMinutes !== null) throw new Error(`La sesión ${session.wristbandCode} no es de tiempo libre.`);
    // Se cobra al menos 1 minuto para que una sesión libre nunca quede en S/ 0
    const minutes = Math.max(1, elapsed);
    return { ...base, label: `TIEMPO LIBRE ${minutes} MIN ${tag}`, amount: round2(minutes * rates.freePerMinute) };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ── CRM: Guardian lookup ─────────────────────────────────────

export async function lookupGuardian(
    tenantId: string,
    dniStr: string
): Promise<GuardianWithChildren | null> {
    const guardian = await prisma.guardian.findFirst({
        where: { tenantId, dni: dniStr.trim() },
        include: { children: { orderBy: { createdAt: "asc" } } },
    });
    return guardian;
}

// ── CRM: Paginated roster (list/search guardians) ────────────

export type ListGuardiansInput = {
    tenantId: string;
    search?: string;
    page: number;
    limit: number;
};

export async function listGuardians({ tenantId, search, page, limit }: ListGuardiansInput) {
    const skip = (page - 1) * limit;
    const trimmedSearch = search?.trim();

    const where = {
        tenantId,
        ...(trimmedSearch
            ? {
                  OR: [
                      { fullName: { contains: trimmedSearch, mode: "insensitive" as const } },
                      { dni: { contains: trimmedSearch } },
                  ],
              }
            : {}),
    };

    const [guardians, total] = await Promise.all([
        prisma.guardian.findMany({
            where,
            orderBy: { fullName: "asc" },
            skip,
            take: limit,
            include: { children: { orderBy: { createdAt: "asc" } } },
        }),
        prisma.guardian.count({ where }),
    ]);

    return {
        data: guardians,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ── CRM: Create Guardian + first Child atomically ────────────

export async function createGuardian(
    input: CreateGuardianInput
): Promise<GuardianWithChildren> {
    const existing = await prisma.guardian.findFirst({
        where: { tenantId: input.tenantId, dni: input.dni.trim() },
    });
    if (existing) {
        throw new Error(
            `Ya existe un apoderado con el DNI "${input.dni}" en este local.`
        );
    }

    const guardian = await prisma.guardian.create({
        data: {
            tenantId: input.tenantId,
            dni: input.dni.trim(),
            phone: input.phone?.trim() ?? null,
            fullName: input.fullName.trim(),
            children: {
                create: {
                    tenantId: input.tenantId,
                    fullName: input.childName.trim(),
                    dni: input.childDni?.trim() ?? null,
                    age: input.childAge ?? null,
                    gender: input.childGender?.trim() ?? null,
                },
            },
        },
        include: { children: true },
    });

    return guardian;
}

// ── CRM: Add Child to existing Guardian ──────────────────────

export async function addChild(input: AddChildInput) {
    const guardian = await prisma.guardian.findFirst({
        where: { id: input.guardianId, tenantId: input.tenantId },
    });
    if (!guardian) throw new Error("Apoderado no encontrado.");

    return prisma.child.create({
        data: {
            tenantId: input.tenantId,
            guardianId: input.guardianId,
            fullName: input.fullName.trim(),
            dni: input.dni?.trim() ?? null,
            age: input.age ?? null,
            gender: input.gender?.trim() ?? null,
        },
    });
}

// ── Session: code generation ─────────────────────────────────

async function generateUniqueCode(tenantId: string): Promise<string> {
    const activeSessions = await prisma.playSession.findMany({
        where: { tenantId, status: { in: ["ACTIVE", "PENDING"] } },
        select: { wristbandCode: true },
    });
    const usedCodes = new Set(activeSessions.map((s) => s.wristbandCode));
    if (usedCodes.size >= 1000) {
        throw new Error("Todos los códigos están en uso. Finaliza alguna sesión primero.");
    }
    const start = Math.floor(Math.random() * 1000);
    for (let i = 0; i < 1000; i++) {
        const code = String((start + i) % 1000).padStart(3, "0");
        if (!usedCodes.has(code)) return code;
    }
    throw new Error("No se encontró un código libre.");
}

// ── Session: create ──────────────────────────────────────────

export async function createPlaySession(input: CreatePlaySessionInput) {
    const child = await prisma.child.findFirst({
        where: { id: input.childId, tenantId: input.tenantId },
        include: { guardian: true },
    });
    if (!child) throw new Error("Niño no encontrado para este local.");

    // Una sesión PENDING abandonada (cobro nunca confirmado) no bloquea: se descarta
    await prisma.playSession.deleteMany({ where: { childId: input.childId, status: "PENDING" } });

    const companions = input.companions ?? 0;
    if (!Number.isInteger(companions) || companions < 0 || companions > MAX_COMPANIONS) {
        throw new Error(`Máximo ${MAX_COMPANIONS} acompañantes adicionales.`);
    }

    // Verify no active session already exists for this child
    const existing = await prisma.playSession.findFirst({
        where: { childId: input.childId, status: "ACTIVE" },
    });
    if (existing) {
        throw new Error(
            `${child.fullName} ya tiene una sesión activa con código ${existing.wristbandCode}.`
        );
    }

    const rates = await getPlayzoneRates(input.tenantId);
    if (input.durationMinutes !== undefined && !rates.durations.some((d) => d.minutes === input.durationMinutes)) {
        throw new Error(`No hay tarifa configurada para ${input.durationMinutes} min.`);
    }

    // Two concurrent starts can pick the same free code: the partial unique index rejects the loser (P2002), retry.
    const createWithCode = async () =>
        prisma.playSession.create({
            data: {
                tenantId: input.tenantId,
                childId: input.childId,
                durationMinutes: input.durationMinutes ?? null,
                companions,
                notes: input.notes?.trim() || null,
                wristbandCode: await generateUniqueCode(input.tenantId),
                // Con cargo base la sesión espera el cobro (processSale la activa); el tiempo libre se cobra al final
                status: companions > 0 || (input.durationMinutes !== undefined && !isUnder3(child.age)) ? "PENDING" : "ACTIVE",
                startTime: new Date(),
            },
            include: {
                child: { include: { guardian: true } },
            },
        });
    let session!: Awaited<ReturnType<typeof createWithCode>>;
    for (let attempt = 1; ; attempt++) {
        try {
            session = await createWithCode();
            break;
        } catch (e) {
            if ((e as { code?: string }).code !== "P2002" || attempt >= 5) throw e;
        }
    }

    // Cargo base a cobrar en caja (las sesiones de tiempo libre se cobran al finalizar)
    const baseCharge = session.durationMinutes === null ? null : computePlayzoneCharge(session, "base", rates);
    const charge = baseCharge && baseCharge.amount > 0 ? baseCharge : null;
    const companionsCharge = companions > 0 ? computePlayzoneCharge(session, "comp", rates) : null;
    return { ...session, charge, companionsCharge };
}

// ── Session: lookup by code ──────────────────────────────────

export async function lookupSessionByCode(tenantId: string, code: string) {
    const session = await prisma.playSession.findFirst({
        where: { tenantId, wristbandCode: code, status: "ACTIVE" },
        include: { child: { include: { guardian: true } } },
    });
    if (!session) return null;
    return enrichSession(session);
}

// ── Session: list active ─────────────────────────────────────

export async function listActiveSessions(tenantId: string) {
    const sessions = await prisma.playSession.findMany({
        where: { tenantId, status: "ACTIVE" },
        orderBy: { startTime: "asc" },
        include: { child: { include: { guardian: true } } },
    });
    return sessions.map(enrichSession);
}

// ── Session: cancel (quitada del carrito antes de cobrar) ────

export async function cancelPendingSession(tenantId: string, sessionId: string) {
    // Solo PENDING: una sesión ya cobrada/activa no se puede borrar desde el carrito
    const { count } = await prisma.playSession.deleteMany({ where: { id: sessionId, tenantId, status: "PENDING" } });
    if (count === 0) throw new Error("Sesión pendiente no encontrada.");
}

// ── Session: complete ────────────────────────────────────────

export async function completeSession(tenantId: string, sessionId: string) {
    const session = await prisma.playSession.findFirst({
        where: { id: sessionId, tenantId, status: "ACTIVE" },
        include: { child: { include: { guardian: true } } },
    });
    if (!session) throw new Error("Sesión activa no encontrada.");

    const rates = await getPlayzoneRates(tenantId);
    const endedAt = new Date();
    const elapsedMinutes = elapsedMinutesOf(session.startTime, endedAt);
    const includedMinutes = session.durationMinutes ?? null;
    const extraMinutes = includedMinutes === null
        ? 0
        : Math.max(0, elapsedMinutes - includedMinutes);
    const ended = { ...session, endTime: endedAt };
    const baseAmount = includedMinutes === null
        ? 0
        : rates.durations.find((d) => d.minutes === includedMinutes)?.price ?? 0;
    // Cargo pendiente de cobro en caja: tiempo extra o tiempo libre (null si no hay nada que cobrar)
    const charge = includedMinutes === null
        ? computePlayzoneCharge(ended, "free", rates)
        : extraMinutes > 0 ? computePlayzoneCharge(ended, "extra", rates) : null;
    const extraAmount = charge?.amount ?? 0;
    const totalAmount = baseAmount + extraAmount;

    // updateMany con status ACTIVE: dos "Finalizar" simultáneos no completan dos veces
    const { count } = await prisma.playSession.updateMany({
        where: { id: sessionId, tenantId, status: "ACTIVE" },
        data: { status: "COMPLETED", endTime: endedAt, notes: null },
    });
    if (count === 0) throw new Error("Sesión activa no encontrada.");
    const completed = await prisma.playSession.findUniqueOrThrow({ where: { id: sessionId } });

    return {
        ...completed,
        charge,
        ticket: {
            wristbandCode: session.wristbandCode,
            childName: session.child.fullName,
            guardianName: session.child.guardian.fullName,
            startTime: session.startTime,
            endTime: endedAt,
            elapsedMinutes,
            includedMinutes,
            extraMinutes,
            baseAmount,
            extraAmount,
            totalAmount,
            extraRatePerMinute: rates.extraPerMinute,
        },
    };
}

export async function getPlayzoneReportSummary(
    tenantId: string,
    periodDays: number
): Promise<PlayzoneReportSummary> {
    const safeDays = Number.isFinite(periodDays) && periodDays > 0
        ? Math.floor(periodDays)
        : 30;
    const fromDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [billedAgg, activeCount, completedSessions] = await Promise.all([
        prisma.sale.findMany({
            where: { tenantId, createdAt: { gte: fromDate } },
            select: {
                total: true, paymentMethod: true, status: true,
                items: { select: { productId: true, isVirtual: true, virtualSku: true, unitPrice: true, qty: true } },
            },
        }),
        prisma.playSession.count({ where: { tenantId, status: "ACTIVE" } }),
        prisma.playSession.findMany({
            where: {
                tenantId,
                status: "COMPLETED",
                endTime: { not: null, gte: fromDate },
            },
            orderBy: { endTime: "desc" },
            include: { child: { include: { guardian: true } } },
        }),
    ]);

    const withDurations = completedSessions.map((s) => {
        const endTime = s.endTime as Date;
        const elapsedMinutes = Math.max(
            0,
            Math.floor((endTime.getTime() - s.startTime.getTime()) / 60_000)
        );
        const overtimeMinutes = s.durationMinutes === null
            ? 0
            : Math.max(0, elapsedMinutes - s.durationMinutes);

        return {
            id: s.id,
            wristbandCode: s.wristbandCode,
            childId: s.childId,
            childName: s.child.fullName,
            guardianName: s.child.guardian.fullName,
            startTime: s.startTime,
            endTime,
            elapsedMinutes,
            overtimeMinutes,
        };
    });

    const completedCount = withDurations.length;
    const totalPlayedMinutes = withDurations.reduce((sum, s) => sum + s.elapsedMinutes, 0);
    const totalOvertimeMinutes = withDurations.reduce((sum, s) => sum + s.overtimeMinutes, 0);

    const childAgg = new Map<string, { childName: string; sessions: number; totalMinutes: number }>();
    for (const session of withDurations) {
        const prev = childAgg.get(session.childId);
        if (prev) {
            prev.sessions += 1;
            prev.totalMinutes += session.elapsedMinutes;
        } else {
            childAgg.set(session.childId, {
                childName: session.childName,
                sessions: 1,
                totalMinutes: session.elapsedMinutes,
            });
        }
    }

    const uniqueChildren = childAgg.size;
    const averageMinutesPerSession = completedCount > 0
        ? totalPlayedMinutes / completedCount
        : 0;
    const averageMinutesPerChild = uniqueChildren > 0
        ? totalPlayedMinutes / uniqueChildren
        : 0;

    const topChildren = Array.from(childAgg.entries())
        .map(([childId, value]) => ({
            childId,
            childName: value.childName,
            sessions: value.sessions,
            totalMinutes: value.totalMinutes,
            averageMinutes: value.totalMinutes / value.sessions,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes)
        .slice(0, 8);

    return {
        periodDays: safeDays,
        completedSessions: completedCount,
        activeSessions: activeCount,
        uniqueChildren,
        totalPlayedMinutes,
        averageMinutesPerSession,
        averageMinutesPerChild,
        totalOvertimeMinutes,
        billed: {
            count: billedAgg.filter((x) => x.status !== "CANCELLED").reduce((n, x) => n + x.items.filter((i) => i.virtualSku?.startsWith("pz-")).length, 0),
            total: aggregateSales(billedAgg).sales.byKind.zonaJuegos,
        },
        topChildren,
        recentCompleted: withDurations.slice(0, 20),
    };
}

// ── Enrich helper ────────────────────────────────────────────

function enrichSession(session: {
    id: string;
    wristbandCode: string;
    durationMinutes: number | null;
    startTime: Date;
    status: string;
    tenantId: string;
    childId: string;
    child: {
        fullName: string;
        dni: string | null;
        age: number | null;
        gender: string | null;
        guardian: { fullName: string; dni: string; phone: string | null };
    };
}) {
    const now = new Date();
    const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    const isUnlimited = session.durationMinutes === null;
    const remainingMinutes = isUnlimited
        ? null
        : Math.max(0, (session.durationMinutes ?? 0) - elapsedMinutes);

    return {
        ...session,
        childName: session.child.fullName,
        childDni: session.child.dni,
        childAge: session.child.age,
        childGender: session.child.gender,
        guardianName: session.child.guardian.fullName,
        guardianDni: session.child.guardian.dni,
        guardianPhone: session.child.guardian.phone,
        elapsedMinutes,
        remainingMinutes,
        isUnlimited,
        isOverdue: !isUnlimited && remainingMinutes === 0,
    };
}


