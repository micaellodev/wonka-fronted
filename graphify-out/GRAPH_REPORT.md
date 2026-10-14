# Graph Report - Wonka  (2026-10-13)

## Corpus Check
- 179 files · ~136,893 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: (none) 6, .example 3, .css 3)

## Summary
- 1685 nodes · 3539 edges · 114 communities (90 shown, 24 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `548763bb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Button
- hr.service.ts
- cn
- schemas.ts
- apisperu.service.ts
- admin_routes.py
- ProductsTab.tsx
- main.py
- Wonka Asistencia Attendance App (Python/FastAPI)
- PlayZoneScreen.tsx
- fronted/package.json
- components.json
- dependencies
- compilerOptions
- compilerOptions
- compilerOptions
- graphify Knowledge Graph System (AGENTS.md)
- devDependencies
- backend/package.json
- build
- Caveman Voice Mode
- main.js
- gsap.min.js
- Guia de Despliegue de Actualizaciones (Wonka update deployment guide)
- api.ts
- prisma
- scripts
- cash.service.ts
- playzone.service.ts
- fronted/tsconfig.json
- env.d.ts
- react
- opencode.json
- QR-based Attendance/Verification Scanning
- Claude Code Host (mode persistence)
- OpenCode Plugin Host
- Checkin Mobile Template
- copyLink
- employeeForm submit handler
- Login Template
- loadReports
- scheduleForm submit handler
- App Icon (W monogram)
- Frontend App Icon
- App Icon (Smiling Mouth Logo)
- Renzo Wonka Logo
- Vite Logo (vite.svg)
- inventory.service.ts
- seed.ts
- State & Feedback Patterns
- CashCloseScreen.tsx
- componer-musica.py
- generar-voz.mjs
- prisma.ts
- Motion Design Skill
- scripts
- Inventario de controles — Wonka POS
- Tween
- upload.controller.ts
- useAuthStore
- Common Recipes
- Coordinated Sequences
- Choreography
- src/index.ts
- pos.service.ts
- dependencies
- Disney's 12 Principles — UI Adapted
- ce
- Ambient & Continuous Patterns
- Timing & Easing Tables
- ReportsScreen.tsx
- scripts
- 4-Level Decision Hierarchy
- Four Archetypes
- Troubleshooting
- Context Adaptation
- Narrative Structure
- Quality Checklist
- auth.py
- config.py
- schemas.py
- SalesHistoryScreen.tsx
- mock-apisperu.ts
- summary.ts
- button.tsx
- Core Philosophy
- SKILL.md
- hyperframes.json
- Emotion-to-Motion Mapping
- checkin_routes.py
- Coordinación del equipo — Wonka POS
- db-inventario — schema, inventario, upload
- billing.service.ts
- na
- launcher.py
- la
- Renzo Wonka · Video promocional (Hyperframes)
- lucide-react
- devDependencies
- fb
- he
- Za
- Rd
- birthday.controller.ts
- integration.spec.ts
- Integración entre módulos — contrato (líder)
- Renzo Wonka POS Vite HTML entry point
- eslint.config.js
- apisperu.controller.ts
- peerDependencies

## God Nodes (most connected - your core abstractions)
1. `cn()` - 79 edges
2. `Button` - 56 edges
3. `useAuthStore` - 56 edges
4. `react` - 46 edges
5. `lucide-react` - 34 edges
6. `api` - 29 edges
7. `prisma` - 25 edges
8. `Card` - 25 edges
9. `TerminalShell()` - 24 edges
10. `Input` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Definiciones canónicas (implementadas UNA vez en `backend/src/modules/cash/summary.ts`, reutilizadas por cash, dashboard y reportes)` --references--> `limaYmd()`  [INFERRED]
  docs/equipo/integracion-contrato.md → backend/src/modules/cash/cash.service.ts
- `graphify (project pointer, .claude/CLAUDE.md)` --semantically_similar_to--> `graphify Knowledge Graph System (AGENTS.md)`  [INFERRED] [semantically similar]
  .claude/CLAUDE.md → AGENTS.md
- `graphify (project pointer, .claude/CLAUDE.md)` --semantically_similar_to--> `graphify Knowledge Graph System (CLAUDE.md)`  [INFERRED] [semantically similar]
  .claude/CLAUDE.md → CLAUDE.md
- `Panel admin` --references--> `DaySummary`  [INFERRED]
  docs/equipo/integracion-contrato.md → backend/src/modules/cash/summary.ts
- `Respuesta canónica `DaySummary` (`GET /cash/summary?tenantId&date?`)` --references--> `DaySummary`  [INFERRED]
  docs/equipo/integracion-contrato.md → backend/src/modules/cash/summary.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Caveman Sibling Skills (caveman/ultracave/megacave)** — _agents_skills_caveman_readme_caveman, _agents_skills_caveman_readme_ultracave, _agents_skills_caveman_readme_megacave [EXTRACTED 1.00]
- **Ponytail Intensity Levels (lite/full/ultra)** — _agents_skills_ponytail_skill_lite, _agents_skills_ponytail_skill_full, _agents_skills_ponytail_skill_ultra [EXTRACTED 1.00]
- **Bearer-Token-From-localStorage Auth Pattern** — asistencia_templates_dashboard_loaddashboard, asistencia_templates_employee_form_loademployee, asistencia_templates_qr_display_loademployees, asistencia_templates_reports_loadreports, asistencia_templates_schedule_loadschedule [INFERRED 0.85]

## Communities (114 total, 24 thin omitted)

### Community 0 - "Button"
Cohesion: 0.18
Nodes (26): CashOpeningModal(), CashOpeningModalProps, Badge(), Button, Card, CardContent, CardDescription, CardHeader (+18 more)

### Community 1 - "hr.service.ts"
Cohesion: 0.15
Nodes (31): clientIp(), signToken(), attempts, checkRateLimit(), Entry, RateLimitError, resetRateLimit(), undoAttempt() (+23 more)

### Community 2 - "cn"
Cohesion: 0.05
Nodes (74): RECEIPT_LOGO, apiErrorMessage(), calculateLine(), CheckoutLine, escapeHtml(), IgvRegime, InvoiceType, numberToWords() (+66 more)

### Community 3 - "schemas.ts"
Cohesion: 0.15
Nodes (18): AddChildBody, AttendanceBody, CreateGuardianBody, CreatePlaySessionBody, CreateWorkerBody, GuardianListQuery, GuardianLookupQuery, Money (+10 more)

### Community 4 - "apisperu.service.ts"
Cohesion: 0.13
Nodes (25): buildClient(), buildDetails(), buildFiscalSummary(), buildInvoicePayload(), calculateFiscalLine(), DniQueryResult, EmissionResult, emitInvoice() (+17 more)

### Community 5 - "admin_routes.py"
Cohesion: 0.14
Nodes (21): admin_login(), CheckinRequest, create_employee(), EmployeeCreate, EmployeeUpdate, export_reports(), generate_qr(), get_biometric_options() (+13 more)

### Community 6 - "ProductsTab.tsx"
Cohesion: 0.08
Nodes (65): Input, Skeleton(), Table(), TableBody(), TableCell(), TableHead(), TableHeader(), TableRow() (+57 more)

### Community 7 - "main.py"
Cohesion: 0.30
Nodes (10): checkin_page(), edit_employee_page(), employees_page(), index(), login_page(), new_employee_page(), qr_display_page(), register_biometric_page() (+2 more)

### Community 8 - "Wonka Asistencia Attendance App (Python/FastAPI)"
Cohesion: 0.07
Nodes (37): asyncpg==0.31.0, fastapi==0.115.6, jinja2==3.1.4, openpyxl==3.1.5, passlib[bcrypt]==1.7.4, python-jose[cryptography]==3.3.0, python-multipart==0.0.18, qrcode[pil]==8.0 (+29 more)

### Community 9 - "PlayZoneScreen.tsx"
Cohesion: 0.14
Nodes (21): ActiveSession, BirthdaysView(), calcElapsed(), Child, DurationOpt, fmtPrice(), fmtTime(), FREE_OPTION (+13 more)

### Community 10 - "fronted/package.json"
Cohesion: 0.07
Nodes (27): elysia, @types/node, typescript, main, name, private, type, version (+19 more)

### Community 11 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 12 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, @base-ui/react, class-variance-authority, clsx, date-fns, elysia, @elysiajs/eden, @fontsource-variable/geist (+15 more)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+12 more)

### Community 14 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, exactOptionalPropertyTypes, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 15 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 16 - "graphify Knowledge Graph System (AGENTS.md)"
Cohesion: 0.12
Nodes (17): graphify (project pointer, .claude/CLAUDE.md), graphify-out/graph.json, graphify-out/GRAPH_REPORT.md, graphify Knowledge Graph System (AGENTS.md), graphify explain command, graphify path command, graphify query command, graphify update . command (+9 more)

### Community 17 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, cross-env, electron, electron-builder, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+11 more)

### Community 18 - "backend/package.json"
Cohesion: 0.12
Nodes (14): elysia, @types/node, typescript, module, name, private, type, @elysiajs/cors (+6 more)

### Community 19 - "build"
Cohesion: 0.13
Nodes (15): build, appId, directories, files, forceCodeSigning, nsis, productName, win (+7 more)

### Community 20 - "Caveman Voice Mode"
Cohesion: 0.19
Nodes (11): Caveman Skill (voice), Megacave Skill, Ultracave Skill, ASD-STE100 (Simplified Technical English standard), Caveman Voice Mode, Megacave (alias reference), Ultracave (alias reference), Ponytail Full Level (default) (+3 more)

### Community 21 - "main.js"
Cohesion: 0.17
Nodes (7): { app, BrowserWindow, ipcMain }, path, { contextBridge, ipcRenderer }, electron, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 22 - "gsap.min.js"
Cohesion: 0.07
Nodes (15): Gc(), Hc(), ia(), ja(), Lc(), Nc(), oa(), pa() (+7 more)

### Community 24 - "api.ts"
Cohesion: 0.14
Nodes (22): AdminGatekeeper(), AdminGatekeeperProps, AttendanceModal(), AttendanceModalProps, KEYS, KeyValue, PinPad(), PinPadProps (+14 more)

### Community 25 - "prisma"
Cohesion: 0.13
Nodes (23): prisma, boleta(), sell(), BASE, call(), createTenant(), Ctx, dropTenant() (+15 more)

### Community 26 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, electron:build, electron:dev, lint, preview, tauri

### Community 28 - "cash.service.ts"
Cohesion: 0.22
Nodes (22): cashController, approveCashClose(), CashCloseInput, CashCloseRecord, CashMovementRecord, closeInclude, CloseRow, createCashMovement() (+14 more)

### Community 29 - "playzone.service.ts"
Cohesion: 0.11
Nodes (30): playzoneController, addChild(), AddChildInput, ChargeableSession, completeSession(), computePlayzoneCharge(), createGuardian(), CreateGuardianInput (+22 more)

### Community 30 - "fronted/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, files, references

### Community 31 - "env.d.ts"
Cohesion: 0.40
Nodes (4): ElectronAPI, ImportMeta, ImportMetaEnv, Window

### Community 32 - "react"
Cohesion: 0.16
Nodes (9): BadgeVariant, styles, rootElement, CASH_LABEL, CASH_TONE, CashStatus, DashboardStats, react (+1 more)

### Community 51 - "inventory.service.ts"
Cohesion: 0.10
Nodes (38): fail(), IdParams, inventoryController, TenantQuery, adjustStock(), AdjustType, assertCategory(), categorySelect (+30 more)

### Community 52 - "seed.ts"
Cohesion: 0.25
Nodes (7): adapter, main(), pool, prisma, sha256(), pg, @prisma/adapter-pg

### Community 53 - "State & Feedback Patterns"
Cohesion: 0.08
Nodes (23): Button Press, Checkmark Success, Confirmation Badge, Corporate, Disabled / Enabled, Error Shake, Error State, Focus States (+15 more)

### Community 54 - "CashCloseScreen.tsx"
Cohesion: 0.23
Nodes (11): apiErrorMessage(), CashDrawerGuard(), apiErrorMessage(), CashCloseRecord, CashCloseScreen(), formatPEN(), formatSpanishDate(), ShiftSummary (+3 more)

### Community 55 - "componer-musica.py"
Cohesion: 0.25
Nodes (17): bass(), bell(), bp(), clap(), env(), hp(), kick(), lead() (+9 more)

### Community 56 - "generar-voz.mjs"
Cohesion: 0.13
Nodes (18): args, audioDir, duration(), force, hasEdge(), LINES, ok(), pureEnv (+10 more)

### Community 57 - "prisma.ts"
Cohesion: 0.13
Nodes (11): adapter, globalForPrisma, pool, ap(), call(), counted, login(), opening (+3 more)

### Community 58 - "Motion Design Skill"
Cohesion: 0.10
Nodes (21): Button Press (Playful), Card Entrance (Premium), Choreography Essentials, Common Patterns, CRITICAL — never break, Duration Table, Easing Selection, Emotion-to-Motion Map (+13 more)

### Community 59 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:generate, db:migrate, db:push, db:seed, db:studio, dev (+3 more)

### Community 60 - "Inventario de controles — Wonka POS"
Cohesion: 0.09
Nodes (21): Admin dashboard / Empresa / Aprobaciones, Apertura de caja (CashDrawerGuard / CashOpeningModal), Checkout (RightCheckoutDrawer), Cierre de caja (CashCloseScreen), Empleados / Roles / Asistencia (EmployeesScreen), Historial de cierres (CashCloseHistoryScreen), Historial de ventas (SalesHistoryScreen), Integración entre módulos (+13 more)

### Community 61 - "Tween"
Cohesion: 0.18
Nodes (21): _a(), Ao(), _assertThisInitialized(), cb(), cc(), ga(), gb(), hb() (+13 more)

### Community 62 - "upload.controller.ts"
Cohesion: 0.29
Nodes (8): StorageUnavailableError, supabase, supabaseBucket, uploadFileToStorage(), ALLOWED_UPLOAD_FOLDERS, AllowedUploadFolder, uploadController, @supabase/supabase-js

### Community 63 - "useAuthStore"
Cohesion: 0.16
Nodes (19): AdminAuth(), AdminGuard(), App(), CashDrawerGuardRoute(), PosGuard(), RootRedirect(), WorkerGuard(), AdminLayout() (+11 more)

### Community 64 - "Common Recipes"
Cohesion: 0.11
Nodes (17): 1. Direct Entrance (Slide In), 1. Direct Exit (Slide Out), 2. Dissolve Exit (Fade Out), 2. Emergent Entrance (Scale In), 3. Collapse Exit (Shrink Out), 3. Reveal Entrance (Clip/Mask), 4. Assembled Entrance (Multi-Part), 4. Transfer Exit (Move Away) (+9 more)

### Community 65 - "Coordinated Sequences"
Cohesion: 0.11
Nodes (17): Accordion, Choreography Rules, Coordinated Sequences, Counter-Motion, Dashboard Widgets, Drag and Drop, Grid Cards, Group Rules (+9 more)

### Community 66 - "Choreography"
Cohesion: 0.12
Nodes (15): 1. Lead with the Hero, 2. Spatial Origin Consistency, 3. Counter-Motion, Attention Direction, Choreography, Common Recipes, Coordinated Entry Rules, Dashboard Load (+7 more)

### Community 67 - "src/index.ts"
Cohesion: 0.12
Nodes (19): App, PORT, ADMIN_ROUTES, ADMIN_WRITE_PREFIXES, authGuard, AuthPayload, denial(), getAuth() (+11 more)

### Community 68 - "pos.service.ts"
Cohesion: 0.15
Nodes (23): posController, buildReceiptHtml(), ComprobanteType, createVoidRequest(), CreateVoidRequestInput, formatPEN(), getNextCorrelative(), getSaleById() (+15 more)

### Community 69 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, elysia, @elysiajs/cors, @elysiajs/swagger, nodemailer, pg, @prisma/adapter-pg, @prisma/client (+1 more)

### Community 70 - "Disney's 12 Principles — UI Adapted"
Cohesion: 0.14
Nodes (14): 10. Exaggeration, 11. Solid Drawing, 12. Appeal, 1. Squash and Stretch, 2. Anticipation, 3. Staging, 4. Straight Ahead vs. Pose to Pose, 5. Follow Through and Overlapping Action (+6 more)

### Community 71 - "ce"
Cohesion: 0.22
Nodes (14): Ae(), ce(), $d(), ee(), ha(), ka(), le(), me() (+6 more)

### Community 72 - "Ambient & Continuous Patterns"
Cohesion: 0.15
Nodes (12): Ambient & Continuous Patterns, Breathing / Pulse, Combining Ambient Layers, Continuous Rotation, Dust/Motes: 5-10 elements, 10-30px/s mixed, 2-5px, 20-50% opacity, Floating / Hovering, Gradient Shift, Parallax (+4 more)

### Community 73 - "Timing & Easing Tables"
Cohesion: 0.17
Nodes (12): Distance-Duration Scaling, Duration by Element Type, Duration by Personality, Easing: Directional Rules, Easing: Industry Standards, Enter vs. Exit, Interactive Feedback, Material-Based Easing (+4 more)

### Community 74 - "ReportsScreen.tsx"
Cohesion: 0.26
Nodes (12): apiErrorMessage(), CashCloseRecord, formatCurrencyPEN(), formatCurrencyUSD(), formatDateKey(), formatLongDate(), formatShiftTimeString(), fromDateKey() (+4 more)

### Community 75 - "scripts"
Cohesion: 0.15
Nodes (12): name, private, scripts, check, dev, musica, render, render:alta (+4 more)

### Community 76 - "4-Level Decision Hierarchy"
Cohesion: 0.17
Nodes (12): 1. Purpose?, 2. Audience?, 3. Context?, 4-Level Decision Hierarchy, Decision Framework, Decision Quick-Path, Evaluation Before Delivery, Level 1: Motion Category (+4 more)

### Community 77 - "Four Archetypes"
Cohesion: 0.17
Nodes (12): 1. Signature Easing (80% of animations), 2. Duration Palette, 3. Entrance Pattern, Brand Motion Identity, Corporate / Professional, Energetic / Dynamic, Four Archetypes, Keyword Matching (+4 more)

### Community 78 - "Troubleshooting"
Cohesion: 0.18
Nodes (11): Feels Cheap / Flat, Feels Too Fast / Jarring, Feels Too Slow, Inconsistent Feel, Looks Robotic, No Personality, Performance (Dropped Frames), Personality Mistakes (+3 more)

### Community 79 - "Context Adaptation"
Cohesion: 0.18
Nodes (10): Accessibility, Cognitive Accessibility, Content Type Adaptation, Context Adaptation, Dark Mode, Performance Budgets, Platform Scaling, prefers-reduced-motion (+2 more)

### Community 80 - "Narrative Structure"
Cohesion: 0.18
Nodes (10): Act 1: Anticipation (10-20%), Act 2: Action (30-50%), Act 3: Reaction (10-20%), Act 4: Resolution (20-30%), By Personality, Common Patterns, Four-Act Structure, Multi-Beat Narratives (+2 more)

### Community 81 - "Quality Checklist"
Cohesion: 0.18
Nodes (10): Accessibility Quality, CRITICAL, Emotional Quality, HIGH, MEDIUM, Performance Quality, Quality Checklist, Severity Tiers (+2 more)

### Community 82 - "auth.py"
Cohesion: 0.29
Nodes (5): generate_authentication_options(), generate_registration_options(), get_current_admin(), verify_authentication(), verify_registration()

### Community 83 - "config.py"
Cohesion: 0.24
Nodes (4): check(), _required(), init_db(), startup()

### Community 84 - "schemas.py"
Cohesion: 0.29
Nodes (7): CheckinRequest, EmployeeCreate, EmployeeUpdate, LoginRequest, ScheduleUpdate, WebAuthnLoginRequest, WebAuthnRegisterRequest

### Community 85 - "SalesHistoryScreen.tsx"
Cohesion: 0.24
Nodes (14): apiErrorMessage(), escapeHtml(), formatDateKey(), formatLongDateLabel(), formatPEN(), formatTableDateTime(), formatUSD(), fromDateKey() (+6 more)

### Community 86 - "mock-apisperu.ts"
Cohesion: 0.24
Nodes (9): accepted, json(), log, Mode, modeFor(), PORT, sendDocument(), server (+1 more)

### Community 87 - "summary.ts"
Cohesion: 0.26
Nodes (12): aggregateSales(), CashStatus, closeFigures(), round2(), SaleLike, dashboardController, assertNonNegativeInteger(), getDashboardStats() (+4 more)

### Community 88 - "button.tsx"
Cohesion: 0.18
Nodes (15): ActiveSection, CASH_LABEL, getSectionFromPath(), SectionGroup(), TerminalShell(), TerminalShellProps, buttonVariants, ApiCashMovement (+7 more)

### Community 89 - "Core Philosophy"
Cohesion: 0.22
Nodes (8): Core Philosophy, Pillar 1: Emotional Intent, Pillar 2: Visual Narrative, Pillar 3: Motion Craft, The 1/3 Screen Rule, The Attention Budget, Three Motion Layers, Three Pillars

### Community 90 - "SKILL.md"
Cohesion: 0.14
Nodes (9): Color, Combined Properties, Opacity, Performance, Position, Property Selection, Property Selection by Goal, Rotation (+1 more)

### Community 91 - "hyperframes.json"
Cohesion: 0.22
Nodes (8): media, autoProxy, paths, assets, blocks, components, registry, $schema

### Community 92 - "Emotion-to-Motion Mapping"
Cohesion: 0.25
Nodes (7): Color Psychology, Color Transition Rules, Context-Based Emotion Defaults, Core Table, Emotion-to-Motion Mapping, Emotional Intensity, Path as Emotional Language

### Community 94 - "Coordinación del equipo — Wonka POS"
Cohesion: 0.25
Nodes (7): Bloqueos / avisos entre agentes, Contratos acordados (el líder decide; cambios se anotan aquí), Coordinación del equipo — Wonka POS, Direcciones SendMessage (campo `to`), Entorno de pruebas (OBLIGATORIO), Propiedad de archivos (uno edita a la vez; si necesitas un archivo ajeno, pide el cambio al dueño vía SendMessage o anótalo abajo), Solicitudes de schema

### Community 95 - "db-inventario — schema, inventario, upload"
Cohesion: 0.20
Nodes (9): Aplicar en producción (NO ejecutado; hacerlo el responsable de deploy), Cambios de schema aplicados (DB local de test), db-inventario — schema, inventario, upload, Inventario (backend `modules/inventory`, `types/schemas.ts` sección Inventory), Inventario v2 (2026-10-13) — SQL para producción (NO aplicado), Pendientes, Pruebas (curl :3015 con token Bearer, verificado en DB), Seed (+1 more)

### Community 96 - "billing.service.ts"
Cohesion: 0.21
Nodes (19): buildCompany(), buildCreditNotePayload(), buildManualNotePayload(), formatCorrelative(), formatSunatDate(), createBillingNote(), CreateBillingNoteInput, createVoidCreditNote() (+11 more)

### Community 97 - "na"
Cohesion: 0.25
Nodes (6): Aa(), Ca(), na(), Vb(), wb(), Xb()

### Community 99 - "la"
Cohesion: 0.47
Nodes (6): Animation(), Da(), la(), ma(), Ua(), Va()

### Community 100 - "Renzo Wonka · Video promocional (Hyperframes)"
Cohesion: 0.33
Nodes (5): Dirección de movimiento, Estructura, Guion y tiempos, Renderizar, Renzo Wonka · Video promocional (Hyperframes)

### Community 101 - "lucide-react"
Cohesion: 0.17
Nodes (14): BillingNoteResult, CreateBillingNoteModal(), emptyForm, NoteType, Props, REASONS, validate(), BillingNotesScreen() (+6 more)

### Community 102 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, prisma, @types/bun, @types/node, @types/nodemailer, @types/pg

### Community 103 - "fb"
Cohesion: 0.40
Nodes (5): Context(), Db(), Eb(), fb(), Gw()

### Community 104 - "he"
Cohesion: 0.40
Nodes (5): he(), Md(), Nd(), Od(), Pd()

### Community 105 - "Za"
Cohesion: 0.40
Nodes (5): kb(), ob(), ra(), rb(), Za()

### Community 106 - "Rd"
Cohesion: 0.40
Nodes (5): Rd(), Vd(), Wd(), yd(), ye()

### Community 107 - "birthday.controller.ts"
Cohesion: 0.38
Nodes (8): birthdayController, createBirthdayReservation(), getBirthdayDetails(), listBirthdayReservations(), updateBirthdayGuest(), BirthdayListQuery, CreateBirthdayBody, UpdateBirthdayGuestBody

### Community 108 - "integration.spec.ts"
Cohesion: 0.10
Nodes (11): Endpoints (mantener el sobre de respuesta existente `{ data, meta? }`), Inventario v2 — contrato compartido (líder), Propiedad de archivos, Schema (ya aplicado en local por el líder; no editar schema.prisma sin pedirlo), api(), pin(), relogin(), summary() (+3 more)

### Community 109 - "Integración entre módulos — contrato (líder)"
Cohesion: 0.25
Nodes (8): DaySummary, Checklist de reglas (qa-int la mantiene en `controles.md` § Integración, con columnas UI / API-DB / Bloqueo), Definiciones canónicas (implementadas UNA vez en `backend/src/modules/cash/summary.ts`, reutilizadas por cash, dashboard y reportes), Integración entre módulos — contrato (líder), Panel admin, Principio, Propiedad de archivos (uno edita a la vez), Respuesta canónica `DaySummary` (`GET /cash/summary?tenantId&date?`)

### Community 111 - "eslint.config.js"
Cohesion: 0.29
Nodes (6): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, typescript-eslint

### Community 112 - "apisperu.controller.ts"
Cohesion: 0.70
Nodes (4): apisperuController, consultaDNI(), consultaRUC(), resolveApisPeruUrl()

## Ambiguous Edges - Review These
- `QR-based Attendance/Verification Scanning` → `QR Code Image`  [AMBIGUOUS]
  fronted/public/qr-code.png · relation: conceptually_related_to
- `Wonka Asistencia Attendance App (Python/FastAPI)` → `wonka-backend (Bun/TypeScript runtime)`  [AMBIGUOUS]
  backend/README.md · relation: conceptually_related_to
- `Wonka Asistencia Attendance App (Python/FastAPI)` → `Boleta Electronica receipt (Emiliani Pizzas y Pastas EIRL)`  [AMBIGUOUS]
  boleta.html · relation: conceptually_related_to

## Knowledge Gaps
- **66 isolated node(s):** `@types/bun`, `@types/node`, `@types/nodemailer`, `@types/pg`, `typescript` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 768 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@playwright/test` connect `integration.spec.ts` to `fronted/package.json`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **What connects `@types/bun`, `@types/node`, `@types/nodemailer` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.05303030303030303 - nodes in this community are weakly interconnected._
- **Why does `pin()` connect `integration.spec.ts` to `prisma`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Should `apisperu.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13105413105413105 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `QR-based Attendance/Verification Scanning` and `QR Code Image`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Wonka Asistencia Attendance App (Python/FastAPI)` and `wonka-backend (Bun/TypeScript runtime)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._