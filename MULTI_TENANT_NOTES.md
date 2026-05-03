# Multi-Tenant — Estado post Olas 5-9

**Estado:** sistema multi-negocio funcional. Atelier conserva su data histórica intacta. Fonavi y Centro están vacíos y listos para recibir movimientos.

## Tabla raíz: `businesses`

| id | code | name | description |
|---|---|---|---|
| 1 | `atelier` | Yayi's Atelier | Centro de producción y B2B |
| 2 | `fonavi` | Yayi's Fonavi | Cafetería Fonavi |
| 3 | `centro` | Yayi's Centro | Cafetería Centro |

`code` es UNIQUE; el routing y la UI usan `code` (string), nunca `id`.

## Arquitectura de routing

```
/                                    → pantalla selectora de negocio
/atelier/dashboard, /atelier/...     → 7 pantallas (incluye Clientes y Fonavi)
/fonavi/dashboard,  /fonavi/...      → 5 pantallas (sin Clientes ni Fonavi)
/centro/dashboard,  /centro/...      → 5 pantallas (sin Clientes ni Fonavi)
/grupo/dashboard, /grupo/reportes    → vista consolidada
```

## Cómo se resuelve el negocio activo

```
Request HTTP llega
    │
    ├─ middleware.ts (src/middleware.ts):
    │     1. Extrae primer segmento (atelier|fonavi|centro|grupo).
    │     2. Inyecta header `x-active-business: <segmento>` en la request entrante.
    │     3. Setea cookie `yayis_business=<segmento>` en el response.
    │
    ├─ Server components (page.tsx, layout.tsx):
    │     leen `params.negocio` para validar / personalizar UI.
    │
    └─ Server actions (src/app/actions/*):
          activeBusinessId() lee del header (esta request) o cookie (fallback).
          Cada query lleva WHERE business_id = $bId.
```

**Importante:** el middleware modifica la request *antes* de que llegue a server components y actions, así que TODO el ciclo de la request ve el negocio correcto. Sin middleware, server components no podrían setear cookies (Next 16 lo prohíbe).

## Tablas multi-tenant (con `business_id` NOT NULL)

`daily_records`, `expenses`, `bank_income_items`, `expense_categories`, `budgets`, `audit_log`.

Todas las queries en `src/app/actions/*` filtran por `business_id`. El **DEFAULT 1 fue eliminado en Ola 7** — cualquier INSERT que omita `business_id` ahora falla con NOT NULL violation. Esto es intencional: obliga a que toda escritura sea consciente del negocio activo.

## Tablas exclusivas Atelier (sin `business_id`)

- `clients` — clientes B2B
- `shared_expense_rules` — reglas Atelier↔Fonavi
- `fonavi_receivables` — cuentas por cobrar a Fonavi
- `fonavi_reimbursement_allocations` — asignación de reembolsos

**Cross-tenant guards activos:**
- `/[negocio]/clientes` y `/[negocio]/fonavi`: `notFound()` si `negocio !== "atelier"`.
- `/[negocio]/configuracion`: la sección "Gastos compartidos con Fonavi" solo se renderiza si negocio es Atelier.
- `getFonaviReceivables()`: tira `Error("Esta sección solo está disponible en Atelier")` si se llama desde otro negocio.
- `createExpense({shared: ...})`: tira si se intenta registrar gasto compartido desde Fonavi/Centro.

## Sidebar adaptativo

| Item | Atelier | Fonavi | Centro | Grupo |
|---|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Registro Diario | ✓ | ✓ | ✓ | — |
| Presupuesto | ✓ | ✓ | ✓ | — |
| Clientes | ✓ | — | — | — |
| Fonavi | ✓ | — | — | — |
| Reportes | ✓ | ✓ | ✓ | ✓ |
| Configuración | ✓ | ✓ | ✓ | — |

Selector permanente arriba del sidebar (dropdown con los 4 scopes + opción "Cambiar negocio" → vuelve a la pantalla raíz).

## Helpers

`src/lib/businesses.ts`:
- `BusinessCode = 'atelier' | 'fonavi' | 'centro'`
- `getBusinesses()`, `getBusinessByCode(code)`, `isValidBusinessCode(value)`

`src/lib/active-business.ts`:
- `getActiveBusiness(code?)` — header → cookie → null
- `requireActiveBusiness()` — tira si no hay
- `activeBusinessId()` — atajo `.id`
- `setActiveBusinessCookie(code)` — solo desde server actions / route handlers
- `isValidScopeCode(value)` — permite también `'grupo'`

## Vista Grupo (consolidada)

`src/app/actions/grupo.ts` → `getGroupDashboard()`:
- Calcula saldo BCP por negocio (método híbrido: anchor + flujo).
- Suma ingresos del mes (excluye reembolsos Fonavi).
- Suma gastos del mes usando `atelier_amount` cuando `is_shared=true` para **NO duplicar la parte Fonavi**.
- Devuelve totales + breakdown por negocio.

## ⚠️ Pendiente (CAMBIO 7.5 del prompt original)

**Gastos compartidos automáticos NO implementados.** Hoy cuando Atelier registra un gasto compartido:
- ✅ Se registra en `expenses` de Atelier con `is_shared=true`, `atelier_amount`, `fonavi_amount`.
- ✅ Se crea fila en `fonavi_receivables` con la deuda.
- ❌ NO se crea fila en `expenses` de Fonavi (auto-mirror).

El prompt original pidió "auto-crear gasto en Fonavi", pero **requiere decisiones de negocio que no están especificadas**:
- ¿Con qué categoría se registra en Fonavi? (Las categorías son por negocio.)
- ¿En qué fecha — la del gasto Atelier o la del reembolso?
- ¿Con qué método de pago?
- ¿Afecta el saldo BCP de Fonavi inmediatamente, o solo cuando se paga el reembolso?

**Cuando Jahnn defina las reglas, agregar la lógica en `createExpense()` de `src/app/actions/expenses.ts` para auto-mirror.**

Mientras tanto: el comportamiento actual de Atelier (registrar el gasto + crear receivable) sigue funcionando intacto. El reembolso (lado Fonavi) se registra manualmente como ingreso a Atelier desde la modal de "Cuentas por cobrar Fonavi" — workflow inalterado.

## Smoke tests cross-tenant ejecutados

| Test | Resultado |
|---|---|
| `/` carga selector | ✅ 200 |
| `/atelier/*` (7 rutas) | ✅ 200 — data S/1,879.60 al 30/04/2026 intacta |
| `/fonavi/*` (5 rutas) | ✅ 200 — saldo S/0.00, sin movimientos (vacío correcto) |
| `/centro/*` (3 rutas) | ✅ 200 — vacío |
| `/grupo/*` (2 rutas) | ✅ 200 — totales = 1,879.60 (Atelier) + 0 + 0 |
| `/fonavi/clientes` | ✅ 404 (Atelier-only) |
| `/fonavi/fonavi` | ✅ 404 (Atelier-only) |
| `/inventado/dashboard` | ✅ 404 (negocio inválido) |

## Backups

- `backups/backup-antes-ola-5-2026-05-03-135513.sql` — pre fundación BD multi-tenant.
- `backups/backup-antes-ola-7-...` — pre DROP DEFAULT.

## Migraciones aplicadas (orden)

1. `create-businesses-table.ts` — tabla `businesses` + 3 seeds.
2. `add-business-id-to-tables.ts` — columna `business_id NOT NULL FK + idx + UNIQUEs compuestos`.
3. `drop-orphan-uniques.ts` — quita UNIQUEs viejos no compuestos.
4. `set-business-id-default.ts` — DEFAULT 1 transitorio.
5. `drop-business-id-default.ts` — quita DEFAULT (Ola 7).
