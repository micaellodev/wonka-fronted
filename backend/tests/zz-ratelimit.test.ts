// Runs last: hammers the PIN endpoint on a throwaway tenant so other suites' logins are unaffected.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { call, createTenant, dropTenant, type Ctx } from "./helpers.ts";

let c: Ctx;
beforeAll(async () => { c = await createTenant("qarl"); });
afterAll(async () => { await dropTenant(c.tid); });

test("PIN fallido repetido → 429 (rate limit)", async () => {
    let last = 0;
    for (let i = 0; i < 40 && last !== 429; i++) {
        last = (await call("POST", "/hr/verify-pin", { body: { tenantId: c.tid, pin: String(10000 + i) } })).status;
    }
    expect(last).toBe(429);
});
