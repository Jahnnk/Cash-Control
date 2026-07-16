<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Flujo de ramas y deploys

## Ramas

- **`main`** → producción. Auto-deploya a `cash-control-delta.vercel.app`
  (dominio asignado real — verificado jul-2026; `cash-control.vercel.app`
  devuelve 404, no usarlo).
- **`staging`** → preview/validación. Auto-deploya al dominio
  `cash-control-git-staging-jahnnki-6716s-projects.vercel.app`
  (auto-generado por Vercel; reemplazar acá si se configura un alias
  más limpio en Vercel Settings → Domains).

## Reglas de push

| Origen del cambio | Rama destino | Autorizado para pushear |
|---|---|---|
| Claude Code | `staging` | ✅ Sí, automático tras cada commit |
| Claude Code | `main` | ❌ Nunca |
| Jahnn (Terminal) | `staging` | ✅ Sí |
| Jahnn (GitHub UI o Terminal) | `main` (vía merge de staging) | ✅ Sí |

## Flujo estándar

1. Claude Code trabaja sobre `staging`:
   ```bash
   git checkout staging
   # ... edits + commit ...
   git push origin staging
   ```
2. Vercel detecta el push y deploya al dominio de staging (~1-2 min).
3. Claude Code reporta a Jahnn con la URL de staging para validar.
4. Cuando Jahnn confirma que todo cuadra, hace merge `staging → main`:
   - **GitHub UI**: "Compare & pull request" → "Merge"
   - **Terminal**:
     ```bash
     git checkout main
     git merge staging
     git push origin main
     ```
5. Vercel deploya producción automáticamente.

## Reglas duras

- Claude Code **NUNCA** hace push a `main`.
- Claude Code **SIEMPRE** trabaja sobre `staging`.
- Si Claude Code se encuentra en `main` por error, debe cambiar a
  `staging` antes de commitear (`git checkout staging`).
- Tras cada commit en `staging`, Claude Code hace
  `git push origin staging` y avisa a Jahnn con el dominio de staging
  para que valide antes de promover a producción.

## Base de datos compartida (riesgo a conocer)

Por ahora `staging` y `main` apuntan a la MISMA base de datos Neon
(misma `DATABASE_URL` en ambos deploys de Vercel). Cambios de datos
hechos vía la app en staging afectan también a producción.

- ✅ Aceptable: cambios de UI, lógica de presentación, queries
  read-only, refactors de código sin migración.
- ⚠️ Requiere snapshot Neon + OK explícito de Jahnn:
  - Migraciones de schema (`ALTER TABLE` aunque sea idempotente).
  - Re-imports de datos.
  - UPDATEs / DELETEs masivos.
  - Cualquier mutación de tabla compartida.

Para aislar la BD de staging en el futuro: crear una rama Neon
dedicada para staging y override de `DATABASE_URL` en Vercel Project
Settings → Environment Variables (scope: Preview deployments).

# Autenticación por contraseña compartida

La app entera (páginas + server actions) está detrás de una contraseña
única verificada en `src/middleware.ts` con cookie firmada
(`yayis_auth`, HMAC-SHA256, 30 días — ver `src/lib/auth-token.ts`).
El selector de rol Jahnn/Kelly sigue existiendo DETRÁS del login y es
prevención de errores, no seguridad.

## Variable de entorno

`APP_PASSWORD` — la contraseña compartida. Debe estar configurada en
Vercel para **Production y Preview** (y en `.env.local` para dev).
**Fail-closed:** si falta, nadie puede entrar (la pantalla de login
lo avisa). Cambiar la contraseña invalida todas las sesiones activas
(la cookie se firma con la propia contraseña).

Excepciones sin login: `/login` y `/api/keep-alive` (token propio).

## Sesiones con alcance (tokens v2)

Además de la contraseña completa existen contraseñas POR SEDE que crean
tokens v2 (`v2.<exp>.<scope>.<firma>`, firmados con la contraseña del
scope — ver `src/lib/auth-token.ts` y `src/lib/session-access.ts`):

| Scope | Env var | Acceso permitido |
|---|---|---|
| `admin-atelier` | `ADMIN_PASSWORD_ATELIER` | `/atelier/panel` (supervisora operativa) |
| `admin-fonavi` | `ADMIN_PASSWORD_FONAVI` | `/fonavi/panel` |
| `admin-centro` | `ADMIN_PASSWORD_CENTRO` | `/centro/panel` |
| `verif-fonavi` | `VERIF_PASSWORD_FONAVI` | `/fonavi/verificacion` |
| `verif-centro` | `VERIF_PASSWORD_CENTRO` | `/centro/verificacion` |

El middleware bloquea todo fuera del prefijo permitido y las server
actions re-verifican con `getSessionRole()` de
`src/lib/session-access.ts` — ÚNICA fuente de verdad para resolver la
sesión en actions (no re-implementar el switch de contraseñas en cada
archivo). Fail-closed: scope sin env var nunca valida. La cookie
`yayis_scope` (no-httpOnly) es solo una pista de UI para el sidebar,
NUNCA seguridad.

# Keep-Alive Cron (mantener Neon despierta)

El endpoint `GET /api/keep-alive` hace un `SELECT 1` a Neon para
evitar que la BD se suspenda por inactividad. Solo responde con
consulta real durante horario laboral Perú (8 AM - 8 PM); fuera de
ese rango devuelve `{ok:true, skipped:true}` sin tocar la BD.

## Por qué solo horario laboral

Neon Free tier tiene ~100 horas de compute/mes. Mantener la BD viva
24/7 nos pasa del límite. 8 AM - 8 PM Perú = 12 hrs/día = ~30 hrs/mes
de compute real, dentro del límite gratis.

## Variable de entorno

`KEEP_ALIVE_TOKEN` (random `kpalv_*`) — debe estar configurada en
Vercel para **Production, Preview y Development**. El token vive en
`.env.local` local y en Vercel Settings → Environment Variables.

## Configuración del cron externo (cron-job.org)

1. Crear cuenta en https://cron-job.org (gratis).
2. Click **Create cronjob**.
3. URL: `https://cash-control-delta.vercel.app/api/keep-alive?token=<TOKEN>`
4. Schedule: **cada 4 minutos**.
5. Notifications: email solo si falla 3 veces seguidas.

Verificar funcionamiento manual:
```
curl "https://cash-control-delta.vercel.app/api/keep-alive?token=<TOKEN>"
```
Respuesta esperada (en horario laboral):
```json
{"ok":true,"alive":true,"latency_ms":120,"hour_peru":14,"timestamp":"..."}
```

# Snapshot Neon antes de DELETE en producción

Antes de cualquier `DELETE` en producción, debe existir un snapshot Neon
manual reciente (< 24h). Si no es posible crear snapshot desde el agent,
pausar la operación y solicitar al usuario que cree uno manualmente desde
la consola de Neon (https://console.neon.tech) antes de proceder.

Aplica a:
- Scripts en `scripts/audit/*` que ejecuten `DELETE` con `--apply`.
- Cualquier `db.execute(sql\`DELETE ...\`)` ad-hoc.
- Tareas de cleanup masivo (huérfanos, duplicados, batches rolled-back).

NO aplica a:
- Soft-deletes vía `archived = true`.
- DELETE dentro de `executeExcelImport` y similares — tienen idempotencia
  por diseño (DELETE WHERE imported_from_excel = true seguido de INSERT
  en la misma operación), no son destructivos en producción.

# Convenciones técnicas

## Parsers de Excel

Detectar columnas dinámicamente leyendo el header, nunca asumir offsets
fijos. El rango `!ref` de Excel cambia según si la columna A tiene datos
o no, lo que rompe parsers basados en posiciones absolutas.

Patrón a seguir (ver `src/lib/control-vtas-parser.ts`):

```ts
const headerRow = rows[0] ?? [];
let dateColIdx = -1;
for (let c = 0; c < headerRow.length; c++) {
  if (typeof headerRow[c] === "string" && /^\s*fecha\s*$/i.test(headerRow[c])) {
    dateColIdx = c;
    break;
  }
}
if (dateColIdx === -1) {
  errores.push(`No encontré columna 'Fecha' en '${sheetName}'.`);
  return emptyResult(errores, warnings);
}
// El resto de columnas se derivan relativas a dateColIdx (idx+1, idx+2…).
```

Además, loggear el offset detectado al inicio del parser para auditoría
posterior en logs de Vercel:

```ts
console.log(
  `[parser-name] sheetName="${sheetName}" dateColIdx=${dateColIdx} headerRow.length=${headerRow.length}`,
);
```

Caso histórico (Prompt 19): el parser de Control de VTAS asumía
`row[0] = Fecha` validado contra Fonavi (`!ref=B1:L211`, idx 0 = col B).
En Centro (`!ref=A1:L211`, idx 0 = col A vacía) producía 0 días
silenciosamente. El bug pasó desapercibido en producción hasta que el
usuario notó que el card "Ventas Byte" caía al fallback legacy tras
re-importar.
