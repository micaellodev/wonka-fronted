import { defineConfig } from '@playwright/test'

// Sin webServer: levantar antes backend :3031 (.env.test) y `VITE_API_URL=http://localhost:3031 bunx vite --port 5181 --strictPort`.
export default defineConfig({
  testDir: './e2e',
  // integration.spec needs its own throwaway tenant: run it with playwright.integration.config.ts
  testIgnore: ['integration.spec.ts', 'ui-keys.spec.ts', 'roles.spec.ts', 'shifts.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5181', headless: true, acceptDownloads: true,
    // el backend solo permite orígenes :5173/:5174 en CORS; el e2e corre en :5181
    launchOptions: { args: ['--disable-web-security'] } },
})
