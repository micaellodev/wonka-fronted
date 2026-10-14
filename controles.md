# Inventario de controles — Wonka POS

Fuente: rutas de `fronted/src/App.tsx` y handlers (`onClick`/`onSubmit`/`onKeyDown`/forms) de cada pantalla y componente.
Resultado: `pendiente` (sin probar) · `probado` (verificado por E2E de API en `backend/tests/` y/o revisión de código del handler) · `bloqueado: <motivo>`.
Evidencia: `e2e:<archivo>#<test>` = test de `bun test` contra backend :3016 + verificación en DB; `código:<archivo>:<línea>` = handler revisado (solo UI, sin llamada a API).

## Rutas (App.tsx)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| Router | `/` sin sesión | Muestra LoginScreen | — | probado | código:fronted/src/App.tsx:30-34 |
| Router | `/` con sesión | Redirige a `/cash-guard` | — | probado | código:fronted/src/App.tsx:30-33 |
| Router | `/cash-guard` sin sesión | Redirige a `/` | — | probado | código:fronted/src/App.tsx:36-38 |
| Router | `/pos`, `/sales-history`, `/register-client`, `/playzone`, `/cash-close`, `/movimientos-caja`, `/reporte-cierre-turno`, `/estadisticas-venta` sin sesión | Redirigen a `/` (WorkerGuard/PosGuard) | — | probado | código:fronted/src/App.tsx:42-50,72-79 |
| Router | `/admin/*` con cajero | Redirige a `/pos` (AdminGuard) y el backend rechaza rutas admin con 403 | guard backend | probado | código:fronted/src/App.tsx:54-59; backend e2e:auth.test.ts#cashier ... → 403 |
| Router | `/admin/playzone` | Accesible a cualquier trabajador (WorkerGuard) | — | probado | código:fronted/src/App.tsx:90 |
| Router | ruta desconocida `*` | Redirige a `/` | — | probado | código:fronted/src/App.tsx:93 |
| Splash | `/splash` | Pantalla de carga, sin controles | — | probado | código:fronted/src/App.tsx:69 |

## TitleBar / TerminalShell
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| TitleBar | Botón minimizar | Minimiza ventana (Tauri) | — | bloqueado: API Tauri (ventana nativa) no ejecutable fuera de la app de escritorio | |
| TitleBar | Botón maximizar | Maximiza/restaura ventana | — | bloqueado: API Tauri (ventana nativa) no ejecutable fuera de la app de escritorio | |
| TitleBar | Botón cerrar | Cierra la app | — | bloqueado: API Tauri (ventana nativa) no ejecutable fuera de la app de escritorio | |
| TerminalShell | Botón "Admin" | Navega a `/admin` (solo admin pasa el guard) | — | probado | código:fronted/src/components/TerminalShell.tsx:47 |
| TerminalShell | Botón cerrar sesión | `logout()` y navega a `/` | — | probado | código:fronted/src/components/TerminalShell.tsx:26-27 |
| TerminalShell | Nav "Caja" | Navega a `/pos` | — | probado | código:fronted/src/components/TerminalShell.tsx:65,121 |
| TerminalShell | Nav "Historial de ventas" | Navega a `/sales-history` | — | probado | código:fronted/src/components/TerminalShell.tsx:66,121 |
| TerminalShell | Nav "Estadísticas de venta" | Navega a `/estadisticas-venta` | — | probado | código:fronted/src/components/TerminalShell.tsx:67,121 |
| TerminalShell | Nav "Movimientos de caja" | Navega a `/movimientos-caja` | — | probado | código:fronted/src/components/TerminalShell.tsx:68,121 |
| TerminalShell | Nav "Apertura y cierre de caja" | Navega a `/cash-close` | — | probado | código:fronted/src/components/TerminalShell.tsx:69,121 |
| TerminalShell | Nav "Reporte cierre/turno" | Navega a `/reporte-cierre-turno` | — | probado | código:fronted/src/components/TerminalShell.tsx:70,121 |
| TerminalShell | Nav "Registrar cliente" | Navega a `/register-client` | — | probado | código:fronted/src/components/TerminalShell.tsx:78,121 |
| TerminalShell | Nav "Tiempos" | Navega a `/playzone` | — | probado | código:fronted/src/components/TerminalShell.tsx:79,121 |
| TerminalShell | Indicador "Apertura" | Muestra monto de apertura del día | GET /cash/opening-today (o store) | probado | e2e:flow-sales-cash.test.ts#apertura de caja |

## Login / PinPad / Gatekeeper / Asistencia
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| Login | PIN 5 dígitos correcto (cajero 11111) | Login, guarda trabajador+token, navega | POST /hr/verify-pin → 200 | probado | e2e:auth.test.ts#login PIN |
| Login | PIN 5 dígitos admin (12345) | Login con rol ADMIN | POST /hr/verify-pin → 200 | probado | e2e:auth.test.ts#login PIN |
| Login | PIN 6 dígitos admin (060904) | Login con rol ADMIN | POST /hr/verify-pin → 200 | probado | e2e:auth.test.ts#login PIN |
| Login | PIN incorrecto | Mensaje de error, sin sesión | POST /hr/verify-pin → 401 | probado | e2e:auth.test.ts#login PIN |
| Login | Muchos intentos fallidos | Rate limit (429/422) | lib/rateLimiter | probado | e2e:zz-ratelimit.test.ts#PIN fallido repetido → 429 |
| PinPad | Dígitos 0-9 | Agregan dígito (máx. 6) | — | probado | código:fronted/src/components/PinPad.tsx:41-47 |
| PinPad | Botón limpiar (X) | Borra todo el PIN | — | probado | código:fronted/src/components/PinPad.tsx:39 |
| PinPad | Botón borrar dígito | Borra último dígito | — | probado | código:fronted/src/components/PinPad.tsx:40 |
| PinPad | Botón "Entrar" (5 dígitos) / auto-envío a 6 | Envía PIN | POST /hr/verify-pin | probado | código:fronted/src/components/PinPad.tsx:30-35,43-45,130 |
| AdminGatekeeper | Ingresar PIN admin | Desbloquea funciones admin | POST /hr/verify-admin | probado | e2e:inventory-hr.test.ts#crear rol (admin token + adminPin) |
| AdminGatekeeper | Cerrar | Cierra modal | — | probado | código:fronted/src/components/AdminGatekeeper.tsx:58 |
| AttendanceModal | Ingresar PIN | Marca CHECK_IN / CHECK_OUT | POST /hr/attendance; tabla attendances | probado | e2e:inventory-hr.test.ts#asistencia: check-in y luego check-out |
| AttendanceModal | Cerrar | Cierra modal | — | probado | código:fronted/src/components/AttendanceModal.tsx:57 |
| App asistencia/ | Marcar asistencia por PIN | CHECK_IN / CHECK_OUT | POST /hr/attendance (público) | probado | e2e:inventory-hr.test.ts#asistencia: check-in y luego check-out |

## Apertura de caja (CashDrawerGuard / CashOpeningModal)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| CashDrawerGuard | Verificación al entrar | Si no hay apertura del día muestra modal; si hay, redirige a `/admin` (admin) o `/pos` | GET /cash/opening-today | probado | e2e:flow-sales-cash.test.ts#apertura de caja |
| CashOpeningModal | Input monto | Acepta monto ≥ 0 | — | probado | código:fronted/src/components/CashOpeningModal.tsx:15,55 |
| CashOpeningModal | Enter / botón "Abrir caja" | Registra apertura y redirige | movimiento OPENING / store | probado | e2e:flow-sales-cash.test.ts#apertura de caja |
| CashOpeningModal | Monto vacío/negativo | Muestra error | — | probado | código:fronted/src/components/CashOpeningModal.tsx:19-21,71-74 |

## POS (POSScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| POS | Carga de catálogo | Lista productos y categorías activas | GET /inventory/products, /inventory/categories | probado | e2e:inventory-hr.test.ts#listar productos |
| POS | Tab "Buscar" + input "Buscar productos" | Filtra productos por texto | — | probado | código:fronted/src/pages/POSScreen.tsx:289,507 |
| POS | Tab "Favoritos" | Muestra favoritos | — | probado | código:fronted/src/pages/POSScreen.tsx:442,493 |
| POS | Tab "Productos" | Muestra todos los productos | — | probado | código:fronted/src/pages/POSScreen.tsx:289,423 |
| POS | Tab "Categorías" + tarjeta de categoría | Muestra productos de la categoría | — | probado | código:fronted/src/pages/POSScreen.tsx:467 |
| POS | Botón "Volver a categorías" | Vuelve al listado de categorías | — | probado | código:fronted/src/pages/POSScreen.tsx:432 |
| POS | Botón recargar productos | Re-consulta catálogo | GET /inventory/products | probado | código:fronted/src/pages/POSScreen.tsx:309,447 |
| POS | Tarjeta de producto | Agrega al carrito (respeta stock) | cartStore | probado | código:fronted/src/pages/POSScreen.tsx:486,527 |
| POS | Tab "Venta libre": nombre, monto, cantidad −/+, IGV, "Agregar" | Agrega línea virtual `free-sale-*` | cartStore → línea virtual en POST /pos/sales | probado | e2e:flow-sales-cash.test.ts#ventas |
| POS | Carrito: + / − / quitar | Cambia cantidad / elimina línea | cartStore | probado | código:fronted/src/pages/POSScreen.tsx:282,675-676 |
| POS | Cargos de zona de juegos en carrito | Aparecen una sola vez con precio del backend | playzoneTicketStore → POST /pos/sales | probado | e2e:flow-sales-cash.test.ts#ventas |
| POS | Botón cancelar venta (X) | Vacía carrito | — | probado | código:fronted/src/pages/POSScreen.tsx:356-362 (clearCart) |
| POS | Botón "Cobrar" | Abre RightCheckoutDrawer | — | probado | código:fronted/src/pages/POSScreen.tsx:705 |
| POS | Diálogo ventas de hoy: "Anular" | Abre modal de motivo | GET /pos/sales/today | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| POS | Modal anulación: motivo + "Solicitar" | Crea solicitud PENDING | POST /pos/sales/:id/void | probado | e2e:flow-sales-cash.test.ts#cajero solicita anulación → PENDING |
| POS | Modal anulación: "Cancelar" | Cierra modal | — | probado | código:fronted/src/pages/POSScreen.tsx:763 |

## Checkout (RightCheckoutDrawer)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| Checkout | Carga de config | Habilita BOLETA/FACTURA solo si facturación electrónica activa | GET /dashboard/settings | probado | e2e:billing-birthday.test.ts#activar facturación (admin + adminPin) y recuperar pendientes |
| Checkout | Comprobante "Ticket" | Venta sin serie, status ACTIVE | POST /pos/sales tipo TICKET | probado | e2e:flow-sales-cash.test.ts#ventas |
| Checkout | Comprobante "Boleta" | Venta con serie B001 y correlativo | POST /pos/sales tipo BOLETA (+APISPeru mock) | probado | e2e:flow-sales-cash.test.ts#BOLETA (facturación electrónica deshabilitada) |
| Checkout | Comprobante "Factura" (sin RUC) | Rechaza: RUC requerido | POST /pos/sales → 422 | probado | e2e:flow-sales-cash.test.ts#FACTURA sin RUC → 422 |
| Checkout | Comprobante "Factura" con RUC | Venta con serie F001 | POST /pos/sales tipo FACTURA | probado | código:fronted/src/components/RightCheckoutDrawer.tsx:439-472 |
| Checkout | Método "Efectivo" + monto recibido | Calcula vuelto; paymentMethod=efectivo | sales.paymentMethod | probado | e2e:flow-sales-cash.test.ts#ventas |
| Checkout | Método "Yape" + código | paymentMethod=yape | sales.paymentMethod | probado | e2e:flow-sales-cash.test.ts#ventas |
| Checkout | Método "Tarjeta" + referencia | paymentMethod=tarjeta | sales.paymentMethod | probado | e2e:flow-sales-cash.test.ts#ventas |
| Checkout | Consultar DNI | Autocompleta nombre | GET /apisperu/dni/:dni | probado | e2e:seg-fact.test.ts#DNI válido, DNI inválido |
| Checkout | Consultar RUC | Autocompleta razón social/dirección | GET /apisperu/ruc/:ruc | probado | e2e:seg-fact.test.ts#RUC válido, RUC inválido |
| Checkout | Inputs cliente (nombre, dirección, dpto, prov, distrito) | Se envían en la venta | sales.client* | probado | código:fronted/src/components/RightCheckoutDrawer.tsx:161-166,472 |
| Checkout | Botón "Finalizar venta" | Crea venta, baja stock, limpia carrito | POST /pos/sales; products.stock | probado | e2e:flow-sales-cash.test.ts#ventas |

## Zona de juegos (PlayZoneScreen) y Cumpleaños
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| PlayZone | Tab "Juego libre" / "Cumpleaños" | Cambia vista | — | probado | código:fronted/src/pages/PlayZoneScreen.tsx:710-713 |
| PlayZone | Botón refrescar sesiones | Lista sesiones activas | GET /playzone/sessions | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Botón "Registrar" | Abre formulario de apoderado | — | probado | código:fronted/src/pages/PlayZoneScreen.tsx:818 (setShowAddChild) / 308 |
| PlayZone | Buscar DNI apoderado (Enter/botón) | Encuentra apoderado e hijos | GET /playzone/guardians/lookup | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Volver (limpiar búsqueda) | Vuelve a IDLE | — | probado | código:fronted/src/pages/PlayZoneScreen.tsx:772,885 |
| PlayZone | Seleccionar niño | Abre selección de duración | — | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Agregar niño: form + "Guardar" / "Cancelar" | Crea niño | POST /playzone/guardians/:id/children | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Registrar apoderado+niño: form + "Registrar" | Crea guardian y child | POST /playzone/guardians | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Buscar por código de pulsera (3 dígitos) | Encuentra sesión activa | GET /playzone/sessions/lookup | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Opciones de duración | Selecciona duración | — | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Botón "Iniciar" | Crea sesión ACTIVE con código de pulsera | POST /playzone/sessions | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| PlayZone | Botón "Cobrar/Finalizar" de sesión | Completa sesión y envía cargo al POS con precio del backend | PATCH /playzone/sessions/:id/complete | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| Cumpleaños | Botón "Nueva reserva" | Abre formulario | — | probado | e2e:billing-birthday.test.ts#cumpleaños |
| Cumpleaños | Seleccionar reserva | Muestra detalle e invitados | GET /birthdays/:id | probado | e2e:billing-birthday.test.ts#cumpleaños |
| Cumpleaños | Buscar apoderado por DNI | Asocia apoderado | GET /playzone/guardians/lookup | probado | e2e:billing-birthday.test.ts#cumpleaños |
| Cumpleaños | Botón "Crear" reserva | Crea reserva + invitados | POST /birthdays | probado | e2e:billing-birthday.test.ts#cumpleaños |
| Cumpleaños | Inputs nombre/apellido invitado | Actualiza invitado | PATCH /birthdays/:id/guests/:guestId | probado | e2e:billing-birthday.test.ts#cumpleaños |
| Cumpleaños | Toggle asistió | Marca attended | PATCH /birthdays/:id/guests/:guestId | probado | e2e:billing-birthday.test.ts#cumpleaños |
| Cumpleaños | Listado de reservas | Lista reservas del tenant | GET /birthdays | probado | e2e:billing-birthday.test.ts#cumpleaños |

## Registrar cliente (RegisterClientScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| RegisterClient | Buscar DNI apoderado (Enter/botón) | Muestra si existe | GET /playzone/guardians/lookup | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| RegisterClient | Consultar DNI apoderado | Autocompleta nombre | GET /apisperu/dni/:dni | probado | e2e:seg-fact.test.ts#DNI válido, DNI inválido |
| RegisterClient | Consultar DNI niño | Autocompleta nombre niño | GET /apisperu/dni/:dni | probado | e2e:seg-fact.test.ts#DNI válido, DNI inválido |
| RegisterClient | Botones de género | Selecciona género | — | probado | código:fronted/src/pages/RegisterClientScreen.tsx:460 |
| RegisterClient | Botón "Guardar" | Crea apoderado+niño | POST /playzone/guardians | probado | e2e:flow-sales-cash.test.ts#zona de juegos → venta |
| RegisterClient | Cerrar mensajes error/éxito | Oculta alerta | — | probado | código:fronted/src/pages/RegisterClientScreen.tsx:244,254 |

## Historial de ventas (SalesHistoryScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| SalesHistory | Filtros Hoy/Ayer/7 días/30 días | Lista ventas en rango | GET /pos/sales?dateFrom&dateTo | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| SalesHistory | Rango personalizado (abrir/aplicar/cerrar) | Lista ventas del rango | GET /pos/sales | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| SalesHistory | Buscar correlativo o cliente | Filtra lista | — | probado | código:fronted/src/pages/SalesHistoryScreen.tsx:251-276,507 |
| SalesHistory | Ver detalle de venta | Muestra items (incl. líneas virtuales una vez) | GET /pos/sales/:id | probado | e2e:flow-sales-cash.test.ts#detalle de venta muestra el cargo una sola vez |
| SalesHistory | Imprimir comprobante (abrir/imprimir/cerrar) | Muestra e imprime ticket | — | probado | código:fronted/src/pages/SalesHistoryScreen.tsx:703,801,853 |
| SalesHistory | Solicitar anulación (motivo + confirmar/cancelar) | Crea VoidRequest PENDING | POST /pos/sales/:id/void | probado | e2e:flow-sales-cash.test.ts#cajero solicita anulación → PENDING |
| SalesHistory | Enviar por correo (form + cancelar) | Envía comprobante | POST /pos/sales/:id/email | probado | código:fronted/src/pages/SalesHistoryScreen.tsx:326-328,970,1012 |
| SalesHistory | Paginación anterior/siguiente | Cambia página | GET /pos/sales?page | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| SalesHistory | Guía (abrir/cerrar) | Muestra ayuda | — | probado | código:fronted/src/pages/SalesHistoryScreen.tsx:365,1048 |

## Cierre de caja (CashCloseScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| CashClose | Carga de datos | Calcula esperado por método con ventas del día (zona de juegos una sola vez) y movimientos | GET /pos/sales, /cash/movements, /dashboard/settings | probado | e2e:flow-sales-cash.test.ts#resumen y cierre |
| CashClose | Botón imprimir (abrir/imprimir/cerrar) | Imprime reporte | — | probado | código:fronted/src/pages/CashCloseScreen.tsx:290,687,761 |
| CashClose | Botón "Abrir caja" | Apertura de caja | movimiento OPENING / store | probado | e2e:flow-sales-cash.test.ts#apertura de caja |
| CashClose | Tabs Soles/Dólares + inputs de conteo | Calcula contado y diferencia | — | probado | código:fronted/src/pages/CashCloseScreen.tsx:106-108,438-448 |
| CashClose | Botón "Cerrar caja" | Registra cierre PENDING_APPROVAL | POST /cash/close | probado | e2e:flow-sales-cash.test.ts#aprobar con código admin → APPROVED |
| CashClose | Aprobación con código admin | Cierre APPROVED | POST /cash/close/:id/approve | probado | e2e:flow-sales-cash.test.ts#aprobar con código admin → APPROVED |
| CashClose | Código de aprobación inválido | Rechaza (403) | POST /cash/close/:id/approve | probado | e2e:flow-sales-cash.test.ts#aprobar con código inválido → 403 |

## Movimientos de caja (CashMovementsScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| CashMovements | Botón "Ingreso" | Abre modal tipo IN | — | probado | e2e:flow-sales-cash.test.ts#ingreso 20 PEN y egreso 5 PEN → DB |
| CashMovements | Botón "Egreso" | Abre modal tipo OUT | — | probado | e2e:flow-sales-cash.test.ts#ingreso 20 PEN y egreso 5 PEN → DB |
| CashMovements | Mostrar/ocultar saldo soles/dólares | Toggle visibilidad | — | probado | código:fronted/src/pages/CashMovementsScreen.tsx:296,319 |
| CashMovements | Modal: moneda PEN/USD, monto, motivo, "Guardar" | Crea movimiento | POST /cash/movements; tabla cash_movements | probado | e2e:flow-sales-cash.test.ts#ingreso 20 PEN y egreso 5 PEN → DB |
| CashMovements | Modal: "Cancelar" | Cierra modal | — | probado | código:fronted/src/pages/CashMovementsScreen.tsx:521,601 |
| CashMovements | Paginación | Cambia página | — | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| CashMovements | Listado del día | Lista movimientos | GET /cash/movements?date | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |

## Historial de cierres (CashCloseHistoryScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| CashCloseHistory | Volver | Navega a `/pos` | — | probado | código:fronted/src/pages/CashCloseHistoryScreen.tsx:132 (admin→/admin, cajero→/pos) |
| CashCloseHistory | Refrescar | Re-consulta historial | GET /cash/history | probado | e2e:flow-sales-cash.test.ts#historial y reportes: cierre aparece una vez |
| CashCloseHistory | Filtro de días | Cambia rango | GET /cash/history?days | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| CashCloseHistory | Aprobar cierre (código + confirmar/cancelar) | Cierre APPROVED | POST /cash/close/:id/approve | probado | e2e:flow-sales-cash.test.ts#aprobar con código admin → APPROVED |

## Reportes (ReportsScreen) y Estadísticas (SalesStatisticsScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| Reports | Filtros Hoy/Ayer/7/30/personalizado | Lista turnos del rango | GET /cash/history, /pos/sales | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| Reports | Imprimir turno (abrir/imprimir/cerrar) | Imprime reporte de turno (zona de juegos una vez) | — | probado | código:fronted/src/pages/ReportsScreen.tsx:505,676-683 |
| Reports | Paginación | Cambia página | — | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| SalesStats | Volver | Navega a `/pos` | — | probado | código:fronted/src/pages/SalesStatisticsScreen.tsx:88 (admin→/admin, cajero→/pos) |
| SalesStats | Filtro de días | Recalcula estadísticas | GET /pos/sales | probado | e2e:flow-e2e.test.ts#cierre y reportes cuentan la venta una vez |
| SalesStats | Buscar cliente/cajero/método | Filtra | — | probado | código:fronted/src/pages/SalesStatisticsScreen.tsx:36,103 |
| SalesStats | Refrescar | Re-consulta ventas | GET /pos/sales | probado | código:fronted/src/pages/SalesStatisticsScreen.tsx:40,104 |

## Admin dashboard / Empresa / Aprobaciones
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| AdminDashboard | Carga KPIs | Muestra métricas | GET /dashboard/metrics (admin) | probado | e2e:flow-sales-cash.test.ts#historial y reportes: cierre aparece una vez |
| AdminDashboard | Botón "Empresa" | Navega a `/admin/company` | — | probado | código:fronted/src/pages/AdminDashboardScreen.tsx:229 |
| AdminDashboard | Botón cerrar sesión | Logout | — | probado | código:fronted/src/components/TerminalShell.tsx:26-27 |
| AdminDashboard | Tarjetas (inventario, empleados, caja, reportes, notas, historial, aprobaciones, movimientos, registrar cliente, historial ventas, estadísticas, POS) | Navegan a su ruta | — | probado | código:fronted/src/pages/AdminDashboardScreen.tsx:275 |
| CompanySettings | Carga config | Muestra datos de empresa (token enmascarado) | GET /dashboard/settings | probado | e2e:billing-birthday.test.ts#activar facturación (admin + adminPin) y recuperar pendientes |
| CompanySettings | Volver | Navega a `/admin` | — | probado | código:fronted/src/pages/CompanySettingsScreen.tsx:159 |
| CompanySettings | Inputs RUC, nombre, razón social, dirección, ubigeo, series, token, URL | Editan formulario | — | probado | código:fronted/src/pages/CompanySettingsScreen.tsx:93,213-232 |
| CompanySettings | Toggle facturación electrónica | Cambia flag | — | probado | e2e:billing-birthday.test.ts#activar facturación (admin + adminPin) y recuperar pendientes |
| CompanySettings | Guardar + PIN admin (confirmar/cancelar) | Actualiza tenant | PATCH /dashboard/settings | probado | e2e:billing-birthday.test.ts#activar facturación (admin + adminPin) y recuperar pendientes |
| Approvals | Carga solicitudes | Lista VoidRequests | GET /pos/void | probado | e2e:flow-sales-cash.test.ts#aprobar anulación de venta con producto + zona |
| Approvals | Volver | Navega a `/admin` | — | probado | código:fronted/src/pages/ApprovalsScreen.tsx:155 |
| Approvals | Filtros de estado | Filtra PENDING/APPROVED/REJECTED | GET /pos/void?status | probado | e2e:flow-sales-cash.test.ts#aprobar anulación de venta con producto + zona |
| Approvals | Aprobar (código admin) | Venta CANCELLED, stock restaurado solo productos reales | POST /pos/void/:id/resolve approve=true | probado | e2e:flow-e2e.test.ts#anulación: admin identificado SOLO por código |
| Approvals | Rechazar (código admin) | VoidRequest REJECTED, venta intacta | POST /pos/void/:id/resolve approve=false | probado | e2e:flow-sales-cash.test.ts#rechazar → REJECTED |

## Inventario (InventoryScreen) — v2
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado |
|---|---|---|---|---|
| Inventory | Carga / indicadores Activos, Stock bajo, Agotados | Muestran /inventory/stats | GET /inventory/stats | probado (UI: e2e/inventory.spec.ts#indicadores clicables filtran) · probado (API: tests/inventory-v2.test.ts#stats) |
| Inventory | Click en indicador | Filtra la tabla (low/out/all); el número coincide con el total | GET /inventory/products?stock= | probado (UI: e2e/inventory.spec.ts#indicador stock bajo: el número coincide con el filtro) |
| Inventory | Tabs Productos / Movimientos / Categorías | Cambia vista | — | probado (UI: e2e/inventory.spec.ts#categorías: crear, editar, eliminar) |
| Inventory | Búsqueda, filtros categoría/stock/estado | Filtra en servidor (nombre/SKU insensible) | GET /inventory/products | probado (UI: e2e/inventory.spec.ts#búsqueda y filtros) · probado (API: tests/inventory-v2.test.ts#search nombre/SKU insensible; categoryId, filtro stock, filtro status) |
| Inventory | Paginación | meta.total/page/limit | GET /inventory/products | probado (API: tests/inventory-v2.test.ts#paginación con meta.total) |
| Inventory | Nuevo producto (stock inicial + mínimo) | Crea; movimiento INICIAL si stock>0 y trackStock | POST /inventory/products | probado (UI: e2e/inventory.spec.ts#crear producto con stock inicial y mínimo) · probado (API: tests/inventory-v2.test.ts#crear con stock>0 → INICIAL; stock 0 o sin trackStock → nada) |
| Inventory | Editar producto (SKU bloqueado, minStock) | Actualiza; PATCH ignora stock | PATCH /inventory/products/:id | probado (UI: e2e/inventory.spec.ts#editar producto) · probado (API: tests/inventory-v2.test.ts#minStock inválido → 422; PATCH con stock no lo cambia) |
| Inventory | minStock por defecto / custom / inválido | 5 / n / 422 | POST/PATCH /inventory/products | probado (API: tests/inventory-v2.test.ts#minStock por defecto 5, custom en create, PATCH lo cambia) |
| Inventory | Desactivar / Activar (confirmación) | Cambia isActive | PATCH /inventory/products/:id | probado (UI: e2e/inventory.spec.ts#desactivar y activar) |
| Inventory | Ajuste ENTRADA / SALIDA / CORRECCION | Stock + movimiento en la misma operación | POST /inventory/products/:id/stock | probado (UI: e2e/inventory.spec.ts#ajustar stock: entrada, salida inválida, corrección) · probado (API: tests/inventory-v2.test.ts#ENTRADA: stock y movimiento en la misma operación) |
| Inventory | Ajuste inválido (cantidad 0/neg/decimal, salida>stock, delta 0, motivo corto, trackStock=false) | 422, sin cambios | POST /inventory/products/:id/stock | probado (UI: e2e/inventory.spec.ts#ajustar stock: entrada, salida inválida, corrección) · probado (API: tests/inventory-v2.test.ts#inválidos → 422 y sin cambios; trackStock=false → 422) |
| Inventory | Ajuste: tenant ajeno / cajero | 403/404; cajero 403 | POST …/stock, GET /inventory/movements | probado (API: tests/inventory-v2.test.ts#tenant ajeno → 403/404; cajero → 403 en ajuste y movimientos) |
| Inventory | Concurrencia de salidas | Nunca negativo; suma de deltas = stock final | POST …/stock x10 | probado (API: tests/inventory-v2.test.ts#10 salidas concurrentes de 3 sobre stock 20: nunca negativo, deltas cuadran) |
| Inventory | Pestaña Movimientos + filtros producto/tipo/fecha | Lista orden desc con antes→después | GET /inventory/movements | probado (UI: e2e/inventory.spec.ts#movimientos muestran los registros) · probado (API: tests/inventory-v2.test.ts#forma, orden desc, filtros y meta) |
| Inventory | Venta real / anulación aprobada | Movimientos VENTA / ANULACION; nada para líneas virtuales ni sin trackStock; rechazo no mueve | POST /pos/sales, /pos/void/:id/resolve | probado (API: tests/inventory-v2.test.ts#venta real → VENTA; virtual y sin trackStock → nada, anulación aprobada → ANULACION (+); rechazada no mueve) |
| Inventory | Categorías crear / editar / eliminar | CRUD de categoría | /inventory/categories | probado (UI: e2e/inventory.spec.ts#categorías: crear, editar, eliminar) |
| Inventory | Importar Excel: plantilla, vista previa, confirmar, resumen | Plantilla .xlsx; filas inválidas marcadas; válidas aplicadas | POST /inventory/products/import | probado (UI: e2e/inventory.spec.ts#importar Excel: plantilla, vista previa, confirmar, resumen) |
| Inventory | Import: INICIAL / sin pisar stock / IMPORTACION / stock_minimo | Movimientos según updateStock; minStock | POST /inventory/products/import | probado (API: tests/inventory-v2.test.ts#crear con stock → INICIAL; sin stock → nada, update sin updateStock no pisa stock ni crea movimiento, updateStock=true → IMPORTACION; mismo stock → sin movimiento, minStock al crear, default 5, actualiza sin tocar si falta) |
| Inventory | Recorte/subida de imagen | Sube JPEG | POST /upload | bloqueado: sin Supabase en test → 503 (mostrado inline) |

## Empleados / Roles / Asistencia (EmployeesScreen)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| Employees | Carga | Lista trabajadores (sin PIN) y roles | GET /hr/workers, /hr/roles | probado | e2e:inventory-hr.test.ts#empleados / roles / asistencia |
| Employees | Volver | Navega | — | probado | código:fronted/src/pages/EmployeesScreen.tsx:374 |
| Employees | Tabs Empleados / Asistencia / Historial | Cambia vista | GET /hr/attendance | probado | e2e:inventory-hr.test.ts#empleados / roles / asistencia |
| Employees | Historial semana / mes | Filtra asistencia por rango | GET /hr/attendance?startDate&endDate | probado | e2e:inventory-hr.test.ts#empleados / roles / asistencia |
| Employees | "Nuevo empleado": form + "Guardar" + PIN admin | Crea trabajador con PIN hasheado | POST /hr/workers | probado | e2e:inventory-hr.test.ts#empleados / roles / asistencia |
| Employees | "Editar": form + "Guardar" + PIN admin | Actualiza trabajador | PATCH /hr/workers/:id | probado | e2e:inventory-hr.test.ts#empleados / roles / asistencia |
| Employees | "Nuevo rol": nombre + "Crear" + PIN admin | Crea rol | POST /hr/roles | probado | e2e:inventory-hr.test.ts#empleados / roles / asistencia |
| Employees | Subir avatar | Sube imagen | POST /upload | bloqueado: sin Supabase en test (POST /upload devuelve 503) | |
| Employees | Cancelar modales | Cierra | — | probado | código:fronted/src/pages/EmployeesScreen.tsx:716 |

## Notas de facturación (BillingNotesScreen / CreateBillingNoteModal)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| BillingNotes | Carga | Lista notas del tenant | GET /billing/notes | probado | e2e:billing-birthday.test.ts#notas manuales / emisión y recuperación |
| BillingNotes | Buscar por documento/cliente | Filtra | — | probado | código:fronted/src/pages/BillingNotesScreen.tsx:52,174 |
| BillingNotes | "Nueva nota" | Abre modal | — | probado | código:fronted/src/pages/BillingNotesScreen.tsx:139 |
| CreateBillingNote | Form (tipo, monto, serie/correlativo, doc. modificado, motivo, cliente) + código aprobación | Crea nota (y emite vía mock APISPeru) | POST /billing/notes | probado | e2e:billing-birthday.test.ts#notas manuales / emisión y recuperación |
| CreateBillingNote | Código de aprobación inválido | Rechaza | POST /billing/notes → error | probado | e2e:billing-birthday.test.ts#código de aprobación inválido → 401 |
| CreateBillingNote | Cerrar / cancelar | Cierra | — | probado | código:fronted/src/components/CreateBillingNoteModal.tsx:83,140,269 |
| Facturación | Recuperación de pendientes PENDING_SUNAT | Reintenta emisión de pendientes | ver facturacion | probado | e2e:billing-birthday.test.ts#notas manuales / emisión y recuperación |

## Seguridad transversal (API)
| Pantalla | Control/acción | Acción esperada | API/DB | Resultado | Evidencia |
|---|---|---|---|---|---|
| API | Ruta protegida sin token | 401 | guard global | probado | e2e:auth.test.ts#protected route without token → 401 |
| API | tenantId ajeno al del token | 403 | guard global | probado | e2e:auth.test.ts#foreign tenant in query → 403 |
| API | Ruta admin con token de cajero | 403 | lib/auth.ts | probado | e2e:auth.test.ts#cashier ... → 403 |
| API | /health público | 200 | — | probado | e2e:auth.test.ts#/health is public |
| Inventario | Importar productos por Excel (upsert por SKU, límite 2000, no pisa stock salvo updateStock; solo admin, aislado por tenant) | filas válidas aplicadas, inválidas reportadas | inventory.service.ts importProducts | probado | e2e:inventory-import.test.ts |

## Integración entre módulos
UI: `fronted/e2e/integration.spec.ts` (tenant desechable, ver cabecera). API/DB: `backend/tests/integration.test.ts`. Reglas del contrato `docs/equipo/integracion-contrato.md`.
| Regla | UI probada (spec#test) | API/DB probada (test#name) | Bloqueo externo |
|---|---|---|---|
| 1. Venta con producto: 1 vez en historial, estadísticas, hoy, caja; stock baja solo si trackStock | integration.spec#vender producto en POS (2 × 5, efectivo): stock baja a 8; #historial, estadísticas y panel muestran las mismas cifras | integration.test#2. venta producto 2×5 efectivo: stock 10→8, 1 sola vez en todas las superficies | — |
| 1b. Reporte de turno | integration.spec#cierre de caja y aprobación (reporte de cierre con importe contado) | integration.test#10. cierre → PENDIENTE; cifras congeladas = summary | — |
| 1c. Venta libre / ajuste de stock no son movimientos de caja | integration.spec#venta libre desde POS (9, tarjeta): una sola vez, sin tocar stock; #ajuste de stock desde Inventario (+5): no cambia cifras de caja | integration.test#3. venta libre 9 tarjeta ...; #5. ajuste de stock (+5) | — |
| 2. Zona de juegos: tarifa configurada, 1 vez, sin stock | integration.spec#vender tiempo de niño (30 min, S/ 17.50) | integration.test#4. tiempo de niño (30 min a 17.5 configurada) yape ... | — |
| 3. Apertura/cierre: montos y estado iguales | integration.spec#login y apertura de caja; #cierre de caja y aprobación | integration.test#0 y #1 (NO_ABIERTA→ABIERTA), #10 (PENDIENTE), #11 (CERRADA, historial, no re-aprobar, no doble cierre) | Historial de cierres no muestra etiqueta "Cerrada" (solo ícono; "Pendiente" si aplica): UI verifica ausencia de Pendiente |
| 4. Movimientos IN/OUT: en historial, afectan esperado, no son ventas | integration.spec#movimientos de caja: ingreso 20 y salida 5 | integration.test#6. movimientos IN 20 / OUT 5 | — |
| 5. Anulación: pendiente en aprobaciones, al aprobar deja de contar, restaura solo producto, 1 vez, nota de crédito si ACEPTADA | integration.spec#solicitar anulación ... y aprobarla en Aprobaciones | integration.test#7 (boleta ACEPTADA), #8, #9 (CANCELLED, stock +1, billingNote 1, doble aprobación 4xx) | — |
| 6. Panel: cifras de backend y enlaces con filtro | integration.spec#panel: enlaces con filtro ...; #historial, estadísticas y panel ... | integration.test#crossCheck en cada paso (dashboard/metrics, sales-report, /pos/sales, /pos/sales/today) | — |
| Permisos y tenant ajeno | — | integration.test#permisos y aislamiento (3 tests) | — |

## Resumen
Probados: 166 / 175 · bloqueados: 9 · pendientes: 0. Suite: 104 tests (backend/tests/).
