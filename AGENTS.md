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
