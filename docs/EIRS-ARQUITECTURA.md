# EIRS — Executive Intelligence Reporting System
## Documento de arquitectura (v2 — aprobada, con los 3 principios del dueño)

**Principios incorporados en la aprobación (2026-07-02):**
1. **Unidades de negocio genéricas** — nada de IDs quemados: `BusinessUnitRef`
   + `UnitCapabilities` detectadas por datos (una unidad "tiene CxC" si
   existen filas, no "si es Atelier"). Única atadura del modelo actual:
   `RECEIVABLES_OWNER_UNIT` (documentada en report-facts.ts).
2. **Board Meeting Package** — el entregable no es un PDF: es un paquete
   (`BoardPackageManifest`) de artefactos derivados del mismo Story
   (PDF/PPT/Excel hoy; agenda, minuta u otros mañana = un renderer más).
3. **Inteligencia ≠ Narrativa** — capas separadas por tipos:
   `ReportIntelligence` (KPIs, hallazgos, riesgos, oportunidades,
   proyecciones, decisiones — estructura pura con `source`) y
   `ReportNarrative` (prosa construida SOLO desde la inteligencia; la firma
   de `buildNarrative(intel)` lo fuerza y un test de imports lo vigila).
4. El sistema funciona 100% sin servicio de IA (Fase A determinista); la
   Fase B (LLM) es opcional y con fallback a reglas.

**Principio rector:** el Dashboard responde *"¿qué hago hoy?"*; el EIRS responde
*"¿qué ocurrió este mes, por qué, y qué hacemos el próximo?"*.

**Regla de oro heredada del Centro de Comando:** un solo cerebro, reglas
auditables, cero invención. Cada cifra de cada documento debe poder rastrearse
hasta una query.

---

## 1. Arquitectura completa del sistema

```
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 1 · HECHOS (server, solo lectura)                         │
│  report-facts.ts — reúne TODO el mes cerrado + históricos:      │
│  reusa las fuentes canónicas existentes (getMonthlyReport,      │
│  fixed-variable, budgets, receivables, liquidity, grupo,        │
│  decision-intelligence facts) + comparativos de 3-6 meses.      │
│  Salida: ReportFacts (JSON tipado, 100% numérico)               │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 2 · CEREBRO (lib pura, testeable sin BD)                  │
│  story-compiler.ts — responde las 11 preguntas del motor        │
│  (¿qué pasó? ¿por qué? ¿qué cambió? ¿riesgos? ¿oportunidades?   │
│  ¿qué pasa si no hacemos nada?...) usando REGLAS + el motor     │
│  de Decision Intelligence ya construido.                        │
│  narrative.ts — convierte conclusiones en prosa ejecutiva.      │
│  Salida: ReportStory (EL contrato único — ver §4)               │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 3 · RENDERERS (cliente, sin acceso a datos)               │
│  Reciben SOLO el ReportStory. No pueden calcular nada.          │
│    pdf-renderer.ts   (jsPDF — ya en el stack)                   │
│    pptx-renderer.ts  (pptxgenjs — nueva dep, cliente)           │
│    xlsx-renderer.ts  (exceljs — ya en el stack)                 │
│  design-system.ts    (marca Yayi's: #004C40/#098B5F, tipografía,│
│                       semáforos, header/footer, "Confidencial") │
│  charts.ts           (gráficos canvas propios: línea, barras,   │
│                       waterfall, gauge — deterministas, 0 deps) │
└─────────────────────────────────────────────────────────────────┘
```

**Por qué así:** la separación Hechos → Historia → Formato es lo que garantiza
"un cerebro, tres documentos". Los renderers son tontos a propósito.

---

## 2. Flujo de generación

1. Usuario: **Reportes → "Generar Reporte"** → modal: sede (Atelier/Fonavi/
   Centro/Grupo) + mes + formato (PDF/PPT/Excel/Todos).
2. Server action `getReportStory(scope, month)` → Facts → Compiler → Story
   (una sola llamada; ~2-4 s).
3. El navegador recibe el Story (JSON) y genera los documentos EN EL CLIENTE
   (sin infra nueva en Vercel, sin límites de serverless, sin costo).
4. Descarga: `Yayis-{Sede}-{Mes}-Reporte.pdf/.pptx/.xlsx`.
5. "Todos" = los tres archivos del MISMO Story en memoria → imposible que
   cuenten historias distintas.

Grupo Yayi's = Facts de los 3 negocios + sección comparativa entre sedes.

---

## 3. Motor de IA (la parte más importante)

**Decisión de arquitectura honesta — dos fases:**

**Fase A (el estándar): narrativa por reglas ricas.** El mismo enfoque del
Executive Brief pero a escala de reporte: un catálogo de conclusiones
(`narrative.ts`) donde cada regla produce párrafos ejecutivos parametrizados
con los hechos. Determinista, auditable, gratis, sin latencia, nunca alucina.
Con un catálogo amplio (≥40 reglas: crecimiento, mezcla de gastos, causas de
variación de margen, estacionalidad simple, presupuesto puntual vs
estructural…) la prosa es de nivel profesional.

**Fase B (opcional, después): pulido con LLM (Claude API).** SOLO redacta
sobre el Story ya calculado — nunca calcula ni agrega números. Con un
**verificador anti-alucinación**: toda cifra que aparezca en el texto generado
debe existir en el Story; si no, se rechaza y se usa la versión de reglas.
Coste ~céntimos/reporte (4-8 reportes/mes). Requiere API key.

**Mi recomendación: construir A completo primero.** Si la prosa te parece
suficiente (creo que sí), B nunca se necesita. Si quieres el toque final de
redacción, B se enchufa sin tocar nada más (misma entrada, misma
verificación).

Las 11 preguntas del motor se responden así (todas con datos existentes):
- *¿Qué pasó / qué cambió?* → mes vs mes anterior completo + vs promedio 3m.
- *¿Por qué?* → descomposición por categoría/concepto (motor de atribución
  ya construido para el dashboard, extendido a mes completo).
- *¿Tendencia?* → series de 3-6 meses por KPI.
- *¿Qué preocupa / mejoró?* → catálogo de riesgos/fortalezas por reglas
  (umbral + impacto en soles, como los insights del dashboard).
- *¿Qué pasa si no hacemos nada / si actuamos?* → proyecciones por ritmo
  real (motor de proyección + confianza ya construidos) y simulaciones
  (motor ¿Y si…? ya construido).

---

## 4. Arquitectura de documentos — el contrato `ReportStory`

```ts
ReportStory = {
  meta: { scope, businessName, month, monthLabel, generatedAt,
          healthScore, healthLevel, confidential: true }
  cover: { estado general en una frase }
  executiveSummary: {
    closing: string            // cómo terminó el mes (prosa)
    topAchievement: Finding    // mayor logro
    topProblem: Finding        // mayor problema
    topRisk: Finding           // principal riesgo
    topOpportunity: Finding    // principal oportunidad
    keyDecisions: Decision[3]  // las 3 decisiones del próximo mes
  }
  scorecard: KPI[]             // valor, semáforo, variación, comentario
  monthAnalysis: Paragraph[]   // qué/por qué/responsables/sorpresas/vigilar
  strengths: Finding[]         // logros, no KPIs repetidos
  risks: Risk[]                // impacto S/, gravedad, consecuencia, mitigación
  profitability: { ingresos, egresos, ebitda, margen, comparativos,
                   series[6m], narrative }
  budget: { porCategoria[], excesoTotal, puntualVsEstructural, narrative }
  opportunities: Opportunity[] // impacto S/, prioridad, facilidad, tiempo
  projections: { conservador, esperado, optimista, confianza, supuestos }
  actionPlan: Action[≤5]       // qué, por qué, impacto S/, responsable, tiempo
  annexes: { movimientos, topGastos, presupuestoDetalle, conciliacion }
}
```

- **Finding/Risk/Opportunity/Action** llevan siempre: texto ejecutivo +
  impacto en soles + fuente (qué regla/datos lo produjeron) → auditabilidad.
- Toda sección tiene su prosa YA ESCRITA en el Story. Los renderers solo
  maquetan.

**Proyecciones (auditable, sin magia):** esperado = ritmo real 8 semanas
(motor existente); conservador/optimista = peor/mejor ritmo mensual de los
últimos 3 meses; confianza = motor existente (14d vs 8w). Los supuestos se
imprimen en la página ("basado en…").

**Oportunidades — honestidad con los datos:** el detector propone solo lo que
los datos sustentan: categorías sobre su promedio (reducir), CxC (cobrar),
presupuesto excedido (frenar), top gastos fijos (marcados "a evaluar:
renegociación" — el sistema no sabe tu contrato de alquiler, y no finge
saberlo).

---

## 5. Diseño de clases / módulos

```
ReportFacts        (tipo)   — números crudos del mes + históricos
StoryCompiler      (puro)   — compileStory(facts): ReportStory
NarrativeCatalog   (puro)   — reglas de prosa: (facts) => Paragraph|null
RiskDetector       (puro)   — catálogo de riesgos con impacto/mitigación
OpportunityDetector(puro)   — ídem oportunidades
ProjectionEngine   (puro)   — 3 escenarios + confianza (reusa liquidity.ts)
SectionRegistry    (const)  — lista ordenada de secciones; cada una declara
                              cómo renderizarse en cada formato (ver §7)
PdfRenderer / PptxRenderer / XlsxRenderer — render(story): Blob
DesignSystem       (const)  — tokens de marca compartidos por los 3
ChartFactory       (puro)   — chart spec → imagen canvas (PDF/PPT) o
                              datos nativos (Excel)
```

Todo lo "puro" se testea sin BD, igual que decision-intelligence (251 tests
de precedente).

---

## 6. Estructura de carpetas

```
src/lib/report/
  types.ts              # ReportFacts + ReportStory (el contrato)
  story-compiler.ts     # cerebro
  narrative.ts          # catálogo de prosa por reglas
  detectors/
    risks.ts
    opportunities.ts
    strengths.ts
  projections.ts
  sections.ts           # SectionRegistry (orden + presencia por formato)
  renderers/
    design-system.ts
    charts.ts
    pdf.ts
    pptx.ts
    xlsx.ts
  __tests__/            # tests del cerebro y de coherencia entre formatos
src/app/actions/report-facts.ts   # queries (server)
src/app/[negocio]/reportes/generar/  # UI: modal Generar Reporte
```

---

## 7. Componentes reutilizables + motor de plantillas

**SectionRegistry** — el patrón clave de escalabilidad:

```ts
Section = {
  id: "executive-summary",
  storyKey: "executiveSummary",
  pdf:  (doc, story) => …,   // página(s)
  pptx: (deck, story) => …,  // slide (o null si no va en PPT)
  xlsx: (wb, story) => …,    // hoja (o null)
}
```

Agregar una sección nueva = 1 entrada en el registro. Quitar una del PPT =
poner `pptx: null`. El orden del array ES el orden del documento.

**Motor de plantillas de prosa:** las reglas de `narrative.ts` producen
`Paragraph { text, tone, source }` con composición (conectores, orden por
impacto, variación de arranques de frase para no sonar robótico). Sin
plantillas de documento rellenables — plantillas de *conclusión*.

**Reuso del código existente:** Health Score, insights, proyección,
confianza, simulaciones, atribución por categoría → ya construidos y
testeados. El EIRS los importa, no los duplica.

---

## 8-11. Estrategia por formato

| | PDF Ejecutivo | PowerPoint | Excel Gerencial |
|---|---|---|---|
| **Librería** | jsPDF + autotable (ya en el stack, probado en el reporte para socia) | pptxgenjs (nueva dep, cliente, madura) | exceljs (ya en el stack) |
| **Rol** | LEER: 11 páginas, prosa completa | PRESENTAR: ≤10 slides, 1 pregunta/slide, gráfico grande + 1 frase | ANALIZAR: todo el detalle |
| **Contenido del Story** | Todas las secciones | Solo: portada, cómo terminó, qué cambió, qué preocupa, qué hacemos, próximo mes, conclusiones | Hojas: Resumen, KPIs, Ingresos, Egresos, Presupuesto, Conciliación, Proyecciones, Base de datos |
| **Gráficos** | Imágenes canvas (ChartFactory) | Mismas imágenes, tamaño slide | Datos nativos + formato condicional (semáforos reales de Excel) |
| **Marca** | DesignSystem (portada, header/footer, "Confidencial", paleta #004C40) | Mismo DesignSystem | Mismo DesignSystem (colores de celda, cabeceras) |

El PPT **no copia el PDF**: el registro marca qué secciones van a slides y el
compiler genera para cada una su versión "titular + 1 dato + 1 frase".

---

## 12. Garantía de "misma historia en los tres"

1. **Arquitectónica:** los renderers reciben SOLO el Story; no tienen acceso a
   BD ni a las libs de cálculo (se valida con un test de imports).
2. **De contrato:** el Story se compila UNA vez por generación; "Todos" usa
   la misma instancia en memoria.
3. **De tests:** test de coherencia — para un Story fixture, se verifica que
   las cifras clave (EBITDA, liquidez, top riesgo, acción #1) aparecen
   idénticas en los tres outputs.
4. **De trazabilidad:** cada Finding lleva `source`; el anexo del PDF y la
   hoja "Base de datos" del Excel permiten auditar cualquier frase.

---

## 13. Escalabilidad

- **Nueva sede** → cero código (el recolector ya es multi-negocio).
- **Nuevo formato** (Word, email mensual) → 1 renderer nuevo sobre el mismo Story.
- **Nueva sección** → 1 entrada en SectionRegistry + su regla de prosa + test.
- **Nueva regla de análisis** → 1 función en el catálogo + test (patrón ya
  probado con las 12 reglas del dashboard).
- **Capa LLM (Fase B)** → reemplaza solo `narrative.ts` manteniendo el
  verificador; nada más cambia.

---

## Plan de entrega (PRs, como siempre: staging → tu merge)

1. **PR 1 — El cerebro:** types + facts + compiler + catálogo de narrativa +
   detectores + proyecciones. Tests exhaustivos. (Sin UI aún: se valida con
   un Story real impreso en texto.)
2. **PR 2 — PDF + UI:** modal "Generar Reporte" + renderer PDF completo con
   design system y gráficos.
3. **PR 3 — PPT + Excel:** los otros dos renderers + test de coherencia.
4. **PR 4 (opcional) — Capa LLM** con verificación anti-alucinación.

Sin migraciones de base de datos en ninguna fase. Todo solo lectura.
