import { prisma } from "../../lib/prisma.ts";

// ============================================================
//  Birthday Service — Business Logic
// ============================================================

export async function createBirthdayReservation(input: {
    tenantId: string;
    guardianId: string;
    date: Date;
    guestCount: number;
    notes?: string | undefined;
}) {
    const guardian = await prisma.guardian.findFirst({
        where: { id: input.guardianId, tenantId: input.tenantId },
    });
    if (!guardian) throw new Error("Apoderado no encontrado.");

    const reservation = await prisma.birthdayReservation.create({
        data: {
            tenantId: input.tenantId,
            guardianId: input.guardianId,
            date: input.date,
            guestCount: input.guestCount,
            notes: input.notes ?? null,
            guests: {
                create: Array.from({ length: input.guestCount }).map(() => ({
                    tenantId: input.tenantId,
                    firstName: "",
                    lastName: "",
                    attended: false,
                })),
            },
        },
        include: { guests: true, guardian: true },
    });

    return reservation;
}

export async function listBirthdayReservations(tenantId: string) {
    return prisma.birthdayReservation.findMany({
        where: { tenantId },
        orderBy: { date: "asc" },
        include: { guardian: true, guests: true },
        // shortcut: hard cap keeps the payload bounded; add date filters/pagination if a tenant exceeds it.
        take: 1000,
    });
}

export async function getBirthdayDetails(tenantId: string, id: string) {
    const reservation = await prisma.birthdayReservation.findFirst({
        where: { id, tenantId },
        include: { guests: { orderBy: { id: "asc" } }, guardian: true },
    });
    if (!reservation) throw new Error("Reserva no encontrada.");
    return reservation;
}

export async function updateBirthdayGuest(
    tenantId: string,
    guestId: string,
    data: { firstName?: string; lastName?: string; attended?: boolean }
) {
    const guest = await prisma.birthdayGuest.findFirst({
        where: { id: guestId, tenantId },
    });
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
