import { prisma } from "../../lib/prisma.ts";
import { quoteBirthday, type PlanExtra, type PricingPlan } from "./birthday.pricing.ts";

// ============================================================
//  Birthday Service — Business Logic
// ============================================================

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const toNum = (v: unknown) => Number(v ?? 0);

// ── Planes (los edita el administrador) ──────────────────────

export type PlanInput = {
    name: string;
    description?: string | undefined;
    benefits?: string | undefined;
    includedGuests: number;
    extraGuestPrice: number;
    priceWeekday: number;
    priceSaturday: number;
    priceSunday: number;
    extras: PlanExtra[];
    isActive?: boolean | undefined;
};

type PlanRow = NonNullable<Awaited<ReturnType<typeof prisma.birthdayPlan.findFirst>>>;
const planOut = (p: PlanRow) => ({
    ...p,
    priceWeekday: toNum(p.priceWeekday), priceSaturday: toNum(p.priceSaturday), priceSunday: toNum(p.priceSunday), extraGuestPrice: toNum(p.extraGuestPrice),
    extras: (Array.isArray(p.extras) ? p.extras : []) as PlanExtra[],
});
const pricing = (p: PlanRow): PricingPlan => planOut(p);

export async function listPlans(tenantId: string, onlyActive = false) {
    const rows = await prisma.birthdayPlan.findMany({ where: { tenantId, ...(onlyActive ? { isActive: true } : {}) }, orderBy: { name: "asc" }, take: 100 });
    return rows.map(planOut);
}

function checkPlan(input: PlanInput) {
    if (!input.name.trim()) throw new Error("El plan necesita un nombre.");
    for (const n of [input.priceWeekday, input.priceSaturday, input.priceSunday, input.extraGuestPrice]) {
        if (!Number.isFinite(n) || n < 0) throw new Error("Los precios deben ser números mayores o iguales a 0.");
    }
    if (!Number.isInteger(input.includedGuests) || input.includedGuests < 0) throw new Error("Los niños incluidos deben ser un entero.");
    const names = input.extras.map((e) => e.name.trim());
    if (names.some((n) => !n) || new Set(names).size !== names.length) throw new Error("Los extras necesitan nombre y no pueden repetirse.");
    if (input.extras.some((e) => !Number.isFinite(e.price) || e.price < 0)) throw new Error("Precio de extra inválido.");
}

export async function createPlan(tenantId: string, input: PlanInput) {
    checkPlan(input);
    return prisma.birthdayPlan.create({
        data: {
            tenantId, name: input.name.trim(), description: input.description?.trim() || null, benefits: input.benefits?.trim() || null,
            includedGuests: input.includedGuests, extraGuestPrice: input.extraGuestPrice,
            priceWeekday: input.priceWeekday, priceSaturday: input.priceSaturday, priceSunday: input.priceSunday,
            extras: input.extras.map((e) => ({ name: e.name.trim(), price: e.price })), isActive: input.isActive ?? true,
        },
    });
}

export async function updatePlan(tenantId: string, id: string, input: PlanInput) {
    checkPlan(input);
    const { count } = await prisma.birthdayPlan.updateMany({
        where: { id, tenantId },
        data: {
            name: input.name.trim(), description: input.description?.trim() || null, benefits: input.benefits?.trim() || null,
            includedGuests: input.includedGuests, extraGuestPrice: input.extraGuestPrice,
            priceWeekday: input.priceWeekday, priceSaturday: input.priceSaturday, priceSunday: input.priceSunday,
            extras: input.extras.map((e) => ({ name: e.name.trim(), price: e.price })), isActive: input.isActive ?? true,
        },
    });
    if (count === 0) throw new Error("Plan no encontrado.");
}

export async function deletePlan(tenantId: string, id: string) {
    const used = await prisma.birthdayReservation.count({ where: { tenantId, planId: id } });
    if (used > 0) throw new Error("El plan ya tiene reservas: desactívalo en vez de eliminarlo.");
    const { count } = await prisma.birthdayPlan.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new Error("Plan no encontrado.");
}

// ── Feriados (cuentan como domingo) ──────────────────────────

export async function listHolidays(tenantId: string) {
    const rows = await prisma.birthdayHoliday.findMany({ where: { tenantId }, orderBy: { date: "asc" }, take: 400 });
    return rows.map((h) => ({ id: h.id, date: ymd(h.date), label: h.label }));
}

export async function addHoliday(tenantId: string, date: string, label: string) {
    const d = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida.");
    return prisma.birthdayHoliday.upsert({
        where: { tenantId_date: { tenantId, date: d } },
        create: { tenantId, date: d, label: label.trim() || "Feriado" },
        update: { label: label.trim() || "Feriado" },
    });
}

export async function removeHoliday(tenantId: string, id: string) {
    const { count } = await prisma.birthdayHoliday.deleteMany({ where: { id, tenantId } });
    if (count === 0) throw new Error("Feriado no encontrado.");
}

async function holidaySet(tenantId: string): Promise<Set<string>> {
    return new Set((await listHolidays(tenantId)).map((h) => h.date));
}

// ── Cotización ───────────────────────────────────────────────

export async function quoteForPlan(tenantId: string, planId: string, date: Date, guestCount: number, extras: Array<{ name: string; qty: number }>) {
    const plan = await prisma.birthdayPlan.findFirst({ where: { id: planId, tenantId } });
    if (!plan) throw new Error("Plan no encontrado.");
    return { planName: plan.name, ...quoteBirthday(pricing(plan), date, guestCount, extras, await holidaySet(tenantId)) };
}

// ── Reservas ─────────────────────────────────────────────────

type ReservationInput = {
    tenantId: string;
    guardianId: string;
    date: Date;
    guestCount: number;
    notes?: string | undefined;
    planId?: string | undefined;
    extras?: Array<{ name: string; qty: number }> | undefined;
};

/** Cargo para el carrito: el servidor lo recalcula al cobrar (`bd-<id>`), el monto aquí es para mostrar. */
function birthdayCharge(r: { id: string; date: Date; planName: string | null; totalPrice: unknown; guardian?: { fullName: string } | null }) {
    const price = toNum(r.totalPrice);
    if (price <= 0) return null;
    return {
        sku: `bd-${r.id}`,
        kind: "bday" as const,
        sessionId: r.id,
        label: `CUMPLEAÑOS ${r.planName ?? ""} ${r.date.toLocaleDateString("es-PE", { timeZone: "UTC" })}${r.guardian ? ` - ${r.guardian.fullName}` : ""}`.replace(/\s+/g, " ").trim(),
        amount: price,
    };
}

export async function createBirthdayReservation(input: ReservationInput) {
    const guardian = await prisma.guardian.findFirst({ where: { id: input.guardianId, tenantId: input.tenantId } });
    if (!guardian) throw new Error("Apoderado no encontrado.");

    const quote = input.planId ? await quoteForPlan(input.tenantId, input.planId, input.date, input.guestCount, input.extras ?? []) : null;

    const reservation = await prisma.birthdayReservation.create({
        data: {
            tenantId: input.tenantId,
            guardianId: input.guardianId,
            date: input.date,
            guestCount: input.guestCount,
            notes: input.notes ?? null,
            ...(quote ? { planId: input.planId!, planName: quote.planName, extras: quote.extras, totalPrice: quote.total, priceBreakdown: quote } : {}),
            guests: {
                create: Array.from({ length: input.guestCount }).map(() => ({ tenantId: input.tenantId, firstName: "", lastName: "", attended: false })),
            },
        },
        include: { guests: true, guardian: true },
    });

    return { ...reservation, charge: birthdayCharge(reservation) };
}

/** Cambia fecha, niños, plan o extras: el precio se recalcula con la fecha nueva (solo si aún no se cobró). */
export async function updateBirthdayReservation(
    tenantId: string,
    id: string,
    patch: { date?: Date | undefined; guestCount?: number | undefined; notes?: string | undefined; planId?: string | undefined; extras?: Array<{ name: string; qty: number }> | undefined }
) {
    const r = await prisma.birthdayReservation.findFirst({ where: { id, tenantId }, include: { guests: true, guardian: true } });
    if (!r) throw new Error("Reserva no encontrada.");
    const billed = await prisma.saleItem.findFirst({ where: { virtualSku: `bd-${id}`, sale: { tenantId, status: { not: "CANCELLED" } } }, select: { id: true } });
    const priceChange = patch.date !== undefined || patch.guestCount !== undefined || patch.planId !== undefined || patch.extras !== undefined;
    if (billed && priceChange) throw new Error("La reserva ya fue cobrada: no se puede cambiar fecha, niños, plan ni extras.");

    const date = patch.date ?? r.date;
    const guestCount = patch.guestCount ?? r.guestCount;
    const planId = patch.planId ?? r.planId ?? undefined;
    const extras = patch.extras ?? ((r.extras as Array<{ name: string; qty: number }> | null) ?? []);
    const quote = planId ? await quoteForPlan(tenantId, planId, date, guestCount, extras) : null;

    // Ajusta la lista de invitados: agrega vacíos o quita vacíos del final
    if (patch.guestCount !== undefined && patch.guestCount !== r.guests.length) {
        if (patch.guestCount > r.guests.length) {
            await prisma.birthdayGuest.createMany({ data: Array.from({ length: patch.guestCount - r.guests.length }, () => ({ tenantId, reservationId: id, firstName: "", lastName: "", attended: false })) });
        } else {
            const removable = [...r.guests].reverse().filter((g) => !g.firstName && !g.lastName && !g.attended).slice(0, r.guests.length - patch.guestCount);
            if (removable.length < r.guests.length - patch.guestCount) throw new Error("Hay invitados con nombre o asistencia: bórralos antes de reducir la cantidad.");
            await prisma.birthdayGuest.deleteMany({ where: { id: { in: removable.map((g) => g.id) } } });
        }
    }

    const updated = await prisma.birthdayReservation.update({
        where: { id },
        data: {
            date, guestCount, ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            ...(quote ? { planId: planId!, planName: quote.planName, extras: quote.extras, totalPrice: quote.total, priceBreakdown: quote } : {}),
        },
        include: { guests: true, guardian: true },
    });
    return { ...updated, charge: billed ? null : birthdayCharge(updated) };
}

export async function listBirthdayReservations(tenantId: string) {
    const rows = await prisma.birthdayReservation.findMany({
        where: { tenantId },
        orderBy: { date: "asc" },
        include: { guardian: true, guests: true },
        // shortcut: hard cap keeps the payload bounded; add date filters/pagination if a tenant exceeds it.
        take: 1000,
    });
    // "Cobrado" = existe una venta no anulada con la línea bd-<id>
    const billed = await prisma.saleItem.findMany({
        where: { virtualSku: { in: rows.map((r) => `bd-${r.id}`) }, sale: { tenantId, status: { not: "CANCELLED" } } },
        select: { virtualSku: true },
    });
    const paid = new Set(billed.map((b) => b.virtualSku));
    return rows.map((r) => ({ ...r, totalPrice: r.totalPrice === null ? null : toNum(r.totalPrice), paid: paid.has(`bd-${r.id}`), charge: paid.has(`bd-${r.id}`) ? null : birthdayCharge(r) }));
}

export async function getBirthdayDetails(tenantId: string, id: string) {
    const reservation = await prisma.birthdayReservation.findFirst({
        where: { id, tenantId },
        include: { guests: { orderBy: { id: "asc" } }, guardian: true },
    });
    if (!reservation) throw new Error("Reserva no encontrada.");
    const billed = await prisma.saleItem.findFirst({ where: { virtualSku: `bd-${id}`, sale: { tenantId, status: { not: "CANCELLED" } } }, select: { id: true } });
    return { ...reservation, totalPrice: reservation.totalPrice === null ? null : toNum(reservation.totalPrice), paid: !!billed, charge: billed ? null : birthdayCharge(reservation) };
}

export async function updateBirthdayGuest(
    tenantId: string,
    guestId: string,
    data: { firstName?: string; lastName?: string; attended?: boolean }
) {
    const guest = await prisma.birthdayGuest.findFirst({ where: { id: guestId, tenantId } });
    if (!guest) throw new Error("Invitado no encontrado.");

    return prisma.birthdayGuest.update({
        where: { id: guestId },
        data: {
            ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
            ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
            ...(data.attended !== undefined ? { attended: data.attended } : {}),
        },
    });
}
