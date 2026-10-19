import { defineConfig } from '@playwright/test'

// Sin webServer. Preparar:
//  backend: PORT=3043 bun --env-file=.env.test run src/index.ts  (+ mock APISPeru :3999)
//  tenant:  BASE_URL=http://localhost:3043 bun --env-file=.env.test run scripts/qa-int-tenant.ts  -> imprime TID
//  ui:      VITE_API_URL=http://localhost:3043 VITE_TENANT_ID=$TID bunx vite --port 5183 --strictPort
export default defineConfig({
  testDir: './e2e',
  testMatch: /(integration|ui-keys|roles|shifts)\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5183', headless: true, screenshot: 'only-on-failure',
    launchOptions: { args: ['--disable-web-security'] } },
})
