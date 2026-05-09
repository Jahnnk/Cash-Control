<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
