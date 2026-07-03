# Product Intelligence Center (PIC) — Arquitectura v1 (aprobada jul-2026)

> Misión: responder "¿qué productos impulsar, proteger, ajustar de precio,
> revisar o experimentar para maximizar crecimiento, rentabilidad y valor
> estratégico?" — un Director Comercial basado en datos, no un reporte.

## El pipeline aprobado

```
FUENTES DE DATOS          NORMALIZACIÓN           BUSINESS KNOWLEDGE ENGINE
────────────────          ─────────────           ─────────────────────────
Byte (ventas × producto)  parsers por fuente  →   tablas canónicas con
pricing-engine (catálogo,                          procedencia (products,
costos, márgenes)                                  product_month_sales,
[futuras: compras,                                 product_cost_snapshots)
inventario, CRM, apps]                                    │
                                                          ▼
                          MÉTRICAS BASE (una vez por producto)
                                    │
                          METODOLOGÍAS = emisores de SEÑALES
                          (ABC · Menu Engineering · BCG interna ·
                           concentración · precio) — sin voz propia
                                    │
                          SÍNTESIS → UN Veredicto Estratégico por producto
                          (IMPULSAR · PROTEGER · AJUSTAR PRECIO ·
                           REVISIÓN ESTRATÉGICA · EXPERIMENTAR · OBSERVAR)
                                    │
                          PortfolioStory (un solo cerebro, una compilación)
                                    │
                 ┌──────────────┬───┴──────────┬──────────────┐
              Dashboard      PDF Comercial   PowerPoint     Excel
              (vivo)         (renderers tontos, mismo design-system EIRS)
```

## Los cuatro principios heredados del EIRS (aprobados por el dueño)

1. **Unidades de negocio genéricas** — capacidades detectadas por datos,
   sin IDs quemados en la lógica.
2. **Un solo cerebro** (`PortfolioStory`) → renderers tontos con tests
   guardianes de imports.
3. **Inteligencia ≠ narrativa**, separadas estructuralmente.
4. **100% funcional sin IA** — reglas deterministas y auditables (Fase A);
   LLM opcional en el futuro (Fase B).

## Business Knowledge Engine (visión del dueño, jul-2026)

"No quiero un importador para Byte. Quiero una arquitectura de fuentes de
datos… todas deberán alimentar un único Business Knowledge Engine."

**Decisión de diseño: el BKE se implementa como DISCIPLINA, no como un
mega-motor abstracto.** Tres convenciones obligatorias que cualquier fuente
futura (compras, inventario, CRM, delivery apps) debe cumplir:

1. **Toda fila de hechos lleva procedencia**: columnas `source` (texto,
   ej. 'byte', 'pricing-engine'), `import_batch_id` (reutiliza la tabla
   `import_batches` existente) e `imported_at`. Auditoría total.
2. **Los motores de inteligencia SOLO leen tablas canónicas** — nunca
   archivos, nunca la fuente original, nunca otra app. La normalización
   ocurre en el importador, una sola vez.
3. **Patrón de importador único**: parsear → validar → normalizar →
   reporte de calidad de datos → escritura atómica e idempotente
   (mismo patrón probado del import de Excel / caja chica).

Agregar una fuente nueva = un parser + mapeo a tablas canónicas. Los
motores no se enteran. Si algún día hacen falta un registro formal de
fuentes o schedulers, se agregan encima sin romper este contrato.

## Modelo de datos canónico (Fase 0)

- **`products`** — catálogo espejo por unidad de negocio: sku, nombre,
  categoría, canal (futuro), activo, `source` + `source_ref` (id en la
  fuente). Fuente de verdad de costos/márgenes: **pricing-engine**.
- **`product_cost_snapshots`** — costo unitario, precio de lista y margen
  objetivo **congelados por mes** (`YYYY-MM`). El pasado nunca se
  reescribe: si la receta cambia en agosto, el reporte de junio sigue
  contando la historia de junio.
- **`product_month_sales`** — el corazón: unidad + producto + mes +
  unidades + soles. `product_id` es NULLABLE con `product_name_raw`
  siempre presente: una venta sin match de catálogo NO se pierde — se
  muestra en el reporte de calidad de datos para corregirla.

**Check de integridad natural**: al importar ventas por producto, el
sistema cuadra `Σ productos ≈ total de ventas del mes` (que Cash Control
ya conoce) y muestra la diferencia. Igual que se cuadra el banco.

## Decisiones de honestidad (aprobadas)

- **BCG interna**, no clásica: ejes = crecimiento de la demanda del
  producto vs. peso en la utilidad del portafolio. Etiquetada así en
  todos los renderers. No inventamos cuota de mercado.
- **Metodologías se activan por disponibilidad de datos**: mes 1 → ME,
  ABC, concentración, precio; mes 3+ → BCG interna, crecimiento,
  tendencias. Los componentes del Health Score sin datos suficientes se
  muestran en gris y el score se re-pondera sobre lo medible.
- **Prohibido "eliminar"**: el veredicto es "Revisión estratégica" y la
  narrativa lista las razones válidas para conservar (imagen,
  experiencia, cross-selling) como preguntas al dueño.
- El simulador muestra **escenarios** de elasticidad (volumen igual /
  −5% / −10%), nunca una promesa única — no conocemos la elasticidad
  del mercado de Cajamarca y el sistema lo dice.

## Product Portfolio Health Score (0-100, auditable)

| Componente | Peso | Fórmula visible |
|---|---|---|
| Rentabilidad | 25% | margen de contribución ponderado vs. margen objetivo (pricing-engine) |
| Concentración | 20% | % de utilidad del top-3 productos |
| Balance del menú | 20% | % de utilidad en cuadrantes sanos del ME (Stars + Plow Horses) |
| Crecimiento | 15% | % de utilidad en productos con demanda creciente (3m) |
| Cola improductiva | 10% | % de productos que aportan <umbral de utilidad |
| Vitalidad | 10% | % de utilidad de productos introducidos ≤6 meses |

Cada componente con `formula` string, como `decision-intelligence.ts`.

## Alcance y fases

- **Alcance inicial**: Fonavi y Centro (B2C con carta — donde el Menu
  Engineering aporta más). Atelier B2B tendrá su propia inteligencia
  futura (clientes, frecuencia, ticket, concentración por cliente).
- **Fase 0a** (este PR): doc + tablas canónicas + sync de catálogo/costos
  desde pricing-engine (script con dry-run).
- **Fase 0b**: importador de ventas por producto — SE DISEÑA SOBRE EL
  EXPORT REAL DE BYTE (pendiente de que Jahnn lo comparta). Incluye
  reporte de calidad de datos + check de cuadre mensual.
- **Fase 1**: cerebro (métricas base + ME + ABC + concentración + precio
  + veredictos + Health Score + recomendaciones ≤5 + narrativa) +
  Dashboard "Inteligencia Comercial".
- **Fase 2**: BCG interna + crecimiento + tendencias (2-3 meses de
  historia) + simulador.
- **Fase 3**: Board Package comercial (PDF/PPT/Excel desde el mismo
  Story, renderers tontos).

## Sync de catálogo (Fase 0a)

`scripts/sync-product-catalog.ts` — lee la Neon del pricing-engine
(`PRICING_DATABASE_URL`, solo en `.env.local`, nunca en Vercel) y hace
upsert a las tablas canónicas de Cash Control. Dry-run por defecto;
`--apply` escribe (requiere OK explícito del dueño — es la BD de
producción). Mapeo: cafetería pricing 1 "Fonavi" → business 2; cafetería
pricing 2 "Centro" → business 3. Cadencia: mensual o al cambiar recetas.
Las bases son Neons distintas a propósito: sync por snapshot, no conexión
en vivo (una app no puede tumbar a la otra).
