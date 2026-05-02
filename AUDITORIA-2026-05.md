# Auditoría Yayi's Cash Control — Mayo 2026

**Fecha:** 2026-05-02
**Versión analizada:** commit `8019e81` (post selector de mes en Dashboard)
**Tipo:** Análisis sin modificar código. Diagnóstico para refactor posterior.

---

## SECCIÓN 1 — Mapa visual del sistema actual

Leyenda:
- `⚠️ DUP` = el mismo dato vive también en otra pantalla
- `🔁 NAV` = link que lleva fuera de esta pantalla
- `❓ LEGACY` = funcionalidad sospechosa de venir de una etapa antigua

```
SIDEBAR (siempre visible)
└── 7 entradas: Dashboard · Registro · Presupuesto · Clientes · Fonavi · Reportes · Configuración

DASHBOARD  (/dashboard)
├── Banner amarillo "Viendo datos de [mes]"  (solo cuando se navega atrás)
├── Selector de mes (← Anterior · Mes actual · Siguiente → · Otro mes ▼)
├── 6 tarjetas KPI:
│   ├── Saldo en banco                          ⚠️ DUP con /registro
│   ├── Ingresos del mes (adapta al mes)        🔁 NAV → /reportes mensual breakdown=income
│   ├── Gastos del mes (adapta al mes)          🔁 NAV → /reportes mensual breakdown=expense
│   ├── Cuentas por cobrar (snapshot HOY)       ⚠️ DUP con /reportes antigüedad → mismos S/
│   ├── Por cobrar Fonavi (snapshot HOY)        ⚠️ DUP con /fonavi (suma de la tabla)
│   └── Cobertura (días)                        sin link
└── 2 link cards: Últimos 7 días · Conciliación bancaria  🔁 NAV → /reportes (otras pestañas)

REGISTRO DIARIO  (/registro)
├── Selector de fecha
├── Card "Saldo BCP HOY" (verde grande)         ⚠️ DUP con Dashboard
│   ├── Botón "Editar saldo"
│   └── Saldo al cierre de la fecha + fórmula dinámica
├── Tabs Byte / Movimientos
│   ├── BYTE: 4 inputs (crédito día, cobrado, descuento, contado) +
│   │         tarjeta "Saldo créditos" + "Total Byte" + verificación
│   └── MOVIMIENTOS:
│       ├── 3 filtros (Todos · Banco · Efectivo)
│       ├── 3 mini-cards (Ingresos · Egresos · Neto)
│       ├── Quick-add (toggle ↔ input grande + <details> con extras)
│       └── Feed estilo Board (edit inline + drag & drop + borrar)
└── Botón "Guardar todo"

CLIENTES  (/clientes)
├── Botón "Nuevo cliente" (abre form inline)
└── Tabla: Nombre · Tipo · Patrón · Saldo pendiente

CLIENTE/[id]  (/clientes/[id])  ❓ LEGACY parcial
├── 3 KPI cards (Saldo · Días promedio · Total ventas)
├── Tabla "Facturas pendientes"        ❓ alimentada por tabla `sales` legacy
├── Tabla "Últimos cobros"             ❓ alimentada por tabla `collections` legacy
└── Tabla "Últimas ventas"             ❓ datos potencialmente desincronizados

FONAVI  (/fonavi)
├── Botón "Registrar reembolso" → modal
├── 3 KPI cards (Total pendiente · Pendientes · Cobradas)
├── Tabs Pendientes / Todas
└── Tabla con acción "Registrar" + "Historial"

PRESUPUESTO  (/presupuesto)
├── Selector de mes (input month nativo)        ⚠️ inconsistente con selector del Dashboard
├── Banner alertas (categorías sobre umbral)
├── 4 KPI cards (Ingresos brutos · Total gastado · % gastado · Utilidad)
├── Sección "Gastos Operativos" (lista con barras de semáforo)
├── Sección "Obligaciones" (sin tope)
└── Donut "Distribución del gasto"

REPORTES  (/reportes)  — hub con 5 pestañas
├── Botón "Exportar reporte"
├── Tab SEMANAL: navegador semana + bar chart + tabla diaria
├── Tab MENSUAL: 2 selectores (mes + año con flechas) + 4 KPIs + breakdown clickable + pie + tabla
├── Tab ÚLTIMOS 7 DÍAS: tabla idéntica a Semanal salvo que tiene lápiz para editar  ⚠️ DUP fuerte con Semanal
├── Tab CONCILIACIÓN: tabs (Semana/Mes/Año/Rango) + 8 KPIs + tabla
└── Tab ANTIGÜEDAD: 3 KPIs + barra + tabla   ⚠️ DUP con Conciliación (mismos números totales)

CONFIGURACIÓN  (/configuracion)
├── Sección "Gastos compartidos con Fonavi" (reglas activas/inactivas)
├── Sección "Presupuesto por categoría" (umbrales + semáforo)
└── Sección "Categorías de egresos" (CRUD + flag EBITDA)
```

**Resumen del mapa:** 8 pantallas principales, ~30 tarjetas, 5 datos compartidos en 2-4 pantallas, 2 reportes que se pisan (Semanal vs Últimos 7 días), 1 página entera (`/clientes/[id]`) alimentada por tablas legacy.

---

## SECCIÓN 2 — Análisis de los 3 flujos prioritarios

### FLUJO 1 — Registrar un movimiento diario

#### A. Flujo actual (paso a paso)
Caso: registrar 1 gasto compartido con Fonavi (ej: agua S/120, 50/50).

1. Click en sidebar "Registro Diario"
2. La pantalla abre en **tab Byte por defecto** (no en Movimientos).
3. Click en tab "Movimientos" *(decisión: ¿estoy seguro que esto es un movimiento y no un dato Byte?)*
4. Click en el toggle "Ingreso ↔ Egreso" para cambiar a Egreso *(o Tab para alternar — hay que saberlo)*
5. Tipear monto en el input grande
6. Click en `<details>` "Detalles opcionales" *(no es obvio que aquí está la categoría)*
7. Seleccionar categoría en el dropdown
8. Si hay una sola regla compartida → preview se muestra, OK
   Si hay varias → click en otro dropdown para escogerla
9. (opcional) escribir concepto, elegir método de pago
10. Enter o click "Agregar" *(no hay botón "Agregar" visible — el atajo es Enter dentro del campo concepto/nota)*
11. Verificar que el ítem aparece en la lista (correcto: aparece)
12. Click "Guardar todo" abajo a la derecha

**Total: 10–12 interacciones para 1 movimiento. Punto muerto principal: el `<details>` "Detalles opcionales" oculta cosas críticas (categoría, método). El usuario tiene que recordar que están ahí.**

#### B. Fricción detectada
- **Tab Byte abre por defecto** aunque el flujo más frecuente del día (registrar movimientos) está en la otra pestaña. Si el patrón de uso real es "varias veces al día registro movimientos, una sola vez al día actualizo Byte", el default está al revés.
- **El bloque `<details>` esconde categoría y método de pago.** Para un Egreso esos campos son obligatorios prácticamente siempre, no opcionales. La interfaz miente sobre la frecuencia real de uso.
- **No hay botón "Agregar".** El usuario depende de Enter (que solo dispara desde campos específicos) o de "Guardar todo" al final. El feed se llena, pero no queda claro cuándo se "agregó" un ítem en memoria local.
- **"Guardar todo" no es atómico desde la perspectiva del usuario.** Hace 3 cosas: upsert daily_record + saveBankIncomeItems + crear expenses uno por uno + recalcular saldo. Si alguno falla en mitad, el estado queda raro y solo hay un `alert()`.
- **Saldo BCP HOY editable inline en la cabecera** mezcla dos conceptos en un mismo card: "saldo actual del banco" y "saldo al cierre del día seleccionado". El usuario tiene que mirar dos veces para entender qué número es cuál.
- **"Por regularizar"** es un patrón implícito (categoría = "desconocido" o concepto contiene texto "regularizar"/"pendiente"). No hay UI para marcarlo explícitamente; depende de strings.

#### C. Propuesta de optimización
- **Default tab = Movimientos** (el flujo de mayor frecuencia primero).
- **Mostrar siempre categoría + método** en el quick-add. El `<details>` solo debería ocultar nota o reasignación de cliente (datos realmente opcionales).
- **Botón "Agregar" explícito** al lado del input de monto, además del Enter.
- **Auto-save al agregar** (sin botón "Guardar todo"): cada Enter persiste el ítem; el usuario no piensa en "guardar". El botón actual sería redundante.
- **Card del saldo separar visualmente** las dos lecturas: una grande "Saldo BCP HOY" (con botón Editar), otra debajo más pequeña "Cierre del día seleccionado" con la fórmula.
- Estimado: bajar de ~10 a ~4-5 interacciones por movimiento.

---

### FLUJO 2 — Cuadrar el saldo del banco contra el BCP

#### A. Flujo actual
Caso: cuadrar el saldo de hoy contra el saldo del BCP en la app del banco.

1. Abre la app del BCP en el celular, ve el saldo
2. Va a `/registro` (o al Dashboard, depende del hábito)
3. Lee "Saldo BCP HOY" en la app
4. Si difiere → click "Editar saldo", tipea el nuevo, Enter
5. Para verificar que el flujo del día cuadra → cambia a tab "Byte", revisa "Verificación" (Byte esperado vs BCP real)
6. Si quiere ver el detalle por día → va a `/reportes` → tab "Conciliación" → escoge período → revisa la tabla
7. Si encuentra una diferencia en un día específico → tiene que ir a `/reportes` → tab "Últimos 7 días" → click en lápiz → vuelve a `/registro` con esa fecha cargada

**Total para el cuadre simple: 4 interacciones. Para investigar una diferencia: 8-10.**

#### B. Fricción detectada
- **Verificación está enterrada en el tab Byte.** Si vengo a cuadrar (ya tengo el saldo BCP), tengo que entrar al tab Byte para ver si "cuadra" — pero el tab que abrí para cuadrar (Movimientos) no me dice nada de eso.
- **Tres lugares distintos calculan "cuadre"**: Registro (verificación tab Byte), Reportes/Conciliación (tabla diaria) y Reportes/Antigüedad (Byte vs BCP). Los tres son ligeramente distintos pero solapan.
- **No hay alerta proactiva.** Si hay una diferencia hoy, nada en el Dashboard lo dice. El usuario tiene que ir a buscarla.
- **Investigar una diferencia requiere navegar entre 3 pantallas** (Conciliación → Últimos 7 días → Registro con fecha). El "lápiz" en Últimos 7 días es la única forma rápida.
- **El cálculo dinámico** (`previo + ingresos − egresos = nuevo saldo`) está en chiquito como subtítulo de la card. Cuando hay diferencia, aparece en amarillo, pero es muy fácil pasarlo por alto.

#### C. Propuesta de optimización
- **Card prominente "Cuadre de hoy"** en el Dashboard que muestre: saldo BCP esperado vs real, con badge verde/amarillo y link directo al día específico si hay diferencia.
- **Eliminar tab "Antigüedad"** del módulo Reportes — su info ya está en Conciliación + Dashboard card "Cuentas por cobrar".
- **Lápiz de edición disponible también en Conciliación**, no solo en Últimos 7 días, para no obligar a saltar de tab.
- **Verificación visible en ambos tabs de Registro** (no solo en Byte).
- Estimado: cuadre simple sigue en 3-4; investigación baja de 8-10 a 3-4.

---

### FLUJO 3 — Revisar Dashboard al levantarme (vista AM)

#### A. Flujo actual
1. Abre `/dashboard` (default si entro por la URL raíz).
2. Mira las 6 tarjetas de arriba: Saldo, Ingresos mes, Gastos mes, CxC, CxC Fonavi, Cobertura.
3. Si quiere ver el detalle de algo, click en la tarjeta.
4. Para ver últimos 7 días o conciliación, scroll hacia abajo y click en una de las dos cards de abajo.

**Total: 1 vistazo + 0-2 clicks.**

#### B. Fricción detectada
- **6 tarjetas en una sola fila** en pantallas grandes — funciona, pero pierde jerarquía. ¿Cuál es el dato más importante de la mañana? Hoy todos están al mismo nivel.
- **"Cobertura"** es un cálculo que probablemente no se mira a diario. Está al mismo nivel visual que Saldo, que sí.
- **Saldo BCP es el dato #1 de la mañana**, pero comparte tamaño con "Por cobrar Fonavi", que es información más estratégica que operativa.
- **No hay nada que diga "qué pasó ayer"**, que es justamente lo que uno quiere saber al levantarse: ¿cobré lo que esperaba?, ¿hubo egresos extra?, ¿cuadró el banco?
- **Falta acción rápida.** El Dashboard es 100% lectura. Si veo algo que requiere acción (ej: un día sin registrar, un cobro pendiente), tengo que navegar para arreglarlo.
- **Banner "Viendo datos de Abril 2026"** funciona bien para clarificar el modo histórico, pero ningún elemento del dashboard responde si quiero "ver hoy" como cierre del día.

#### C. Propuesta de optimización
- **Layout iOS-style con jerarquía:** una tarjeta grande arriba (Saldo BCP HOY + estado de cuadre del día), debajo tarjetas más pequeñas con CxC y métricas mensuales.
- **Card "Resumen de ayer"**: total Byte ayer, ingresos vs esperado, gasto del día, badge de cuadre. Si no se registró el día, badge naranja "Pendiente de registrar" + botón directo.
- **Acciones rápidas** debajo: "+ Registrar movimiento", "+ Cobro", "+ Reembolso Fonavi" — atajos de 1 click sin pasar por menús.
- **Mover "Cobertura" y "Por cobrar Fonavi"** a un segundo nivel (sección "Estado del negocio") debajo de lo operativo.
- Estimado: el vistazo AM responde 3 preguntas (¿cuánto tengo?, ¿cuadró ayer?, ¿qué hago hoy?) sin scroll ni clicks.

---

## SECCIÓN 3 — Duplicaciones e inconsistencias

### A. Información duplicada

| Dato | Aparece en | Recomendación |
|---|---|---|
| **Saldo BCP HOY** | Dashboard (card 1, snapshot) + Registro (card verde grande, editable) | OK que aparezca en ambos. Pero sólo Registro debería ser fuente de edición. Dashboard ya cumple eso. |
| **Por cobrar Fonavi** | Dashboard (card 5) + Fonavi (suma de la tabla) | OK, son consistentes. Sin acción. |
| **Cuentas por cobrar B2B** | Dashboard (card 4) + Reportes/Antigüedad (KPI "Pendiente por cobrar") | El reporte Antigüedad solo agrega una barra de progreso y la tabla diaria. **Recomendación: eliminar el tab Antigüedad y mover su tabla a Conciliación o Dashboard expandido.** |
| **Tabla diaria** (Fecha · Byte · Créd. Día · Créd. Cobrado · Ingreso BCP · Egresos · Saldo BCP) | Reportes/Semanal + Reportes/Últimos 7 días | Los datos son idénticos. La única diferencia es navegación (semanas vs últimos 7) y el lápiz de edición. **Recomendación: fusionar en una sola pestaña "Diario" con selector de rango (últimos 7 / esta semana / semana anterior / custom).** |
| **Total egresos del mes / por categoría** | Dashboard (card 3) + Reportes/Mensual (KPI + breakdown) + Presupuesto (sección Operativos) | Cada uno tiene un ángulo distinto, OK. Pero la consulta SQL se repite 3 veces (ver sección 6). |
| **Total Byte del mes** | Reportes/Mensual + Presupuesto + Dashboard indirecto | Misma observación. |

### B. Patrones inconsistentes

1. **Selectores de mes — 3 implementaciones distintas:**
   - Dashboard: botones ←/Mes actual/→ + dropdown.
   - Reportes/Mensual: dropdown solo + flechas de año.
   - Presupuesto: `<input type="month">` nativo del navegador.
   - **Resultado:** el usuario "aprende" tres cosas distintas para hacer lo mismo.

2. **Selectores de período en Reportes:**
   - Semanal: botones ← / Siguiente.
   - Conciliación: tabs Semana/Mes/Año/Rango.
   - Antigüedad: sin selector (siempre histórico total).
   - **Resultado:** el patrón "elegir período" cambia por tab.

3. **Terminología mezclada:**
   - "Egreso" / "Gasto" usados como sinónimos (a veces uno, a veces otro).
   - "Ingreso BCP" / "Bank income" / "Cobranza" — tres formas de decir lo mismo.
   - "CxC" en código vs "Cuentas por cobrar" en UI vs "Pendiente por cobrar" en Antigüedad.

4. **Botones de acción primaria con estilos distintos:**
   - "Guardar todo" en Registro: `bg-primary` + ícono Save.
   - "Exportar reporte" en Reportes: `bg-primary` + ícono Download.
   - "Nuevo cliente" en Clientes: `bg-primary` + ícono Plus.
   - "Registrar reembolso" en Fonavi: `bg-primary` + ícono Plus.
   - **OK consistencia visual**, pero "Editar saldo" en Registro usa `bg-white/10` (estilo distinto, dentro de la card verde).

5. **Estados activos/inactivos:**
   - Categorías inactivas: opacity-50.
   - Reglas inactivas: sección colapsable separada.
   - Clientes inactivos: filtro `is_active=true` por defecto, sin UI para verlos.
   - **Resultado:** tres formas de decir "esto está apagado".

6. **Manejo de "diferencia" / "cuadre":**
   - Registro: `Math.abs(bankDiff) < 1` para considerar "cuadrado".
   - Reportes/Conciliación: tolerancia distinta o sin tolerancia (no clara).
   - Sin constante centralizada.

### C. Componentes que podrían unificarse

1. **`<KPICard>`** — el patrón "ícono + label + valor grande + subtítulo" se repite ≥10 veces (Dashboard, Mensual, Antigüedad, Fonavi, Cliente detalle, Presupuesto, Conciliación). Hoy cada archivo tiene su propio JSX casi idéntico.
2. **`<MonthSelector>`** — ya hay 3 versiones; una sola con prop `mode` (compacto / full) cubriría todos los casos.
3. **`<DataTable>`** — todas las tablas (Reportes, Fonavi, Clientes, Cliente detalle) tienen estructura prácticamente idéntica: `<table>` + `<thead bg-gray-50>` + `<tbody divide-y>` + `<tfoot bg-gray-50>`. Un wrapper común reduciría 200+ líneas duplicadas.
4. **`<SectionCard>`** — `bg-white rounded-xl border border-gray-200 [overflow-hidden]` se repite en cada panel.
5. **Modales (Edit / Delete)** — `EditRecordModal`, `DeleteRecordModal`, `ReimbursementModal`, `ReimbursementHistoryModal` comparten el wrapper de overlay/contenedor pero cada uno lo implementa.

---

## SECCIÓN 4 — Features poco usadas / sospechosas

### A. ELIMINAR (alto valor de quitar, bajo riesgo)

1. **Tab "Antigüedad de deuda" en Reportes.** Sus 3 KPIs ya están en Dashboard (CxC) y la tabla diaria solapa con Conciliación. La barra de progreso (% recuperado) tampoco es accionable.
2. **Tabla `bank_balance` en el schema** (`schema.ts:116-123`). Solo se lee en `export-report.ts:261` como columna legacy, jamás se escribe. La fuente real es `daily_records.bank_balance_real`. Borrar el modelo + las funciones huérfanas en `bank.ts`.
3. **Funciones en `bank.ts` (`upsertBankBalance`, `getLatestBankBalance`, `getBankBalanceByDate`)** — sin callers. Confirmado por grep cero.
4. **Drag & drop en el feed de movimientos** (`registro-form.tsx:338-358`). El sortOrder solo se persiste localmente y casi nunca se necesita reordenar movimientos del día. Costoso de mantener (estado `dragType/dragIdx/dragOverIdx`, handlers, UX en mobile pésima).
5. **Scripts huérfanos en `/scripts/`**: `_audit-c1.ts`, `_audit-c2.ts`, `_audit-c3.ts`, `_audit-fix-execute.ts`, `_debug-export.ts`, `_mark-test-audit.ts`, `_test-helpers.ts`, `_test-server-actions.ts`, `fix-13apr.ts`, `fix-categories.ts`, `fix-remaining.ts`, `migrate-v2.ts` ya aplicado. Migraciones `migrate-*` ya corridas — moverlas a una carpeta `archive/`.

### B. MOVER A "AVANZADO" (esconder pero mantener)

1. **Tab Byte de Registro.** Si el flujo dominante es Movimientos (varias veces/día), Byte (1 vez/día al cierre) puede ser el secundario. Default debería ser Movimientos.
2. **Sección "Obligaciones" en Presupuesto.** Si rara vez tiene data, mejor colapsable que siempre visible.
3. **Edición de saldo BCP inline.** Útil pero ruidosa. Podría vivir detrás de un menú "•••" o en Configuración.
4. **Mes futuro en el selector del Dashboard** (hasta +12 meses). Permite ver datos vacíos. Probablemente se use 0 veces. Limitar a "mes actual" como tope superior.

### C. MANTENER (con razón clara)

1. **Banner amarillo de navegación de mes.** Recién implementado, claro su propósito.
2. **Tab Conciliación.** Es el corazón del cuadre semanal/mensual; sin sustituto.
3. **Sección "Gastos compartidos" en Configuración.** Reglas críticas para el cálculo de Fonavi. Mantener tal cual.
4. **Drag & drop NO** (recomendación arriba) — pero **edit inline** SÍ vale la pena.

### Sospecha grande: `/clientes/[id]` desconectado de la realidad

La página de detalle de cliente lee de las tablas `sales` y `collections` que **nunca se escriben desde la UI actual**. Los movimientos nuevos (cobros, ingresos por cliente) se guardan en `bank_income_items` con `client_id`. Resultado: las "Últimas ventas" y "Últimos cobros" muestran data vieja importada inicialmente, no la real. **Hay que decidir si esa página debe migrarse a leer de daily_records / bank_income_items, o si se puede simplificar a un resumen mucho más corto (saldo + últimos 5 cobros desde bank_income_items).**

---

## SECCIÓN 5 — Aplicación de principios Apple/iOS (HIG)

### A. Claridad — **3/5**
✅ Tipografía consistente (font-bold, text-2xl/text-sm), uso correcto de iconografía Lucide.
❌ El `<details>` "Detalles opcionales" en Registro oculta cosas obligatorias.
❌ Los KPIs llevan ícono + label largo en una sola fila pequeña → en pantalla de 6 cards quedan apretados.
**Recomendación:** subir tamaño y aire del KPI principal del Dashboard; reducir secundarios; remover `<details>` engañoso.

### B. Deferencia — **2.5/5**
❌ La pantalla de Registro tiene **965 líneas de JSX** y muestra 4 conceptos a la vez (saldo, byte, movimientos, save). Demasiado contenido compite por la atención.
❌ El feed de movimientos muestra controles de drag, edit, delete, badge "Regularizar" todos hover-revealed pero ocupando espacio reservado.
✅ Cards blancas con borde discreto cumplen el principio "el lienzo no compite con el dato".
**Recomendación:** dividir Registro en sub-rutas (Registro/Byte y Registro/Movimientos) o esconder el saldo BCP detrás de un acordeón cuando se está en tab Movimientos.

### C. Profundidad — **3/5**
✅ Animaciones sutiles (`transition-all`, `hover:-translate-y-0.5`).
❌ Sin animaciones de entrada/salida de elementos (modales aparecen "pop").
❌ Banner del mes histórico aparece sin transición.
**Recomendación:** añadir `transition` y `enter/leave` a modales y a banner; mantener resto sutil.

### D. Consistencia — **2.5/5**
❌ Tres selectores de mes distintos (ya descrito).
❌ Botones de acción y patrones de selector divergen.
❌ Terminología mezclada (egreso/gasto, ingreso/cobranza).
✅ Color primario y secundario respetados en toda la app.
**Recomendación:** glosario interno + componentes compartidos (KPICard, MonthSelector, DataTable).

### E. Respuestas directas — **3.5/5**
✅ "Saved" toast aparece después de Guardar todo.
✅ Edición inline confirma con check verde.
❌ Cuando "Guardar todo" tarda, no hay skeleton ni progreso por etapa (upsert / income / expenses / recalc). Solo spinner global.
❌ Errores se reportan con `alert()` nativo, sin contexto (`alert("Error al guardar. Intenta de nuevo.")`).
**Recomendación:** reemplazar `alert()` por toasts no bloqueantes con detalle; añadir skeleton states en cards mientras cargan.

---

## SECCIÓN 6 — Deuda técnica y patrones de código

### A. Componentes / lógica duplicados
- **Patrón KPI card** (`bg-white rounded-xl border border-gray-200 p-5` + `text-sm text-gray-600 mb-1` + `text-2xl font-bold` + `text-xs text-gray-500 mt-1`) aparece **mínimo 10 veces** en 5+ archivos.
- **Patrón tabla** (`thead bg-gray-50 text-gray-600 text-left` + `tbody divide-y divide-gray-100` + `tfoot bg-gray-50 font-semibold`) replicado en cada reporte.
- **Selectores de mes** — 3 implementaciones (descrito en sección 3).
- **Cálculo "primer día del mes" / "rango del mes"** — `dashboard.ts:10-16` (helper local), `reports.ts:59-62` (replicado), `reconciliation.ts` (inline SQL). Tres formas para lo mismo.
- **`getToday()`** existe como helper en `lib/utils.ts` pero algunos archivos hacen `new Date().toISOString().split("T")[0]` inline (`dashboard.ts:26`, otros).

### B. Inconsistencias en manejo de estado
- **`byteCreditBalance` y `byteTotal`** son columnas en `daily_records` pero también se calculan en el cliente en cada render (`registro-form.tsx:117-118`). Riesgo: si el cliente calcula mal, la BD queda desincronizada y reportes muestran números viejos.
- **`bankBalance` en Dashboard vs `currentBalance` en Registro** son la misma cosa, calculados por queries distintas (Dashboard: `ORDER BY date DESC LIMIT 1`; Registro: helper `getCurrentBankBalance` con lógica de "anchor + flujo posterior"). Pueden divergir.
- **`recalcBankBalance`** se llama en cadena después de cada delete/update — ya hubo un bug pre-fix (commit `cbecdbe`) por esto. Sigue siendo frágil.

### C. Queries con problemas
- **`collections.ts:39-53` (`applyFIFO`)** — UPDATE individual por sale dentro de un for loop. Fácilmente reemplazable por un único `UPDATE ... WHERE id IN (...)` o un CASE. Aunque hoy esa función no se llama desde la UI (ver sección 4), si se reactiva el patrón hay que arreglarlo.
- **`bank-income.ts:saveBankIncomeItems`** — patrón DELETE + INSERT en loop. Se podría hacer en una transacción con upsert.
- **`fonavi-receivables.ts`** — múltiples `for` con queries dentro. Funciona porque los volúmenes son chicos, pero crece con la BD.
- **`SELECT *` sin columnas** en varias actions. Pequeño tema de claridad y bandwidth.
- **Sin índices declarados en el schema** — `daily_records.date`, `expenses.date`, `bank_income_items.date`, `fonavi_receivables.status` son columnas filtradas constantemente. Drizzle no los crea solos; hoy todos los filtros corren con scan.

### D. Vestigios de features abandonadas
- **Tabla `bank_balance`** (schema.ts:116) sin escritor activo, leída solo de export legacy.
- **Tablas `sales` y `collections`** sin escritor desde la UI (`createSale`, `createCollection`, `applyFIFO` no se llaman desde `/src/app/`). Datos solo provienen de scripts de import. La página `/clientes/[id]` depende de ellas.
- **12+ scripts en `/scripts/`** con prefijo `_audit-`, `_debug-`, `fix-` o `migrate-vN` ya aplicados. Migraciones consumadas no deberían vivir junto a scripts vivos.
- **Comentario en `schema.ts:80`:** `// Keep these for backward compat but daily_records is the main source` — confirma que `sales` y `collections` son intencionalmente legacy, pero nadie limpió.
- **Sin carpeta `/drizzle/`** con migraciones versionadas, lo cual significa que los scripts `migrate-*.ts` son el histórico real.

---

## SECCIÓN 7 — Top 10 recomendaciones priorizadas

| # | Mejora | Impacto | Esfuerzo | Riesgo | Comentario |
|---|---|---|---|---|---|
| 1 | **Tab Movimientos como default en Registro** | Alto | Bajo | Bajo | Cambio de 1 línea (`useState("byte")` → `useState("movimientos")`). El flujo más frecuente queda primero. |
| 2 | **Sacar categoría + método del `<details>` en Registro** | Alto | Bajo | Bajo | Ahora son "opcionales" pero son críticos. Promoverlos a la fila visible reduce 2 clicks por movimiento. |
| 3 | **Eliminar tab "Antigüedad de deuda"** | Medio | Bajo | Bajo | Solapa con Dashboard + Conciliación. Borrar archivo + 1 entrada en page.tsx. La tabla diaria puede vivir dentro de Conciliación. |
| 4 | **Crear `<KPICard>`, `<MonthSelector>`, `<DataTable>`** y migrar | Alto | Medio | Bajo | Reduce ~300-400 líneas duplicadas. Un solo selector de mes en toda la app evita confusión. |
| 5 | **Fusionar "Semanal" + "Últimos 7 días" en un único "Diario"** con selector de rango | Medio | Medio | Bajo | Quita 1 tab y unifica 2 archivos parecidos. El lápiz de edición pasa al unificado. |
| 6 | **Banner "Cuadre de hoy" en Dashboard** con badge verde/amarillo + link al día | Alto | Medio | Bajo | Resuelve el flujo 2 (cuadre) en el flujo 3 (vista AM). Una pieza nueva, no toca código existente. |
| 7 | **Borrar tabla `bank_balance` y funciones huérfanas en `bank.ts`** | Bajo | Bajo | Bajo | Limpieza técnica, sin afectar al usuario. |
| 8 | **Decidir destino de `/clientes/[id]`** (migrar a daily_records o reducirla) | Medio | Alto | Medio | Hoy muestra data potencialmente desactualizada. Decisión de producto antes que técnica. |
| 9 | **Reemplazar `alert()` por toast con detalle de error** | Medio | Medio | Bajo | Pequeño cambio de UX que sube mucho la calidad percibida. |
| 10 | **Añadir índices a daily_records.date, expenses.date, bank_income_items.date, fonavi_receivables.status** | Bajo (hoy) / Alto (a futuro) | Bajo | Bajo | Migración corta. Anticipa el momento en que la BD pase los 10k registros. |

**Quick wins recomendados para empezar:** #1, #2, #3 (todas: alto impacto, bajo esfuerzo, bajo riesgo).

---

## SECCIÓN 8 — Resumen ejecutivo

**Estado actual.** El sistema cumple su propósito: registrar movimientos diarios, cuadrar con el banco, y generar reportes mensuales. La arquitectura es sólida (Next.js + Drizzle + Neon), los datos están bien modelados en `daily_records` y `expenses`, y las features recientes (selector de mes, gastos compartidos con Fonavi, exportación a Excel/PDF) funcionan. El problema no es lo que falta, sino lo que sobra: hay 3 selectores de mes distintos, 2 reportes que muestran casi lo mismo, una página entera (`/clientes/[id]`) leyendo tablas que ya nadie escribe, y un patrón de "tarjeta KPI" repetido a mano en 10 archivos. Esto no es deuda crítica, pero acumula fricción cada vez que el usuario navega o el desarrollador toca algo.

**Los 3 problemas más grandes.** (1) **El flujo de registrar un movimiento toma 10-12 interacciones**, cuando podría tomar 4-5: el tab Byte abre por defecto cuando el flujo más frecuente es Movimientos, y los campos críticos (categoría, método de pago) están escondidos en un `<details>` "opcional". (2) **El cuadre del banco está fragmentado** en tres lugares (Registro tab Byte, Reportes/Conciliación, Reportes/Antigüedad) sin alerta proactiva: si hoy el banco no cuadra, el Dashboard no lo dice. (3) **Hay deuda visible en cuanto al modelo de datos**: la tabla `bank_balance` está muerta, las tablas `sales` y `collections` se leen pero no se escriben, y los scripts de migración ya aplicados conviven con código vivo en `/scripts/`.

**Visión post-refactor.** Un Dashboard estilo iOS con una tarjeta grande de saldo + estado de cuadre del día arriba, métricas mensuales más pequeñas debajo, y acciones rápidas (registrar, cobrar, reembolso Fonavi) accesibles en un click. Una pantalla de Registro que abre directo en Movimientos, con quick-add de un input y tres campos visibles (monto, categoría, método). Un Reportes con 3 tabs (Diario, Mensual, Conciliación) en vez de 5. Un módulo de componentes (`<KPICard>`, `<MonthSelector>`, `<DataTable>`) que garantiza que todo el sistema se ve y se siente igual. Y el código sin tablas fantasma, sin scripts viejos, y sin lógica calculada en dos lugares al mismo tiempo. El objetivo no es agregar funciones — es que las que ya hay se usen sin pensar.
