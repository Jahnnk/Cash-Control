# Contexto completo del proyecto — léeme antes de trabajar

> Para cualquier agente o desarrollador que llegue nuevo (Codex, Claude,
> humano). Actualizado: 2026-07-19. Complementa `AGENTS.md` (reglas de
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
- **Kelly** = socia y gerente comercial; registra las finanzas de las
  3 SEDES en Excel (Atelier desde jul-2026, acuerdo de reunión) y a
  veces demora días/semanas (por eso existe la tarjeta de "frescura de
  datos" y el import central en Grupo). Su rol de UI ve las 3 sedes.
  OJO Atelier: sus registros especiales (clientes B2B/CxC, préstamos
  socio, gastos compartidos, clasificaciones no operativas) están
  PROTEGIDOS del archivado en el import — el Excel no sabe expresarlos
  y esas capas se registran EN la app, nunca vía Excel.
- **Personal con acceso**: Luana (supervisora Atelier), Luis (admin
  Fonavi), Chari (admin Centro), Junior (verificador Centro), Jefe de
  tienda Fonavi (verificador). Gestionados en Grupo → Configuración.
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
   avisos NUEVOS; hay ~31 preexistentes aceptados) + `npx vitest run`
   (531 tests en verde al día de hoy) + `npm run build`. Esperar el CI
   "Tests" en verde antes de reportar.
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
- **Auth de 3 niveles** (ver AGENTS.md): v1 = APP_PASSWORD (dirección,
  vive SOLO en Vercel a propósito), v2 = contraseñas por sede en env
  vars (legado, en extinción), v3 = usuarios por persona en tabla
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

## 7. Estado al 2026-07-19

- **PRs #67–#94: TODOS mergeados.** `staging` == `main`. CI verde.
- **Migraciones corridas** (verificadas en BD): feedback-admins,
  service-timings, worker-shifts, byte-ventas-daily, app-users,
  delivery (CHECK + columnas). No hay migraciones pendientes.
- **Usuarios v3 activos**: 5 (Luana, Luis, Chari, Junior, Jefe de
  tienda Fonavi). Env vars por sede YA BORRADAS de Vercel — el control
  de accesos es 100% desde la app.
- **531 tests** en 54 archivos, todos en verde.

## 8. Pendientes conocidos (no empezar sin que Jahnn lo pida)

- **Backlog aprobado y pospuesto**: soft-delete, BaseModal genérico,
  unificar cost_type/cost_group, limpieza EBITDA, typos de categorías.
- **Re-mirar la base del ticket** (Fonavi 24.70 / Centro 24.82) cuando
  haya 2-3 semanas de datos con delivery registrado: al excluir
  delivery el ticket medido sube un poco.
- **De Jahnn (no del agente)**: datos de Kelly al día; exports de
  rotación Atelier mar-may; costear recetas faltantes; revisar la URL
  del cron keep-alive en cron-job.org (podría apuntar al dominio 404).
- **Manuales en Dropbox** (`Instructivos/Manual_Panel_de_Sede...`)
  desactualizados tras los últimos PRs — regenerar cuando lo pida.
  SIN contraseñas dentro, siempre.

## 9. Cómo verificar tu trabajo aquí

```bash
npx tsc --noEmit        # tipos
npm run lint            # cero avisos NUEVOS (hay ~31 viejos aceptados)
npx vitest run          # 531 en verde hoy — si bajan, rompiste algo
npm run build           # el build de Vercel
```

Los tests usan drivers de BD falsos (mocks de neon/db) — nunca tocan
Neon. Para verificar datos reales: scripts efímeros con `npx tsx`
leyendo `DATABASE_URL` de `.env.local`, SOLO consultas de lectura
(los scripts se borran después de usarse). El shell puede resetear el
cwd — siempre `cd` al repo primero.
