// Verificación del flujo de ventas en tenant desechable. Uso: BASE_URL=http://localhost:3041 bun --env-file=.env.test run scripts/verify-ventas.ts
import { createTenant, dropTenant, call, prisma } from "../tests/helpers.ts";
const c = await createTenant("ventas");
const T = c.cashierToken, tid = c.tid;
const ok = (n: string, v: boolean, x?: unknown) => console.log(v ? "OK  " : "FAIL", n, v ? "" : JSON.stringify(x));
try {
  await prisma.tenant.update({ where: { id: tid }, data: { electronicInvoicingEnabled: true, playzoneRates: { durations: [{ minutes: 30, price: 17.5, label: "30 Min" }], extraPerMinute: 1, freePerMinute: 0.5 } } });
  const sale = (items: any[], extra: any = {}) => call("POST", "/pos/sales", { token: T, body: { tenantId: tid, items, tipoComprobante: "TICKET", paymentMethod: "efectivo", ...extra } });
  const stock = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.stock;
  // producto (con línea repetida -> se suma)
  let r = await sale([{ productId: c.product.id, qty: 1 }, { productId: c.product.id, qty: 2 }]);
  ok("venta producto", r.status === 201 && r.json.data.items.length === 1 && (await stock(c.product.id)) === 7, r);
  r = await sale([{ productId: c.untracked.id, qty: 2 }]);
  ok("no-track sin stock", r.status === 201 && (await stock(c.untracked.id)) === 0, r);
  r = await sale([{ productId: "free-sale-1", qty: 1, unitPrice: 9.5, label: "Libre" }]);
  ok("venta libre", r.status === 201 && Number(r.json.data.sale.total) === 9.5, r);
  // zona de juegos
  const g = await call("POST", "/playzone/guardians", { token: T, body: { tenantId: tid, dni: "70000001", fullName: "Apo", childName: "Nino" } });
  const child = g.json.data.children[0].id;
  const s = await call("POST", "/playzone/sessions", { token: T, body: { tenantId: tid, childId: child, durationMinutes: 30 } });
  const sku = s.json.data.charge.sku;
  r = await sale([{ productId: sku, qty: 1, unitPrice: 0.01 }]);
  ok("pz precio de tarifa", r.status === 201 && Number(r.json.data.sale.total) === 17.5, r);
  r = await sale([{ productId: sku, qty: 1 }]);
  ok("pz segundo cobro 409", r.status === 409, r);
  r = await sale([{ productId: sku, qty: 1 }, { productId: sku, qty: 1 }]);
  ok("pz duplicado en venta rechazado", r.status === 409 || r.status === 422, r);
  const rep = await call("GET", "/playzone/reports/summary", { token: c.adminToken, query: { tenantId: tid, days: 1 } });
  ok("reporte pz billed", rep.json.data?.billed?.count === 1 && rep.json.data.billed.total === 17.5, rep.json);
  const cs = await call("GET", "/cash/summary", { token: c.adminToken, query: { tenantId: tid } });
  ok("billed = cash byKind.zonaJuegos", cs.json.data?.sales?.byKind?.zonaJuegos === rep.json.data.billed.total, cs.json);
  // filtros historial
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  let l = await call("GET", "/pos/sales", { token: T, query: { tenantId: tid, dateFrom: today, dateTo: today, status: "ACTIVE" } });
  ok("historial ACTIVE 4", l.json.data.length === 4, l.json.meta);
  // anulación con boleta aceptada
  r = await sale([{ productId: c.product.id, qty: 2 }], { tipoComprobante: "BOLETA", clientDocNumber: "12345678", clientDocType: "1", clientName: "X" });
  const bid = r.json.data.sale.id;
  ok("boleta aceptada", r.json.data.sale.sunatStatus === "ACEPTADA" && (await stock(c.product.id)) === 5, r.json);
  const v = await call("POST", `/pos/sales/${bid}/void`, { token: T, body: { tenantId: tid, reason: "error" } });
  const list = await call("GET", "/pos/void", { token: c.adminToken, query: { tenantId: tid, status: "PENDING" } });
  ok("solicitud en /pos/void", v.status === 201 && list.json.data.some((x: any) => x.id === v.json.data.id), list.json);
  const body = { tenantId: tid, approverCode: c.approvalCode, approve: true };
  const a1 = await call("POST", `/pos/void/${v.json.data.id}/resolve`, { token: c.adminToken, body });
  const a2 = await call("POST", `/pos/void/${v.json.data.id}/resolve`, { token: c.adminToken, body });
  const sd = await prisma.sale.findUnique({ where: { id: bid } });
  const nc = await prisma.billingNote.count({ where: { tenantId: tid } });
  ok("aprobar -> CANCELLED, stock restaurado, NC", a1.status === 200 && sd?.status === "CANCELLED" && (await stock(c.product.id)) === 7 && nc === 1, { a1: a1.json, nc });
  ok("doble aprobación 409", a2.status === 409, a2);
  // rechazo deja ACTIVE
  r = await sale([{ productId: c.product.id, qty: 1 }]);
  const v2 = await call("POST", `/pos/sales/${r.json.data.sale.id}/void`, { token: T, body: { tenantId: tid, reason: "x" } });
  await call("POST", `/pos/void/${v2.json.data.id}/resolve`, { token: c.adminToken, body: { ...body, approve: false } });
  ok("rechazo deja ACTIVE", (await prisma.sale.findUnique({ where: { id: r.json.data.sale.id } }))?.status === "ACTIVE");
  l = await call("GET", `/pos/sales/nope`, { token: T, query: { tenantId: tid } });
  ok("sale inexistente 404", l.status === 404, l);
} catch (e) { console.log("ERR", e); } finally { await dropTenant(tid); process.exit(0); }
