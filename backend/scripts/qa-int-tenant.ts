// Tenant desechable para el e2e de integración. Uso: bun --env-file=.env.test run scripts/qa-int-tenant.ts [drop <tid>]
import { createTenant, dropTenant, prisma } from "../tests/helpers.ts";
if (process.argv[2] === "drop") { await dropTenant(process.argv[3]!); process.exit(0); }
const c = await createTenant("qaie2e");
await prisma.product.update({ where: { id: c.product.id }, data: { name: "Chocolate E2E", stock: 10, price: 5 } });
await prisma.tenant.update({ where: { id: c.tid }, data: { playzoneRates: { durations: [{ minutes: 30, price: 17.5, label: "30 Min" }, { minutes: 60, price: 30, label: "1 Hora" }], extraPerMinute: 1, freePerMinute: 0.5 } } });
console.log(c.tid);
process.exit(0);
