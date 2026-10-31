import { t } from "elysia";

// ============================================================
//  Shared Elysia validation schemas (type DTOs)
// ============================================================

// ── Pagination ──────────────────────────────────────────────
export const PaginationQuery = t.Object({
    page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
});

// ── Tenant context (present on every authenticated request) ──
export const TenantBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
});

// ── HR ───────────────────────────────────────────────────────
export const CreateWorkerBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1 }),
    dni: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
    roleId: t.String({ minLength: 1 }),
    /**
     * Optional: admin can supply a custom 5-digit PIN.
     * If omitted, the system auto-generates one.
     */
    pin: t.Optional(
        t.String({ pattern: "^[0-9]{5,6}$", description: "5 or 6 digit numeric PIN" })
    ),
    /**
     * Optional: 6-digit owner/admin approval code.
     * Required (or auto-generated) when the role is ADMIN/ADMINISTRADOR.
     */
    approvalCode: t.Optional(
        t.String({ pattern: "^[0-9]{6}$", description: "6-digit numeric approval code" })
    ),
    /** Admin's own 5-digit PIN, required to authorize this privileged action. */
    adminPin: t.String({ minLength: 1 }),
});

export const AttendanceBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    /** Raw 5-digit PIN entered by the worker, or can be longer for admin overrides */
    pin: t.String({ minLength: 1 }),
});

export const UpdateWorkerBody = t.Object({
    name: t.Optional(t.String({ minLength: 1 })),
    dni: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
    roleId: t.Optional(t.String({ minLength: 1 })),
    pin: t.Optional(
        t.String({ pattern: "^[0-9]{5,6}$", description: "5 or 6 digit numeric PIN" })
    ),
    approvalCode: t.Optional(
        t.String({ pattern: "^[0-9]{6}$", description: "6-digit numeric approval code" })
    ),
    isActive: t.Optional(t.Boolean()),
    /** Admin's own 5-digit PIN, required to authorize this privileged action. */
    adminPin: t.String({ minLength: 1 }),
});

// ── Inventory ────────────────────────────────────────────────
export const CreateCategoryBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1, maxLength: 80, pattern: "\\S" }),
    imageUrl: t.Optional(t.String()),
});

export const UpdateCategoryBody = t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 80, pattern: "\\S" })),
    imageUrl: t.Optional(t.String()), // "" clears the image
});

// Decimal(10,2) holds up to 99,999,999.99; stock is a Postgres int4.
const Money = t.Number({ minimum: 0, maximum: 99999999.99 });
const Stock = t.Integer({ minimum: 0, maximum: 2147483647 });

export const CreateProductBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    categoryId: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1, maxLength: 120, pattern: "\\S" }),
    sku: t.String({ minLength: 1, maxLength: 40, pattern: "^\\s*\\S+\\s*$" }),
    imageUrl: t.Optional(t.String()),
    price: Money,
    cost: t.Optional(Money),
    stock: t.Optional(Stock),
    minStock: t.Optional(Stock),
    trackStock: t.Optional(t.Boolean({ default: true })),
    igvRegime: t.Optional(t.String({ pattern: "^(GRAVADO|EXONERADO|INAFECTO|ICBPER|GRAVADO_10_5)$" })),
});

export const UpdateProductBody = t.Object({
    tenantId: t.Optional(t.String({ minLength: 1 })), // alternative to ?tenantId
    name: t.Optional(t.String({ minLength: 1, maxLength: 120, pattern: "\\S" })),
    imageUrl: t.Optional(t.String()), // "" clears the image
    categoryId: t.Optional(t.String({ minLength: 1 })),
    price: t.Optional(Money),
    cost: t.Optional(Money),
    minStock: t.Optional(Stock),
    isActive: t.Optional(t.Boolean()),
    trackStock: t.Optional(t.Boolean()),
    // "" = inherit the tenant default
    igvRegime: t.Optional(t.String({ pattern: "^(|GRAVADO|EXONERADO|INAFECTO|ICBPER|GRAVADO_10_5)$" })),
});

export const ImportProductsBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    /** Per-row validation (with row numbers) happens in the service so one bad row never rejects the file. */
    rows: t.Array(t.Record(t.String(), t.Unknown()), { minItems: 1, maxItems: 2000 }),
    /** Existing SKUs: overwrite stock with the file's value (default false = keep live stock). */
    updateStock: t.Optional(t.Boolean()),
});

export const AdjustStockBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    type: t.Union([t.Literal("ENTRADA"), t.Literal("SALIDA"), t.Literal("CORRECCION")]),
    quantity: t.Integer({ minimum: 0, maximum: 2147483647 }), // >0 enforced per type in the service
    reason: t.String({ minLength: 3, maxLength: 200 }),
});

// ── POS ──────────────────────────────────────────────────────
export const SaleItemInput = t.Object({
    productId: t.String({ minLength: 1 }),
    qty: t.Integer({ minimum: 1 }),
    /**
     * Client-supplied unit price, used ONLY for free-sale lines (`free-sale-*`).
     * Ignored for catalog products (price from DB) and playzone charges
     * (`pz-base|extra|free-<sessionId>`, priced from the tenant's playzone rates).
     */
    unitPrice: t.Optional(t.Number({ minimum: 0 })),
    /** Display name for free-sale lines (stored as SaleItem.virtualLabel). */
    label: t.Optional(t.String({ maxLength: 120 })),
});

export const CreateSaleBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    /** Ignorado: el cajero es el dueño del token Bearer. */
    workerId: t.Optional(t.String()),
    items: t.Array(SaleItemInput, { minItems: 1 }),
    tipoComprobante: t.String({ pattern: "^(TICKET|BOLETA|FACTURA)$", default: "TICKET" }),
    paymentMethod: t.String({ pattern: "^(efectivo|yape|tarjeta)$", default: "efectivo" }),
    clientDocType: t.Optional(t.String({ pattern: "^(1|6|-)$" })),
    clientDocNumber: t.Optional(t.String()),
    clientName: t.Optional(t.String()),
    clientAddress: t.Optional(t.String()),
});

// ── Play Zone ────────────────────────────────────────────────

export const GuardianLookupQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
    q: t.String({ minLength: 1, description: "DNI of the guardian" }),
});

export const GuardianListQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
    /** Optional substring match against guardian name or DNI. */
    search: t.Optional(t.String()),
    page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
});

export const CreateGuardianBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    dni: t.String({ minLength: 7, maxLength: 15 }),
    phone: t.Optional(t.String()),
    fullName: t.String({ minLength: 2 }),
    childName: t.String({ minLength: 1 }),
    childDni: t.Optional(t.String()),
    childAge: t.Optional(t.Integer({ minimum: 1, maximum: 17 })),
    childGender: t.Optional(t.String()),
});

export const AddChildBody = t.Object({
    guardianId: t.String({ minLength: 1 }),
    tenantId: t.String({ minLength: 1 }),
    fullName: t.String({ minLength: 1 }),
    dni: t.Optional(t.String()),
    age: t.Optional(t.Integer({ minimum: 1, maximum: 17 })),
    gender: t.Optional(t.String()),
});

export const CreatePlaySessionBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    childId: t.String({ minLength: 1 }),
    durationMinutes: t.Optional(t.Integer({ minimum: 1 })),
    allyDiscount: t.Optional(t.Boolean()),
    companions: t.Optional(t.Integer({ minimum: 0, maximum: 2 })),
    notes: t.Optional(t.String({ maxLength: 120 })),
});

export const PlaySessionLookupQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
    code: t.String({ pattern: "^[0-9]{3}$", description: "3-digit wristband code" }),
});

export const PlaySessionListQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
});

export const PlayzoneRatesQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
});

export const UpdatePlayzoneRatesBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    durations: t.Array(
        t.Object({
            minutes: t.Integer({ minimum: 1 }),
            price: t.Number({ minimum: 0 }),
            label: t.String({ minLength: 1, maxLength: 30 }),
        }),
        { minItems: 1 }
    ),
    extraPerMinute: t.Number({ minimum: 0 }),
    freePerMinute: t.Number({ minimum: 0 }),
    companionPrice: t.Optional(t.Number({ minimum: 0 })),
    wristbandEnabled: t.Optional(t.Boolean()),
});

export const PlayzoneReportQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
    days: t.Optional(t.Numeric({ minimum: 1, maximum: 365, default: 30 })),
});

// ── Birthdays ────────────────────────────────────────────────

export const CreateBirthdayBody = t.Object({
    tenantId: t.String({ minLength: 1 }),
    guardianId: t.String({ minLength: 1 }),
    date: t.String({ format: "date-time" }), // or date string
    guestCount: t.Integer({ minimum: 1, maximum: 300 }),
    notes: t.Optional(t.String()),
});

export const BirthdayListQuery = t.Object({
    tenantId: t.String({ minLength: 1 }),
});

export const UpdateBirthdayGuestBody = t.Object({
    firstName: t.Optional(t.String()),
    lastName: t.Optional(t.String()),
    attended: t.Optional(t.Boolean()),
});
