// Tenant desechable para el e2e de integración. Uso: bun --env-file=.env.test run scripts/qa-int-tenant.ts [drop <tid>]
import { createTenant, dropTenant, prisma, sha256 } from "../tests/helpers.ts";
if (process.argv[2] === "drop") { await dropTenant(process.argv[3]!); process.exit(0); }
const c = await createTenant("qaie2e");
await prisma.product.update({ where: { id: c.product.id }, data: { name: "Chocolate E2E", stock: 10, price: 5 } });
await prisma.tenant.update({ where: { id: c.tid }, data: { playzoneRates: { durations: [{ minutes: 30, price: 17.5, label: "30 Min" }, { minutes: 60, price: 30, label: "1 Hora" }], extraPerMinute: 1, freePerMinute: 0.5 } } });
// Roles finos para e2e/roles.spec.ts: PIN 33333 = GERENTE, 44444 = COCINA
for (const [name, pin] of [["GERENTE", "33333"], ["COCINA", "44444"]] as const) {
    const role = await prisma.role.create({ data: { tenantId: c.tid, name } });
    await prisma.worker.create({ data: { tenantId: c.tid, roleId: role.id, name: `QA ${name}`, pinHash: sha256(`${c.tid}:${pin}`) } });
}
console.log(c.tid);
process.exit(0);
