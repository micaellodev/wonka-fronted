# Graph Report - .  (2026-08-05)

## Corpus Check
- 118 files · ~75,915 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 673 nodes · 1290 edges · 31 communities (29 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend Core Services
- Inventory & PlayZone
- UI Component Library
- Fiscal & POS System
- Backend Dependencies
- Frontend Dependencies
- Frontend Dev Tools
- Checkout & Employees
- Reports & Sales History
- Admin Dashboard UI
- Frontend TS Config
- Backend TS Config
- Vite TS Config
- Shadcn Registry
- PlayZone Frontend
- App Shell & Routing
- POS Screen
- Cashier & Payments
- Billing & Auth Modals
- Admin Gatekeeper
- Login & Cash Drawer
- Splash & Admin Pages
- Frontend Base Config
- Prisma Seed Script
- Graphify Plugin
- Env Type Definitions

## God Nodes (most connected - your core abstractions)
1. `cn()` - 68 edges
2. `useAuthStore` - 50 edges
3. `compilerOptions` - 20 edges
4. `api` - 19 edges
5. `compilerOptions` - 18 edges
6. `compilerOptions` - 17 edges
7. `formatCurrency()` - 16 edges
8. `Button` - 14 edges
9. `scripts` - 11 edges
10. `SalesHistoryScreen()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `TabsContent()` --calls--> `cn()`  [EXTRACTED]
  wonka-fronted/src/components/ui/tabs.tsx → wonka-fronted/src/lib/utils.ts
- `CatalogTabs()` --calls--> `cn()`  [EXTRACTED]
  wonka-fronted/src/pages/POSScreen.tsx → wonka-fronted/src/lib/utils.ts
- `SidebarSubItem()` --calls--> `cn()`  [EXTRACTED]
  wonka-fronted/src/pages/POSScreen.tsx → wonka-fronted/src/lib/utils.ts
- `AdminScreen()` --calls--> `useAuthStore`  [EXTRACTED]
  wonka-fronted/src/pages/AdminScreen.tsx → wonka-fronted/src/store/authStore.ts
- `CashCloseHistory()` --calls--> `useAuthStore`  [EXTRACTED]
  wonka-fronted/src/pages/CashierScreen.tsx → wonka-fronted/src/store/authStore.ts

## Import Cycles
- None detected.

## Communities (31 total, 2 thin omitted)

### Community 0 - "Backend Core Services"
Cohesion: 0.06
Nodes (45): App, PORT, adapter, globalForPrisma, pool, prisma, supabase, supabaseBucket (+37 more)

### Community 1 - "Inventory & PlayZone"
Cohesion: 0.06
Nodes (50): inventoryController, createCategory(), createProduct(), CreateProductInput, listCategories(), listProducts(), ListProductsInput, updateCategory() (+42 more)

### Community 2 - "UI Component Library"
Cohesion: 0.08
Nodes (42): react, react, Separator(), Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader() (+34 more)

### Community 3 - "Fiscal & POS System"
Cohesion: 0.08
Nodes (44): apisperuController, buildClient(), buildCompany(), buildCreditNotePayload(), buildDetails(), buildFiscalSummary(), buildInvoicePayload(), calculateFiscalLine() (+36 more)

### Community 4 - "Backend Dependencies"
Cohesion: 0.05
Nodes (42): @elysiajs/cors, @elysiajs/swagger, pg, prisma, @prisma/adapter-pg, @prisma/client, @supabase/supabase-js, @types/bun (+34 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.05
Nodes (41): @base-ui/react, class-variance-authority, clsx, date-fns, @elysiajs/eden, @fontsource-variable/geist, lucide-react, react-day-picker (+33 more)

### Community 6 - "Frontend Dev Tools"
Cohesion: 0.05
Nodes (39): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss, @tailwindcss/vite, @types/react (+31 more)

### Community 7 - "Checkout & Employees"
Cohesion: 0.08
Nodes (27): calculateLine(), CheckoutLine, IgvRegime, InvoiceType, PaymentMethod, resolveRegime(), RightCheckoutDrawerProps, TenantFiscalConfig (+19 more)

### Community 8 - "Reports & Sales History"
Cohesion: 0.10
Nodes (33): Table(), TableBody(), TableCell(), TableHead(), TableHeader(), TableRow(), Tabs(), TabsContent() (+25 more)

### Community 9 - "Admin Dashboard UI"
Cohesion: 0.18
Nodes (20): CashOpeningModalProps, Badge(), BadgeVariant, styles, Button, buttonVariants, Card, CardContent (+12 more)

### Community 10 - "Frontend TS Config"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, ES2020, compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx (+17 more)

### Community 11 - "Backend TS Config"
Cohesion: 0.08
Nodes (24): ESNext, node_modules, prisma/**/*, compilerOptions, allowImportingTsExtensions, exactOptionalPropertyTypes, lib, module (+16 more)

### Community 12 - "Vite TS Config"
Cohesion: 0.09
Nodes (22): ES2023, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+14 more)

### Community 13 - "Shadcn Registry"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 14 - "PlayZone Frontend"
Cohesion: 0.13
Nodes (16): ActiveSession, BirthdaysView(), calcElapsed(), Child, DURATION_OPTIONS, DurationOpt, fmtPrice(), fmtTime() (+8 more)

### Community 15 - "App Shell & Routing"
Cohesion: 0.19
Nodes (17): AdminGuard(), App(), CashDrawerGuardRoute(), PosGuard(), RootRedirect(), WorkerGuard(), rootElement, AdminDashboardScreen() (+9 more)

### Community 16 - "POS Screen"
Cohesion: 0.18
Nodes (13): formatCurrency(), formatTime(), CartRow(), CatalogTabs(), POSScreen(), ProductCard(), SaleToday, SidebarSubItem() (+5 more)

### Community 17 - "Cashier & Payments"
Cohesion: 0.18
Nodes (8): RightCheckoutDrawer(), CashCloseHistory(), CashierScreen(), PlayzoneSummary, LedgerPaymentMethod, PaymentLedgerEntry, PaymentLedgerState, usePaymentLedgerStore

### Community 18 - "Billing & Auth Modals"
Cohesion: 0.29
Nodes (7): AttendanceModal(), AttendanceModalProps, CreateBillingNoteModal(), Props, api, AuthState, Worker

### Community 19 - "Admin Gatekeeper"
Cohesion: 0.24
Nodes (8): AdminGatekeeper(), AdminGatekeeperProps, KEYS, KeyValue, PinPad(), PinPadProps, AdminState, useAdminStore

### Community 20 - "Login & Cash Drawer"
Cohesion: 0.29
Nodes (7): CashDrawerGuard(), CashOpeningModal(), Mode, PostUnlockMode, ToastState, CashDrawerState, useCashDrawerStore

### Community 21 - "Splash & Admin Pages"
Cohesion: 0.38
Nodes (4): Logo(), LogoProps, AdminScreen(), SplashScreen()

### Community 22 - "Frontend Base Config"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, files, references

### Community 23 - "Prisma Seed Script"
Cohesion: 0.40
Nodes (3): adapter, pool, prisma

## Knowledge Gaps
- **252 isolated node(s):** `name`, `module`, `type`, `private`, `dev` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Component Library` to `Checkout & Employees`, `Reports & Sales History`, `Admin Dashboard UI`, `App Shell & Routing`, `POS Screen`, `Cashier & Payments`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Frontend Dependencies` to `UI Component Library`, `Frontend Dev Tools`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `react` connect `UI Component Library` to `Frontend Dependencies`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **What connects `name`, `module`, `type` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Core Services` be split into smaller, more focused modules?**
  _Cohesion score 0.06412583182093164 - nodes in this community are weakly interconnected._
- **Should `Inventory & PlayZone` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `UI Component Library` be split into smaller, more focused modules?**
  _Cohesion score 0.08078431372549019 - nodes in this community are weakly interconnected._