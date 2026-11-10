// Precio de una reserva de cumpleaños: depende del plan y de la FECHA (lun–vie, sábado, domingo o feriado),
// de los niños que pasan de los incluidos y de los extras elegidos. Función pura: la usan la cotización y la reserva.

export type PlanExtra = { name: string; price: number };

export type PricingPlan = {
    priceWeekday: number;
    priceSaturday: number;
    /** Domingo y feriados */
    priceSunday: number;
    includedGuests: number;
    extraGuestPrice: number;
    extras: PlanExtra[];
};

export type DayKind = "weekday" | "saturday" | "sunday";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `date` es un día calendario guardado a medianoche UTC. Los feriados se comparan por YYYY-MM-DD. */
export function dayKindOf(date: Date, holidays: Set<string>): DayKind {
    if (holidays.has(date.toISOString().slice(0, 10))) return "sunday";
    const dow = date.getUTCDay();
    return dow === 0 ? "sunday" : dow === 6 ? "saturday" : "weekday";
}

export type BirthdayQuote = {
    dayKind: DayKind;
    basePrice: number;
    extraGuests: number;
    extraGuestsAmount: number;
    extras: Array<{ name: string; price: number; qty: number; amount: number }>;
    total: number;
};

export function quoteBirthday(
    plan: PricingPlan,
    date: Date,
    guestCount: number,
    selectedExtras: Array<{ name: string; qty: number }>,
    holidays: Set<string>
): BirthdayQuote {
    const dayKind = dayKindOf(date, holidays);
    const basePrice = dayKind === "sunday" ? plan.priceSunday : dayKind === "saturday" ? plan.priceSaturday : plan.priceWeekday;
    const extraGuests = Math.max(0, guestCount - plan.includedGuests);
    const extraGuestsAmount = round2(extraGuests * plan.extraGuestPrice);
    const extras = selectedExtras
        .filter((e) => e.qty > 0)
        .map((e) => {
            const def = plan.extras.find((x) => x.name === e.name);
            if (!def) throw new Error(`El extra "${e.name}" no existe en este plan.`);
            if (!Number.isInteger(e.qty) || e.qty > 50) throw new Error(`Cantidad inválida para "${e.name}".`);
            return { name: def.name, price: def.price, qty: e.qty, amount: round2(def.price * e.qty) };
        });
    const total = round2(basePrice + extraGuestsAmount + extras.reduce((s, e) => s + e.amount, 0));
    return { dayKind, basePrice, extraGuests, extraGuestsAmount, extras, total };
}
