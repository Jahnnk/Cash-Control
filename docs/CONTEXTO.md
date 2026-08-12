# Contexto completo del proyecto — léeme antes de trabajar

> Para cualquier agente o desarrollador que llegue nuevo (Codex, Claude,
> humano). Actualizado: 2026-08-10. Complementa `AGENTS.md` (reglas de
> ramas, deploy y auth) y `CLAUDE.md` (overview técnico). Este archivo
> cuenta lo que esos dos no cuentan: quién es el usuario, cómo trabajar
> con él, las lecciones aprendidas a golpes y el estado actual.

## 1. Quién es el usuario y cómo trabajar con él

**Jahnn Karlo** — dueño de Yayi's, cadena de panaderías en Cajamarca,
Perú. **NO es programador.** Reglas de comunicación:

- **Siempre en español.** UI, mensajes de error, commits descriptivos,
  PRs y toda conversación.
- **Explicar simple**: si usas un término técnico, aclararlo entre
  paréntesis. Ej: "hash (huella matemática de la contraseña)".
- **Antes de cambios importantes** (varios archivos, BD, producción):
  explicar en 1-2 oraciones qué vas a hacer y por qué. Cambios pequeños
  no necesitan permiso.
- **Al preguntar algo, incluir SIEMPRE tu recomendación experta** con
  argumentos. Jahnn decide, pero espera opinión de socio, no un menú.
- **Actuar como socio de producto**: contradecirlo con argumentos cuando
  su idea tenga un riesgo que no ve. Ya pasó (ej. etiquetas, bases de
  incentivos) y lo valora.
- **Si algo rompe producción**: primero el impacto en palabras simples
  (¿los clientes pueden usar la app? ¿se perdieron datos?), luego la
  causa técnica.
- **No agregar features ni refactors no pedidos.** Si ves algo
  mejorable, proponerlo primero.

## 2. El negocio (para entender los datos)

- **3 sedes**: Atelier (id=1, producción/B2B, la maneja Jahnn),
  Fonavi (id=2) y Centro (id=3) — cafeterías atendidas por
  administradores. "Grupo" = vista consolidada (no es un negocio real).
- **Byte** = sistema POS. **BCP** = banco. La app existe porque Byte
  registra ventas pero la plata real llega al banco días después: la
  app muestra la posición de caja REAL.
- **Kelly** = socia y gerente comercial; desde el **01-ago-2026 carga
  las 3 sedes vía Excel** (antes solo Fonavi/Centro; Atelier se sumó
  ese mes). Jahnn ya NO llena datos operativos — solo decide y verifica
  desde Grupo. A veces demora días/semanas (por eso existe la tarjeta
  de "frescura de datos" y el import central en Grupo). Gaps conocidos
  de su carga de Atelier: saldo BCP, ventas B2B, reembolsos sin flag
  (ver `transicion-kelly-agosto` en memoria de Claude).
  OJO Atelier: sus registros especiales (clientes B2B/CxC, cuentas por
  cobrar, préstamos socio, gastos compartidos, clasificaciones no
  operativas) están PROTEGIDOS del archivado en el import — el Excel no
  sabe expresarlos y esas capas se registran EN la app, nunca vía Excel.
- **Personal con acceso** (tabla `app_users`, Grupo → Configuración):
  **Luana fue despedida (ago-2026)**, su cuenta quedó `active=false` —
  NO borrada, por trazabilidad. **Luis Pisco** es el nuevo administrador
  de Atelier (`admin-atelier`, mismo scope que tenía Luana: ventas,
  ticket promedio, mermas, y ahora también Ventas por Cliente y Cuentas
  por Cobrar). Raúl = admin Fonavi, Chari = admin Centro, Junior =
  verificador Centro, Jefe de tienda Fonavi = verificador. El label del
  rol `admin-atelier` dice "Administración · Panel de Atelier" (antes
  decía "Supervisora", cambiado a pedido de Jahnn al asumir Luis).
  **Pendiente sin resolver**: `src/app/actions/direccion.ts:273` sigue
  listando a "Luana · Supervisora Atelier" en el roster del Sistema de
  Dirección — flagged, Jahnn no ha dicho si quitarla o reemplazarla.
- Moneda S/. Timezone America/Lima. Cálculos financieros con cuidado
  de redondeo (ver lección de decimales abajo).

## 3. Reglas duras de operación (NUNCA romper)

1. **Trabajar SIEMPRE en `staging`, NUNCA pushear a `main`.** Tras cada
   commit: `git push origin staging` + crear PR a main. **El PR lo
   mergea Jahnn**, nunca el agente.
2. **Staging y producción comparten la MISMA base de datos Neon.**
   Toda escritura desde staging impacta producción. Escrituras directas
   a datos de producción requieren confirmación explícita de Jahnn
   ("sí, hazlo"). DELETE requiere snapshot Neon < 24h (salvo flujos
   idempotentes DELETE+INSERT tipo import).
3. **Migraciones de schema: el agente NUNCA las ejecuta.** Se escribe el
   SQL en `scripts/migrations/AAAA-MM-DD-nombre.sql` (idempotente, con
   comentario de propósito) y se le entrega a Jahnn para que lo corra en
   el SQL Editor de Neon después de un snapshot. El código debe degradar
   con gracia mientras la migración no corra (try/catch con fallback).
4. **Contraseñas: JAMÁS en documentos, manuales o texto persistente.**
   Se generan (nunca las inventa un humano), se muestran UNA vez, se
   entregan en persona. En BD solo hashes (scrypt).
5. **Antes de cada PR**: `npx tsc --noEmit` + `npm run lint` (cero
   avisos NUEVOS; hay ~33 preexistentes aceptados) + `npx vitest run`
   (663 tests en verde al día de hoy) + `npm run build`. Esperar el CI
   "Tests" en verde antes de reportar. Si la pantalla se abre en el
   navegador, esto NO reemplaza probarla ahí (ver lección #8).
6. **Commits**: mensaje en español contando el POR QUÉ, terminando con
   `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
   (si eres otro agente, usa tu propia firma — no suplantes).
7. **Dominio de producción real: `cash-control-delta.vercel.app`**
   (`cash-control.vercel.app` da 404 — no usarlo nunca en docs ni links).

## 4. Arquitectura en 10 líneas

- Next.js 16 App Router + TypeScript, Neon Postgres (cliente
  `@neondatabase/serverless` con template tags + drizzle `db.execute`
  en módulos viejos), Tailwind v4, Vitest, deploy Vercel.
- Multi-tenant por ruta: `/[negocio]/...` con middleware que inyecta
  `x-active-business`. `activeBusinessId()` resuelve la sede — OJO: en
  `/grupo` cae a la cookie (última sede visitada); para acciones desde
  Grupo la sede debe viajar EXPLÍCITA (ver `sedeCentral` en
  excel-import como patrón).
- **Auth de 3 niveles** (ver AGENTS.md): v1 = APP_PASSWORD (Jahnn) y
  APP_PASSWORD_KELLY (llave propia de Kelly, mismo poder, revocable por
  separado — desde 01-ago-2026 ella llena las finanzas de las 3 sedes,
  Jahnn solo verifica desde Grupo), ambas SOLO en Vercel a propósito; v2 =
  contraseñas por sede en env vars (legado, YA borradas), v3 = usuarios
  por persona en tabla
  `app_users` (tokens firmados con el password_hash → inhabilitar o
  renovar mata la sesión al instante). `src/lib/session-access.ts` es
  la ÚNICA fuente de verdad para resolver sesión en actions.
- **"Un cerebro → renderers tontos"**: la lógica de negocio vive en
  `src/lib/**` como funciones puras testeadas; las actions recolectan
  datos y la UI solo pinta. Dashboard, reportes, deck y liquidación
  deben usar LA MISMA definición de cada métrica (nunca dos fórmulas).

## 5. Lecciones aprendidas A GOLPES (patrones obligatorios)

1. **Mes en curso vs meses cerrados**: toda métrica que compare contra
   una base acumulada del propio mes (equilibrio, presupuesto,
   comparativos) usa referencia de MESES CERRADOS o "mismos días
   transcurridos". Comparar mes a medias contra mes completo dio números
   absurdos DOS veces en producción.
2. **Columnas multi-fuente**: si una columna la escriben dos flujos
   (ej. tiempos: cronómetro + tecleo del admin), el upsert lleva
   `COALESCE(EXCLUDED.x, tabla.x)` + regla de precedencia explícita
   ("lo medido manda"). Un campo vacío JAMÁS borra un dato existente.
   (Se perdieron mediciones reales por no hacerlo — PR #85.)
3. **Decimales**: nunca redondear antes de dividir.
   `Math.round(x*10000)/100`, no `r1(x*10000)/100` (salían colas tipo
   0.4429999999995% en pantalla).
4. **Parsers de Excel**: detectar columnas por HEADER, nunca por
   posición (el `!ref` cambia si la columna A viene vacía — bug real
   con el Excel de Centro). Loggear el offset detectado. Si el reporte
   trae fila de totales, usarla como checksum y AVISAR si no cuadra.
5. **Una etiqueta que miente es un bug** aunque la matemática esté
   bien: los admins leen la UI todos los días y actúan según lo que
   dice. (Caso "ticket salón" → "ticket sin delivery", PR #91.)
6. **Sede explícita desde Grupo**: cualquier action invocada desde
   `/grupo` que escriba en una sede debe recibir la sede como parámetro
   validado + `requireFullSession()`, nunca deducirla de la cookie.
7. **Verificar antes de afirmar**: consultar la BD/gh antes de decir
   "X está pendiente" o "Y funciona". Ya hubo una disculpa por afirmar
   que PRs estaban sin mergear cuando estaban mergeados.
8. **Un archivo `"use server"` SOLO puede exportar funciones `async`.**
   `export const DIAS_PARA_ATRASO = 8` en `receivables.ts` compiló
   limpio con `tsc` y pasó `lint`, pero tumbó `/atelier/panel` con un
   500 en el navegador — Next lo rechaza en runtime, no en tipos. TSC
   nunca lo va a atrapar: **toda pantalla nueva que dependa de una
   action se abre en el navegador antes de dar el feature por listo**,
   no basta con `tsc`+`vitest` en verde (PR receivables, 09-ago-2026).

   **8-bis. Y TAMPOCO puede RE-EXPORTAR un tipo** (11-ago-2026, costó
   tres intentos de diagnóstico). `export type { HighlightPhotoKind };`
   en `actions/highlight-photos.ts` producía en producción:

   ```
   ReferenceError: HighlightPhotoKind is not defined
       at module evaluation (.../ssr/src_app_actions_*.js)
   ```

   Turbopack convierte cada export de un `"use server"` en referencia a
   server action; en esa transformación la re-export de tipo NO se
   borra y queda buscando el tipo como VALOR. Como revienta al EVALUAR
   el módulo, tumbaba **toda** llamada a cualquier action de ese chunk
   (`/grupo/highlight` daba 500 al cambiar de fecha, siempre con el
   mismo `digest`).

   Lo grave: `tsc`, `npm run build` Y Vitest lo dan por bueno — esos
   transforms sí borran el tipo. **Solo se ve en el runtime de
   producción.** Regla: declarar el tipo localmente (`export type X =
   {...}` es seguro) o importarlo desde una lib; nunca re-exportarlo.
   Guardia automática: `src/lib/__tests__/use-server-exports.test.ts`.

   **Lección de método**: un `digest` de error IDÉNTICO entre dos
   intentos = error determinista, NO un tropiezo de red. Perseguí dos
   veces la hipótesis de "cold start de Neon" (y hasta desplegué un
   reintento) cuando el digest repetido ya decía que era determinista.
   Ante un 500 en producción que no se reproduce en local: **pedir el
   log de Vercel ANTES de tocar código.** Los tres arreglos anteriores
   fueron a ciegas; el log dio la línea exacta en 30 segundos.
9. **`findCol` por "contiene todas las palabras" puede dar falso
   positivo entre encabezados parecidos.** En el Consolidado de
   Facturas, buscar la columna "T DOC. CLTE." con `findCol(h,"doc","clte")`
   devolvía "DOC. CLTE." (el RUC) en vez del tipo de documento, porque
   la primera CONTIENE a la segunda. Un test contra el archivo real lo
   atrapó. Cuando el archivo trae dos encabezados donde uno es
   substring del otro, usar coincidencia EXACTA (`findColExacta`), no
   "contiene" (`src/lib/receivables-parser.ts`).
10. **El regex de tildes que borra diacríticos se corrompe si se
    escribe con el rango Unicode literal** en vez de los escapes
    explícitos — el tool de escritura lo normaliza a caracteres
    combinados invisibles y el archivo queda con un bug silencioso.
    Pasó dos veces (client-sales-parser.ts, receivables-parser.ts).
    Escribir SIEMPRE `.replace(/[\u0300-\u036f]/g, "")` con los
    escapes `\uXXXX` tal cual, nunca el glifo combinado pegado
    directo en el código — y verificar con `grep -n "u0300"` tras
    escribir el archivo.

## 6. Dominio del negocio implementado (dónde está cada cosa)

- **Incentivos por upselling** (Fonavi/Centro): motor puro en
  `src/lib/incentives/engine.ts` — ticket promedio PRESENCIAL
  (mostrador + mesa; delivery EXCLUIDO porque nadie puede sugerir
  extras en un pedido de app), niveles = base + delta, pozo 40% como
  TECHO con tabla fija por rol, piso de tráfico sobre personas
  totales. Base editable solo por dirección (botón "Base" en el panel,
  meses liquidados congelados). Liquidación mensual genera acta.
- **KPIs diarios** (`src/lib/kpis/engine.ts`): ventas, ticket, NPS,
  mermas (con detalle de productos), tiempos mostrador (<6) / mesa
  (<15) / delivery (<20, configurables). Semáforos verde/ámbar/rojo.
  Cronómetro del encargado (`service_timings`) alimenta los tiempos.
- **Mejor vendedor por turno**: hándicap — compara contra lo normal del
  PROPIO turno, no contra el pico. `worker_shifts`.
- **Registro diario del admin**: personas, venta, items, delivery
  (pedidos+venta, dentro del total), NPS, mermas, tiempos. Segunda
  firma del verificador; corregir números firmados anula la firma.
- **Ventas Byte semanales** (`byte_ventas_daily`): reporte "Ventas de
  <MES>" subido por sede; `source='import'` (oficial) SIEMPRE gana
  sobre 'manual'. En Fonavi/Centro NO toca `upselling_daily`
  (personas ≠ pedidos). En Atelier sí (pedidos SON su KPI).
- **Panel de Atelier** (`/atelier/panel`): registro de la supervisora —
  venta, # pedidos, mermas; ticket = venta ÷ pedidos, nunca tecleado.
- **Deck de reunión** (`src/lib/kpis/weekly-deck.ts`): PPTX con KPIs,
  ventas del mes (vs mes pasado a MISMOS días), incentivos, Atelier.
  Se genera desde Grupo → Reportes.
- **EIRS** (Reporte Ejecutivo): facts → intelligence → narrative →
  renderers PDF/PPTX/XLSX. `getReportFacts` — grupo solo dirección.
- **PIC (Productos)**: import de rotación Byte, veredictos, Pareto,
  simulador. Alimenta el "foco del día" del panel (rota por fecha
  sobre un pozo de 24 candidatos — `pickDailyFocus`).
- **Préstamos socio** (`/atelier/prestamos-socio`): prestar → deber →
  devolver sin mover saldos operativos. Método de pago 'socio' = gasto
  operativo real que NO toca banco ni caja. 11 cadenas bancarias
  excluyen `('efectivo','pendiente_atelier','socio')`.
- **Capital inyectado** (tarjeta en dashboard): aportes + préstamos
  socio (neto) + financiamiento + venta de activos — todo YA excluido
  de ventas/EBITDA por `non_operative_category`; la tarjeta solo suma.
- **Gestión de usuarios** (Grupo → Configuración): crear/inhabilitar/
  renovar contraseña por persona. La llave maestra NO se gestiona ahí.
- **Import central de Excel de Kelly** (Grupo → Dashboard): botones
  explícitos por sede (Atelier/Fonavi/Centro). Los registros manuales
  especiales NUNCA se archivan al importar (ver excel-import.ts,
  condiciones "PROTEGIDOS" — test que lo clava en central-access.test).
- **Ventas por Cliente** (`/atelier/panel`, sección "Clientes de
  Atelier"; solo Atelier, id=1): Luis sube semanalmente el "Reporte
  Ventas por Cliente" de Byte. `src/lib/client-sales-parser.ts` +
  `src/app/actions/client-sales.ts` (tablas `client_sales_snapshots` /
  `client_sales_rows`). Modelo de **fotos semanales**: cada archivo es
  un snapshot con rango de fechas propio, reimportar el mismo rango
  REEMPLAZA. Ranking de mejores clientes, quién creció/cayó/dejó de
  comprar (comparación por RUC/DNI, umbral 5%), concentración (80/20).
  **Decisión de diseño clave**: Fonavi y Centro comprándole a Atelier
  (`SEDE_RUCS`, por RUC) se separan del ranking en su propio bloque —
  en la muestra eran 66% del volumen y tapaban a los clientes reales.
  Visible también en Grupo → Dashboard, solo lectura (mismo componente
  `ClientSalesSection`, prop `onSubir` opcional).
- **Cuentas por cobrar** (`/atelier/panel`, debajo de Clientes; solo
  Atelier): Luis sube el "Reporte de Ventas" + "Consolidado de
  Facturas" de Byte (juntos, cualquier orden — se autodetectan por sus
  columnas). `src/lib/receivables-parser.ts` +
  `src/app/actions/receivables.ts` (tablas `invoice_documents` /
  `invoice_imports`). A diferencia de Ventas por Cliente, es un
  **libro vivo por `doc_key`**, NO fotos: una factura cobrada la semana
  siguiente cambia de estado en su misma fila. Los dos archivos se
  complementan sin pisarse (ventas manda sobre montos/cobro,
  consolidado sobre RUC/IGV/anulación). El estado de cobro sale de
  texto embebido en la columna "Medios" de Byte (`leerMedios`), nadie
  lo marca a mano — salvo que Luis registre un cobro ANTES de que Byte
  lo confirme (`marcarCobrado`/`desmarcarCobrado`, se limpia solo).
  Atraso a 8 días (decisión de Jahnn — el vencimiento a 1 día de Byte
  es un default, no un plazo real). Cuadre a TRES BANDAS: facturas +
  boletas + tickets = total de ventas (facturas ≠ ventas y no debe
  serlo). "Huérfanos" = ventas a crédito sin cuota de cobro en Byte
  (típico tras anular una factura): se listan aparte, se arreglan
  asignándoles la cuota EN BYTE, no en la app. Visible en Grupo →
  Dashboard solo lectura (`ReceivablesSection`).
- **Cuadre BCP** (`/[negocio]/reportes`, tab "Cuadre BCP"): prueba
  día-por-día `saldo_ayer + ingresos_banco − egresos_banco = saldo_hoy`
  contra `daily_records.bank_balance_real`, más un comparador contra el
  extracto real del banco. Nació de una auditoría con Kelly de 4 meses
  (abr-jul) que encontró y corrigió errores reales de clasificación
  (`src/app/actions/bcp-reconciliation.ts`).
- **EIRS PDF**: el Reporte Ejecutivo explica en prosa por qué EBITDA
  (Byte, devengado) y Flujo de caja (banco+caja, liquidez) no
  coinciden — no es un cuadre cerrado como Cuadre BCP, hay un residuo
  de desfase de cobro sin trackear (`src/lib/report/narrative.ts`).
- **Préstamos socio**: `getLoansSummary` separa prestado vs condonado
  sin doble contar los lotes creados por `createDirectLoanWithExpenses`
  (que generan gasto 'socio' + préstamo a la vez para el mismo hecho
  económico) — filtro por patrón de nota, ver lección de doble conteo.

## 7. Estado al 2026-08-10

- **`staging` == `main`, sin diferencia.** Último commit:
  `8410e2d` (fix de un `export const` en archivo `"use server"` que
  tumbaba `/atelier/panel` con 500 — ver lección #8). Desde el
  19-jul se sumaron: EIRS PDF bridge, auditoría bancaria abr–jul con
  Kelly (reclasificaciones + fix de doble conteo en préstamos + tab
  Cuadre BCP), rol de Atelier renombrado (Luana → Luis Pisco), Ventas
  por Cliente, y Cuentas por Cobrar.
- **Migraciones corridas** (verificadas en BD, además de las de
  jul-2026): `2026-08-09-ventas-por-cliente.sql` (tablas
  `client_sales_snapshots`/`client_sales_rows`),
  `2026-08-09-cuentas-por-cobrar.sql` (tablas
  `invoice_documents`/`invoice_imports`). No hay migraciones pendientes
  de correr.
- **Usuarios v3 activos**: Luis Pisco (`admin-atelier`), Raúl
  (`admin-fonavi`), Chari (`admin-centro`), Junior
  (`verif-centro`), Jefe de tienda Fonavi (`verif-fonavi`). Luana
  sigue en la tabla con `active=false` (despedida, no borrada).
- **663 tests** en 62 archivos, todos en verde (subieron de 531 con
  los parsers de client-sales y receivables — 12 y 28 tests nuevos).
- **Datos reales cargados** (no son datos de prueba, no borrar):
  `invoice_documents` tiene la semana real del 03–08-ago de Atelier
  (51 documentos); `client_sales_snapshots` tiene al menos 1 snapshot
  real.

## 8. Pendientes conocidos (no empezar sin que Jahnn lo pida)

- **Huérfanos de cuentas por cobrar**: 2 ventas (S/150.62, Fonavi y
  KAPHIY) quedaron sin cuota de cobro en Byte tras anularse su factura
  — Jahnn tiene que pedirle a Luis que les asigne la cuota EN BYTE; el
  aviso ámbar desaparece solo cuando suba el archivo de nuevo.
- **Entrada obsoleta de Luana** en `src/app/actions/direccion.ts:273`
  ("Luana · Supervisora Atelier", roster del Sistema de Dirección) —
  flagged dos veces, Jahnn aún no ha dicho si quitarla o reemplazarla
  por Luis.
- **Mayo S/831.65 sin explicar**: única diferencia banco-vs-sistema de
  la auditoría abr-jul con Kelly que quedó genuinamente sin resolver
  tras búsqueda exhaustiva — necesitaría el detalle línea por línea de
  Kelly de mayo, o confirmar si ella excluyó el préstamo de S/1,000 del
  21-may de su suma.
- **Backlog aprobado y pospuesto**: soft-delete, BaseModal genérico,
  unificar cost_type/cost_group, limpieza EBITDA, typos de categorías.
- **Re-mirar la base del ticket** (Fonavi 24.70 / Centro 24.82) cuando
  haya 2-3 semanas de datos con delivery registrado: al excluir
  delivery el ticket medido sube un poco.
- **De Jahnn (no del agente)**: exports de rotación Atelier mar-may;
  costear recetas faltantes; revisar la URL del cron keep-alive en
  cron-job.org (podría apuntar al dominio 404); gaps de la carga de
  Kelly en Atelier (saldo BCP, B2B, reembolsos sin flag).
- **Manuales en Dropbox** (`Instructivos/Manual_Panel_de_Sede...`)
  desactualizados tras los últimos PRs — regenerar cuando lo pida.
  SIN contraseñas dentro, siempre.

## 9. Cómo verificar tu trabajo aquí

```bash
npx tsc --noEmit        # tipos
npm run lint            # cero avisos NUEVOS (hay ~33 viejos aceptados)
npx vitest run          # 663 en verde hoy — si bajan, rompiste algo
npm run build           # el build de Vercel
```

**`tsc`+`lint`+`vitest` en verde NO es suficiente para dar una pantalla
nueva por lista** — un archivo `"use server"` con un export no-async
compila y pasa lint pero tumba la página en el navegador (lección #8).
Toda pantalla nueva que dependa de una `action` se abre en
`preview_start` + se lee con `read_page`/`javascript_tool` antes de
reportarla como lista.

Los tests usan drivers de BD falsos (mocks de neon/db) — nunca tocan
Neon. Para verificar datos reales: scripts efímeros con `npx tsx`
leyendo `DATABASE_URL` de `.env.local`, SOLO consultas de lectura
(los scripts se borran después de usarse). El shell puede resetear el
cwd — siempre `cd` al repo primero.
