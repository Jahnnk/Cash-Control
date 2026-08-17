# Contexto completo del proyecto — léeme antes de trabajar

> Para cualquier agente o desarrollador que llegue nuevo (Codex, Claude,
> humano). Actualizado: 2026-08-17. Complementa `AGENTS.md` (reglas de
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
  **Juani** = socia y pareja de Jahnn; supervisa los locales una o dos
  veces por semana. Desde ago-2026 tiene usuario con scope `highlight`:
  asigna Highlights en las 3 sedes y aprueba las propuestas de los
  administradores, sin acceso a nada más de la app.
  **Pendiente sin resolver**: `src/app/actions/direccion.ts:273` sigue
  listando a "Luana · Supervisora Atelier" en el roster del Sistema de
  Dirección — flagged, Jahnn no ha dicho si quitarla o reemplazarla.
- Moneda S/. Timezone America/Lima. Cálculos financieros con cuidado
  de redondeo (ver lección de decimales abajo).

## 3. Reglas duras de operación (NUNCA romper)

1. **Trabajar SIEMPRE en `staging`.** Tras cada commit:
   `git push origin staging`, esperar el CI "Tests" en verde y **mergear
   a `main` sin pedir OK** — política de Jahnn del 01-ago-2026 ("al
   final siempre termino aplastando el botón, es una pérdida de
   tiempo"). Aplica a cambios de código normales. Las excepciones de
   base de datos (regla 2 y 3) NO cambiaron. AGENTS.md es la fuente
   de verdad de esto; este documento solo lo resume.
2. **Staging y producción comparten la MISMA base de datos Neon.**
   Toda escritura desde staging impacta producción. Escrituras directas
   a datos de producción requieren confirmación explícita de Jahnn
   ("sí, hazlo"). DELETE requiere snapshot Neon < 24h (salvo flujos
   idempotentes DELETE+INSERT tipo import).
3. **Migraciones de schema: solo con OK EXPLÍCITO de Jahnn**, nunca por
   iniciativa propia. Se escribe el SQL en
   `scripts/migrations/AAAA-MM-DD-nombre.sql` (idempotente, con
   comentario de propósito), se le explica qué toca y qué riesgo tiene,
   y recién con su "sí" se corre (o la corre él en el SQL Editor de
   Neon). Para cualquier cosa que modifique datos existentes, además
   snapshot de Neon antes. El código debe degradar con gracia mientras
   la migración no corra (try/catch + `faltaMigracion`, con la pantalla
   ocultándose sola — ver `highlight-propuestas.ts` como patrón).
   OJO: el driver de neon rechaza varias sentencias en un `.query()`;
   hay que partirlas.
4. **Contraseñas: JAMÁS en documentos, manuales o texto persistente.**
   Se generan (nunca las inventa un humano), se muestran UNA vez, se
   entregan en persona. En BD solo hashes (scrypt).
5. **Antes de cada PR**: `npx tsc --noEmit` + `npm run lint` (cero
   avisos NUEVOS; hay ~33 preexistentes aceptados) + `npx vitest run`
   (775 tests en verde al día de hoy) + `npm run build`. Esperar el CI
   "Tests" en verde antes de reportar. Si la pantalla se abre en el
   navegador, esto NO reemplaza probarla ahí (ver lección #8).
6. **Commits**: mensaje en español contando el POR QUÉ (no el qué: el
   diff ya dice qué cambió), terminando con la firma del modelo que lo
   escribió — hoy `Co-Authored-By: Claude Opus 5
   <noreply@anthropic.com>`. Si eres otro agente o un modelo distinto,
   usa TU propia firma; no suplantes.
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

11. **Un parámetro que SOLO aparece dentro de `IS NULL` / `IS NOT NULL`
    revienta en Postgres**: `could not determine data type of parameter
    $N`. Pasó al cerrar un Highlight (`reflect_en = CASE WHEN ${ayudo}
    IS NOT NULL OR ... THEN now() END`) y los administradores veían "No
    pude guardar" (13-ago-2026). Formas seguras: comparar una COLUMNA
    (`columna IS NOT NULL`), castear explícito (`${p}::text IS NULL`),
    o —mejor— calcular el booleano en JS y mandar un solo parámetro.
    Por qué se escapó: probé el SQL a mano con literales, no la action
    real con parámetros. **Reproducir siempre llamando a la action.**
    Guardia: `src/lib/__tests__/sql-parametros.test.ts`.
12. **Las sesiones con alcance también bloquean `/api/*`.** El
    middleware encierra a un scope (`admin-fonavi`) dentro de su prefijo
    de ruta, y `/api/highlight-photos` cae fuera: Raúl recibía un
    redirect a HTML, `res.json()` explotaba y el toast culpaba a "tu
    conexión". Explicaba por qué NO existía ni una foto en todo el
    sistema. Toda ruta de API que use el personal va en la lista blanca
    `API_CON_ALCANCE` de `src/middleware.ts`. Guardia:
    `src/lib/__tests__/middleware-api-alcance.test.ts`. De paso: el
    límite real de subida en Vercel es ~4.5 MB (por eso
    `ATTACHMENT_MAX_BYTES` = 4 MB), y un mensaje de error que adivina la
    causa ("revisa tu conexión") esconde el problema — mostrar el código
    de estado real.
13. **Un estado que depende del reloj no se guarda, se deduce.** Las
    propuestas de Highlight "caducadas" son (pendiente + fecha pasada) y
    se calculan al leer (`estadoEfectivo`). Guardarlas obligaría a un
    proceso que barra la tabla cada madrugada, y el dato empieza a
    mentir apenas ese proceso falle una vez. Mismo criterio en el
    estado de llenado de reportes.

14. **Una consulta COPIADA es un candado que algún día falta.** La
    cadena que escribe `bank_balance_real` estaba copiada palabra por
    palabra en tres archivos. En jul-2026 se le puso el candado de las
    sedes con reset a UNA copia (`daily-records.ts`); las otras dos
    (`record-edits.ts`, `fonavi-receivables.ts`) se quedaron sin él. El
    5-ago alguien editó tres movimientos de Fonavi, la copia sin candado
    escribió saldos calculados **arrancando de cero**, y el panel mostró
    **−S/455.61** cuando el banco tenía S/15,594.02:

    ```
    28-jul:       0 + 802.44 −    54.79 =    747.65
    30-jul:       0 + 839.84 − 1,517.24 =   −677.40
    03-ago: −677.40 + 703.83 − 1,395.00 = −1,368.57   ← quedó de "ancla"
    ```

    Dos reglas que salieron de acá:

    · **El candado va DENTRO del SQL, no en el llamador.** Un
      `if (!hasReset)` protege a los llamadores que existen hoy; el
      `NOT EXISTS (... system_start_date IS NOT NULL)` en el `WHERE`
      viaja con la consulta y protege a los que vengan. Todo vive en
      `src/lib/saldo-bcp-sql.ts` — una sola copia.
    · **`bank_balance_real` significa cosas distintas según la sede.**
      Sin reset (Atelier hasta jul): cadena de saldos calculados. Con
      reset (las 3 hoy): SOLO lecturas reales del banco; el saldo se
      arma virtual desde el corte. Misma columna, dos significados — es
      la trampa de fondo, y por eso el candado tiene que ser estructural.

    Guardias: `src/lib/__tests__/saldo-bcp-sql.test.ts` (exige el candado
    y sale a buscar copias nuevas por todo `src/`) y el caso 5 de
    `bank-balance-formula.test.ts`. La primera versión del test encontró
    sola la tercera copia que yo no había visto.

    **Un saldo de banco NEGATIVO es imposible**: si aparece, no es un
    error de suma, es que algo calculado se coló como lectura real.

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

- **Highlight diario** (metodología *Make Time*, ago-2026): UNA sola
  tarea por sede y día. `src/lib/highlight.ts` (guía, Reflect, racha,
  cumplimiento) + `src/app/actions/highlight.ts` + tarjeta amarilla
  `[negocio]/panel/highlight-card.tsx` + consola `/grupo/highlight`.
  - **La regla que sostiene todo**: `UNIQUE (business_id, fecha)` en
    `highlights`. Está en la migración documentada como "es la regla, no
    una optimización". No aflojarla.
  - **Quién asigna**: Jahnn, Kelly y **Juani** (socia; usuario con scope
    `highlight`, alcance a las 3 sedes, sin acceso al resto de la app).
    La firma NO se teclea: sale de la llave con la que entró cada uno,
    porque el admin tiene que saber de quién viene el encargo. Pisar el
    Highlight de otra persona pide confirmación explícita.
  - **Cierre**: el admin marca logrado/no logrado y responde el Reflect
    (3 preguntas abiertas; la cuarta ES el estado, no se guarda dos
    veces). Puede cerrar días ANTERIORES — se veían solo los de hoy y
    los atrasados quedaban sin forma de cerrarse.
  - **Fotos** (`highlight_indicacion` de dirección / `highlight_evidencia`
    del admin) vía `/api/highlight-photos`; se pueden adjuntar también a
    los últimos 7 días, no solo a hoy.
  - **Planificador semanal** (`planificador.tsx`): programar por fecha
    por adelantado, con "por qué importa" y foto.
  - **Control de cumplimiento** (`control-cumplimiento.tsx`): quién
    cerró y quién no. Solo levanta la voz cuando hay algo sin responder.
- **Propuestas de Highlight** (17-ago-2026): el administrador propone y
  dirección aprueba. `src/lib/highlight-propuestas.ts` (lógica pura) +
  `src/app/actions/highlight-propuestas.ts` + `proponer-highlight.tsx`
  (panel de sede) + `bandeja-propuestas.tsx` (consola de Grupo).
  - **Tabla APARTE** (`highlight_propuestas`), no un estado más en
    `highlights`: una propuesta para un día ya ocupado chocaría contra
    el UNIQUE, y aflojarlo obligaría a cada consulta existente a
    acordarse de filtrar propuestas — el día que una se olvide, el admin
    ve una propuesta sin aprobar como si fuera su tarea del día.
  - **El choque nunca se resuelve solo**: aprobar sobre un día ocupado
    NO toca la base; devuelve `conflicto`, muestra qué había y quién lo
    asignó, y sugiere el primer día libre. La segunda llamada, con
    `moverExistenteA`, mueve el que estaba — todo en `sql.transaction`,
    porque a medias la sede queda sin Highlight o con dos.
  - **Decisiones de Jahnn**: aprueban él y Juani; se propone desde HOY
    en adelante (el formulario sugiere mañana); la propuesta sin
    respuesta CADUCA y no se auto-aprueba. Las caducadas se le muestran
    a propósito — es el espejo de su propio tiempo de respuesta; si
    nadie contesta, los admins dejan de proponer y la idea se muere.
  - Una sola propuesta pendiente por sede y día (índice parcial único).
- **¿Están al día los reportes?** (`src/lib/kpis/llenado.ts`, lógica
  pura): estado de cada casilla sede × día. Dos vistas, UN cerebro —
  si cada pantalla contara por su cuenta, Jahnn vería "falta" y el admin
  "al día", y se acaba la confianza en el semáforo.
  - **Grupo → Reportes** (`estado-llenado.tsx`): cuadrícula 3 sedes × 7
    días de la semana del calendario. Una línea verde cuando todo está
    bien; la cuadrícula se abre sola solo si hay algo que reclamar.
  - **Panel de sede** (`estado-kpis-card.tsx`, debajo del Highlight):
    ventana móvil de los ÚLTIMOS 7 DÍAS (no la semana de domingo a
    sábado: un lunes, el calendario le escondería al admin lo que quedó
    debiendo la semana anterior). Lo vencido manda sobre lo de hoy;
    cuando está al día NO desaparece, se queda en verde — la
    confirmación es lo que hace hábito. Botón que lleva al formulario
    con la fecha ya elegida.
  - **Dos datos configurables por sede** en `actions/llenado-reportes.ts`,
    con recuadro explicativo: `DIAS_ESPERADOS` (Atelier libra los
    domingos → `LUNES_A_SABADO`; cambiar a `TODA_LA_SEMANA` y listo) y
    `MODO_REGISTRO` ("importado" en Atelier — su día llega con el
    reporte de Byte, aunque su panel YA tiene formulario manual —
    "manual" en Fonavi/Centro). El modo solo cambia las PALABRAS del
    aviso, nunca qué día se considera faltante (hay test que lo clava).
  - **El dato real gana sobre lo esperado**: si un domingo Atelier SÍ
    registra, se pinta como cualquier día lleno.

## 7. Estado al 2026-08-17

- **`staging` == `main`, sin diferencia.** Último commit: `782a36a`
  (propuestas de Highlight). Desde el 10-ago se sumaron, en orden: el
  sistema de Highlight completo (asignación, fotos, Juani como segunda
  persona que asigna, planificador semanal, control de cumplimiento),
  el estado de llenado de reportes en Grupo, el aviso de KPIs en el
  panel de las 3 sedes, el día libre de Atelier, y las propuestas de
  Highlight de los administradores.
- **Migraciones corridas** (verificadas en BD): además de las de
  jul/ago, `2026-08-10-highlight.sql` (tabla `highlights`),
  `2026-08-11-app-users-scope-highlight.sql` (permite el scope
  `highlight` en el CHECK de `app_users` — hubo que partir el DROP y el
  ADD porque el driver de neon rechaza multi-statement en `.query()`) y
  `2026-08-17-highlight-propuestas.sql` (tabla `highlight_propuestas`,
  creada con OK explícito de Jahnn; tabla nueva y vacía, no tocó ni una
  fila existente). **No hay migraciones pendientes de correr.**
- **Usuarios v3 activos**: Luis Pisco (`admin-atelier`), Raúl
  (`admin-fonavi`), Chari (`admin-centro`), Junior (`verif-centro`),
  Jefe de tienda Fonavi (`verif-fonavi`), **Juani** (`highlight`, solo
  Highlight en las 3 sedes). Luana sigue con `active=false` (despedida,
  no borrada).
- **El rol `admin` ahora carga `nombre`** cuando la persona entró con su
  usuario propio de `app_users` (opcional: las contraseñas por sede
  heredadas no saben quién entró, y ahí se firma con la sede).
- **775 tests** en 71 archivos, todos en verde (subieron de 663).
- **Informe de traspaso a Kelly** (ago-2026): se probó por dos caminos
  independientes que Atelier se entregó el 01-ago con **S/2,045.79** en
  banco (cadena día a día de 120 días, 0 descuadres; y reconstrucción
  mes a mes, los 4 meses cerrando en 0.00). Cierre del informe: lunes
  10-ago 4:29pm.
- **Incidente Fonavi (17-ago-2026), cerrado**: el panel mostraba
  −S/455.61 de saldo. Causa: tres `bank_balance_real` calculados por una
  copia sin candado de la cadena (lección #14). Se limpiaron los tres
  (`scripts/migrations/2026-08-17-fonavi-saldos-calculados.sql`, con OK
  de Jahnn; incluye el SQL de reversión) y ahora Fonavi da **S/15,518.53
  de banco y S/163.50 de caja**, que es EXACTO a lo que calcula el Excel
  de Kelly. Contra el BCP real quedan −S/75.49, la misma diferencia que
  ella ya arrastra en su propia hoja: el sistema quedó cuadrado CON Kelly.
  De paso, la detección de descuadres dejó de mirar días anteriores al
  corte de cada sede (Atelier avisaba de un "descuadre" del 12-jul
  teniendo corte el 01-ago).
- **Datos reales cargados** (no son datos de prueba, no borrar):
  `invoice_documents` con la semana del 03–08-ago de Atelier (51
  documentos), `client_sales_snapshots` con al menos 1 snapshot real,
  `highlights` con los Highlights reales que ya cerraron los admins.

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
- **Confirmar que las fotos del Highlight ya suben de verdad**: el
  bloqueo del middleware se arregló (lección #12) pero no se pudo
  comprobar en el navegador con la sesión de un administrador —
  preguntarle a Raúl o a Luis.
- **Agosto de Atelier cierra en cero cuando aparezcan dos movimientos**:
  el pago de S/44.80 de Mendo Aliaga (factura FB02-1202, seguía
  pendiente) y S/0.15 de ITF de un domingo. La diferencia se mantuvo
  EXACTA en S/44.95 entre dos lecturas distintas del banco, lo que
  prueba que es un movimiento concreto que falta y no un error de suma.
- **Dos egresos de agosto sin categorizar** ("Desconocido / Por
  confirmar"): S/2,071.00 y S/1,600.69 — juntos, 36% del gasto bancario
  del mes.
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
npx vitest run          # 775 en verde hoy — si bajan, rompiste algo
npm run build           # el build de Vercel
```

**`tsc`+`lint`+`vitest` en verde NO es suficiente para dar una pantalla
nueva por lista** — un archivo `"use server"` con un export no-async
compila y pasa lint pero tumba la página en el navegador (lección #8).
Toda pantalla nueva que dependa de una `action` se abre en
`preview_start` + se lee con `read_page`/`javascript_tool` antes de
reportarla como lista.

**Pero ojo con el login**: la app entera está detrás de contraseña, y el
agente NO teclea contraseñas para autenticarse (ni siquiera las de
`.env.local`). En la práctica eso deja la verificación visual fuera de
alcance, y hay que compensarlo de otra forma: **sacar las decisiones y
los TEXTOS del componente a una librería pura y probarlos uno por uno**
(así se hizo con `mensajeEstadoKpis`). Un componente que solo pinta lo
que decide una función probada es mucho menos riesgoso que uno que
decide por su cuenta. Además, verificar las actions contra la BD real
con un test efímero + mocks de `session-access`/`active-business`
alcanza para probar permisos y flujos completos sin navegador (así se
probó el flujo de propuestas, incluido el choque de días).
Decirle a Jahnn con todas sus letras qué quedó sin ver en pantalla.

Los tests usan drivers de BD falsos (mocks de neon/db) — nunca tocan
Neon. Para verificar datos reales: scripts efímeros con `npx tsx`
leyendo `DATABASE_URL` de `.env.local`, SOLO consultas de lectura
(los scripts se borran después de usarse). El shell puede resetear el
cwd — siempre `cd` al repo primero.
