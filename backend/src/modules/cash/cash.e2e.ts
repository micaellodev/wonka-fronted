// E2E self-check for cash + dashboard against a running backend and the TEST DB.
// Run from backend/:  CAJA_URL=http://localhost:3012 bun --env-file=.env.test src/modules/cash/cash.e2e.ts
// Never run with backend/.env (production). Creates rows tagged "caja-e2e" and removes them at the end.
import { prisma } from "../../lib/prisma.ts";
import { limaDayBounds, limaYmd } from "./cash.service.ts";

if (!process.env["DATABASE_URL"]?.includes("localhost")) throw new Error("Refusing to run: DATABASE_URL is not local.");

const URL_ = process.env["CAJA_URL"] ?? "http://localhost:3012";
const T = "wonka_main_store_001";
let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + JSON.stringify(extra)}`);
};

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const login = async (pin: string) => (await call("POST", "/hr/verify-pin", null, { tenantId: T, pin })).json.token as string;

const cashier = await login("11111");
const admin = await login("12345");
const today = limaYmd();
const { start, end } = limaDayBounds(today);

// 1. Opening (persisted in DB, idempotent per Lima day)
const op1 = await call("POST", "/cash/opening", cashier, { tenantId: T, workerId: "demo_cajero_001", amount: 100 });
check("opening created or already open", op1.status === 201 || op1.status === 409, op1);
const op2 = await call("POST", "/cash/opening", cashier, { tenantId: T, workerId: "demo_cajero_001", amount: 100 });
check("second opening same day -> 409", op2.status === 409, op2);
const openToday = await call("GET", `/cash/opening-today?tenantId=${T}`, cashier);
check("opening-today isOpened", openToday.json?.data?.isOpened === true, openToday.json);
check("opening negative amount -> 422", (await call("POST", "/cash/opening", cashier, { tenantId: T, workerId: "demo_cajero_001", amount: -5 })).status === 422);

// 2. Manual movements
const mIn = await call("POST", "/cash/movements", cashier, { tenantId: T, workerId: "demo_cajero_001", type: "IN", amount: 50, currency: "PEN", reason: "caja-e2e in" });
const mOut = await call("POST", "/cash/movements", cashier, { tenantId: T, workerId: "demo_cajero_001", type: "OUT", amount: 20.5, currency: "PEN", reason: "caja-e2e out" });
check("movement IN 201", mIn.status === 201, mIn);
check("movement OUT 201", mOut.status === 201, mOut);
check("movement type OPENING rejected", (await call("POST", "/cash/movements", cashier, { tenantId: T, workerId: "demo_cajero_001", type: "OPENING", amount: 5, currency: "PEN", reason: "x" })).status === 422);
check("movement amount 0 rejected", (await call("POST", "/cash/movements", cashier, { tenantId: T, workerId: "demo_cajero_001", type: "IN", amount: 0, currency: "PEN", reason: "x" })).status === 422);

// 3. Sales: efectivo with a play-zone line, yape, and a cancelled efectivo sale
const mk = (total: number, paymentMethod: string, status: string, items: object[]) =>
  prisma.sale.create({
    data: { tenantId: T, workerId: "demo_cajero_001", total, paymentMethod, status, clientName: "caja-e2e", items: { create: items as any } },
  });
const s1 = await mk(30, "efectivo", "ACTIVE", [
  { qty: 1, unitPrice: 25, isVirtual: true, virtualSku: "pz-base-e2e", virtualLabel: "Zona de juegos 30 min" },
  { qty: 1, unitPrice: 5, isVirtual: true, virtualSku: "free-sale-e2e", virtualLabel: "Caramelo" },
]);
const s2 = await mk(20, "yape", "ACTIVE", [{ qty: 2, unitPrice: 10, isVirtual: true, virtualSku: "free-sale-e2e2", virtualLabel: "Jugo" }]);
const s3 = await mk(99, "efectivo", "CANCELLED", [{ qty: 1, unitPrice: 99, isVirtual: true, virtualSku: "pz-base-e2e3", virtualLabel: "Zona anulada" }]);

// 4. Summary vs independent DB computation
const sum = (await call("GET", `/cash/summary?tenantId=${T}`, cashier)).json?.data;
const dbSales = await prisma.sale.findMany({ where: { tenantId: T, createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } });
const by = (m: string) => Math.round(dbSales.filter((s) => s.paymentMethod === m).reduce((a, s) => a + Number(s.total), 0) * 100) / 100;
const dbMov = await prisma.cashMovement.findMany({ where: { tenantId: T, createdAt: { gte: start, lt: end }, currency: "PEN" } });
const mv = (t: string) => dbMov.filter((m) => m.type === t).reduce((a, m) => a + Number(m.amount), 0);
const opening = Number(dbMov.filter((m) => m.type === "OPENING").sort((a, b) => +a.createdAt - +b.createdAt)[0]?.amount ?? 0);
const expEf = Math.round((opening + by("efectivo") + mv("IN") - mv("OUT")) * 100) / 100;
check("summary efectivo sales = DB", sum?.sales?.efectivo === by("efectivo"), [sum?.sales, by("efectivo")]);
check("summary yape = DB", sum?.sales?.yape === by("yape"), [sum?.sales?.yape, by("yape")]);
check("summary expected efectivo = opening+efectivo+IN-OUT", sum?.expected?.efectivo === expEf, [sum?.expected, expEf]);
check("cancelled sale excluded and counted apart", sum?.cancelled?.count >= 1 && !dbSales.some((s) => s.id === s3.id));

// 5. Close: server computes expected; client sends counted only
const counted = { countedEfectivo: expEf - 1, countedYape: by("yape"), countedTarjeta: by("tarjeta") };
const close = await call("POST", "/cash/close", cashier, { tenantId: T, workerId: "demo_cajero_001", ...counted });
check("close 201", close.status === 201, close);
const row = await prisma.cashClose.findUnique({ where: { id: close.json?.data?.id } });
check("close persisted PENDING_APPROVAL", row?.status === "PENDING_APPROVAL");
check("close expectedEfectivo in DB", Number(row?.expectedEfectivo) === expEf, [row?.expectedEfectivo, expEf]);
check("close difference = counted - totalExpected = -1", Number(row?.difference) === -1, row);
check("client-sent expectedEfectivo ignored", [201, 422].includes((await call("POST", "/cash/close", cashier, { tenantId: T, workerId: "demo_cajero_001", ...counted, expectedEfectivo: 0 })).status) &&
  Number((await prisma.cashClose.findUnique({ where: { id: row!.id } }))?.expectedEfectivo) === expEf);

// 6. Approval: wrong code, cashier PIN, other tenant, admin approval code
const ap = (body: object, tok = cashier) => call("POST", `/cash/close/${row!.id}/approve`, tok, body);
check("approve wrong code -> 403", (await ap({ tenantId: T, approverCode: "999999" })).status === 403);
check("approve with cashier PIN -> 403", (await ap({ tenantId: T, approverCode: "11111" })).status === 403);
check("approve other tenant -> 403", (await ap({ tenantId: "other_tenant", approverCode: "060904" })).status === 403);
check("approve non-numeric code -> 422", (await ap({ tenantId: T, approverCode: "abc" })).status === 422);
const ok = await ap({ tenantId: T, approverCode: "060904" });
check("approve with admin approval code -> 200", ok.status === 200, ok);
const approved = await prisma.cashClose.findUnique({ where: { id: row!.id } });
check("DB APPROVED by review_admin_001", approved?.status === "APPROVED" && approved?.approvedByWorkerId === "review_admin_001", approved);
check("re-approve -> 422", (await ap({ tenantId: T, approverCode: "060904" })).status === 422);
// redo close -> back to pending; approve with admin PIN
await call("POST", "/cash/close", cashier, { tenantId: T, workerId: "demo_cajero_001", ...counted });
const okPin = await ap({ tenantId: T, approverCode: "12345" });
check("approve with admin PIN -> 200", okPin.status === 200 && okPin.json?.data?.approvedByWorkerId === "demo_admin_001", okPin);

// 7. History / reports / dashboard
const hist = await call("GET", `/cash/history?tenantId=${T}&days=7`, admin);
check("history includes today's close", hist.json?.data?.some((r: any) => r.id === row!.id && r.closedDate === today), hist.json?.data?.[0]);
const rep = (await call("GET", `/dashboard/sales-report?tenantId=${T}&from=${today}&to=${today}`, cashier)).json;
const dbAmount = Math.round(dbSales.reduce((a, s) => a + Number(s.total), 0) * 100) / 100;
check("sales-report amount = DB (no cancelled)", rep?.summary?.amount === dbAmount, [rep?.summary, dbAmount]);
const pzDb = await prisma.saleItem.findMany({ where: { virtualSku: { startsWith: "pz-" }, sale: { tenantId: T, createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } } });
check("play-zone lines counted once", rep?.summary?.playzone?.lines === pzDb.length, [rep?.summary?.playzone, pzDb.length]);
check("sale s1 listed once with virtual label", rep?.data?.filter((s: any) => s.id === s1.id).length === 1 && rep.data.find((s: any) => s.id === s1.id).items[0].product.name === "Zona de juegos 30 min");
check("sales-report bad range -> 422", (await call("GET", `/dashboard/sales-report?tenantId=${T}&from=${today}&to=2000-01-01`, cashier)).status === 422);
const met = await call("GET", `/dashboard/metrics?tenantId=${T}`, admin);
check("metrics sales today = DB", met.json?.data?.salesToday?.amount === dbAmount && met.json?.data?.cashCloseStatus === "APPROVED", met.json);
check("metrics as cashier -> 403", (await call("GET", `/dashboard/metrics?tenantId=${T}`, cashier)).status === 403);
const movs = await call("GET", `/cash/movements?tenantId=${T}&date=${today}`, cashier);
check("movements of today include e2e rows", movs.json?.data?.some((m: any) => m.id === mIn.json?.data?.id));
const openingRow = dbMov.find((m) => m.type === "OPENING");
check("delete opening -> 422", (await call("DELETE", `/cash/movements/${openingRow?.id}?tenantId=${T}`, admin)).status === 422);
check("delete movement as cashier -> 403", (await call("DELETE", `/cash/movements/${mIn.json?.data?.id}?tenantId=${T}`, cashier)).status === 403);
check("delete movement as admin -> 200", (await call("DELETE", `/cash/movements/${mIn.json?.data?.id}?tenantId=${T}`, admin)).status === 200);

// Cleanup
await prisma.sale.deleteMany({ where: { id: { in: [s1.id, s2.id, s3.id] } } });
await prisma.cashMovement.deleteMany({ where: { tenantId: T, reason: { startsWith: "caja-e2e" } } });
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
