# Multi-Tenant — Notas para Olas 6 y 7

**Estado actual (post Ola 5):** la BD es multi-tenant a nivel schema; **toda la data vive en Atelier (`business_id = 1`)** porque las server actions todavía no filtran ni eligen negocio. La UI sigue mostrando exactamente el mismo comportamiento de antes.

## Tabla raíz: `businesses`

| id | code | name | description |
|---|---|---|---|
| 1 | `atelier` | Yayi's Atelier | Centro de producción y B2B |
| 2 | `fonavi` | Yayi's Fonavi | Cafetería Fonavi |
| 3 | `centro` | Yayi's Centro | Cafetería Centro |

`code` es UNIQUE; el frontend usa `code` (string), nunca `id`.

## Tablas multi-tenant (con `business_id` NOT NULL)

Cada fila pertenece a UN solo negocio. Las queries DEBEN filtrar por `business_id` para no mezclar datos entre negocios.

| Tabla | Filas hoy | UNIQUE compuesto | Comentario |
|---|---|---|---|
| `daily_records` | 30 | `(business_id, date)` | Un registro Byte+Bank por día por negocio |
| `expenses` | 126 | — | Egresos diarios |
| `bank_income_items` | 120 | — | Ingresos individuales al banco |
| `expense_categories` | 18 | `(business_id, name)` | Cada negocio tiene su set |
| `budgets` | 17 | `(business_id, category_name)` | Configuración de tope por categoría |
| `audit_log` | 13 | — | Trazabilidad de ediciones |

**Total migrado:** 324 filas, todas con `business_id = 1`.

**Default a nivel SQL y TS:** `business_id` tiene `DEFAULT 1` en BD y en Drizzle. Esto es transitorio — permite que las server actions de hoy (que no pasan `businessId`) sigan funcionando contra Atelier sin cambios. **Eliminar el DEFAULT es Ola 7**, cuando todas las queries pasen `businessId` explícito.

## Tablas exclusivas Atelier (sin `business_id`)

Modelan funcionalidad que solo existe en Atelier. **No se filtran por negocio.** La UI debe ocultar las features asociadas cuando el negocio activo no sea Atelier.

| Tabla | Razón |
|---|---|
| `clients` | Clientes B2B (Fonavi/Centro venden a consumidor final) |
| `shared_expense_rules` | Reglas Atelier↔Fonavi |
| `fonavi_receivables` | Cuentas por cobrar a Fonavi |
| `fonavi_reimbursement_allocations` | Asignación de reembolsos |

## Diagrama de filtrado (Ola 7)

```
Request HTTP
   │
   ├─ Resolver de negocio (Ola 6):
   │     1. URL ?negocio=fonavi     → fonavi
   │     2. cookie business=centro  → centro
   │     3. fallback                → atelier
   │
   ├─ businessId activo en context (Server Component / hook)
   │
   ├─ Server actions multi-tenant (Ola 7):
   │     SELECT ... WHERE business_id = $activeId
   │     INSERT ... VALUES (..., business_id = $activeId)
   │
   └─ Server actions Atelier-only (sin cambio):
         clients, shared_expense_rules, fonavi_*
         La UI las muestra solo cuando activeBusiness === 'atelier'.
```

## Helpers ya creados (Ola 5)

`src/lib/businesses.ts` expone:

```ts
type BusinessCode = 'atelier' | 'fonavi' | 'centro';
const DEFAULT_BUSINESS_CODE = 'atelier';

getBusinesses(): Promise<Business[]>          // 3 negocios activos
getBusinessByCode(code: string): Promise<Business | null>
isValidBusinessCode(value: string): boolean   // type guard
```

## TODOs explícitos

### Ola 6 — UI de selector de negocio

- [ ] Componente `<BusinessSelector>` en sidebar (encima de la nav).
- [ ] Server action `getActiveBusiness()` que resuelve negocio según URL → cookie → fallback.
- [ ] Hook `useBusiness()` para que client components conozcan el negocio activo.
- [ ] Cookie `yayis_business` (httpOnly) que persiste entre sesiones.
- [ ] Query param `?negocio=<code>` con prioridad sobre la cookie (deep links).
- [ ] Mostrar el nombre del negocio activo en el header (claridad visual).
- [ ] Layout adaptado: cuando `activeBusiness !== 'atelier'`, ocultar links a `/clientes` y `/fonavi`.

### Ola 7 — Filtrado en server actions

- [ ] **Auditar TODAS las server actions** (`src/app/actions/*.ts`) y agregarles `WHERE business_id = $businessId` o `INSERT ... business_id = $businessId`.
- [ ] Lista mínima a tocar:
  - `dashboard.ts` (getDashboardData)
  - `daily-records.ts` (upsert / getDailyRecord / getLastBankBalance / getCurrentBankBalance)
  - `bank-balance.ts` (getUnifiedBankBalance — ¡crítico!)
  - `bank-income.ts` (saveBankIncomeItems / getBankIncomeItems / update / delete / reorder)
  - `expenses.ts` (createExpense / get / update / delete / reorder)
  - `categories.ts` (getCategories / create / update / toggle)
  - `budgets.ts` (getBudgets / getBudgetDashboard)
  - `reports.ts` (getMonthlyReport / getDailyBreakdown / getWeeklyReport)
  - `reconciliation.ts` (getReconciliation)
  - `month-range.ts` (getAvailableMonthRange)
  - `record-edits.ts` (recalc cascade)
  - `export-report.ts`
- [ ] Tabla `audit_log`: pasar businessId al insertar.
- [ ] Tablas Atelier-only (`clients`, `shared_expense_rules`, `fonavi_receivables`, `fonavi_reimbursement_allocations`): NO agregar filtro; las queries siguen como están. La UI ya no las llamará desde Fonavi/Centro.
- [ ] Una vez todas las actions pasen `businessId`, **eliminar `DEFAULT 1`** de las 6 tablas (script `drop-business-id-default.ts`).
- [ ] Seed de configuración inicial para Fonavi y Centro: copiar las 18 categorías y los 17 budgets de Atelier como punto de partida (script opcional o manual desde la UI).

### Comportamiento esperado tras Ola 7

- Atelier: idéntico a hoy.
- Fonavi/Centro: empiezan vacíos (0 daily_records, 0 expenses, 0 bank_income_items, 0 categories, 0 budgets) hasta que se siembren.
- Sidebar muestra selector de negocio. Las páginas se ven igual; los datos cambian según el negocio activo.
- Saldo BCP: cada negocio tiene su saldo independiente (Atelier sigue mostrando S/1,879.60 al 30/04/2026; Fonavi y Centro empiezan en S/0.00 sin anchor).
