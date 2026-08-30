/**
 * Variantes mal escritas de una categoría → su nombre correcto.
 *
 * Pedido de Jahnn (27-ago-2026), revisando por qué el punto de
 * equilibrio de Centro no cuadraba: "hay categorías como cocina, G,
 * insumos que se repiten, escritos con mayúscula y minúscula, limpieza
 * mal escrito… quiero resolverlo, y también darle el mensaje a Kellyta,
 * ya que ella me seguirá enviando Excel y posiblemente no cambie estas
 * categorías".
 *
 * Esa última frase es la razón de este archivo. A Kelly se le pidió
 * escribir consistente, pero el arreglo NO puede depender de que ella
 * cambie una costumbre: cada vez que escribe "PACKAGIN" en vez de
 * "PACKAGING", el sistema creaba una categoría nueva y el gasto quedaba
 * partido en dos líneas que deberían ser una. Acá se corrige al entrar.
 *
 * ─── Qué NO hace ───
 *
 * No adivina. Solo traduce las variantes CONCRETAS que aparecieron en
 * los Excels reales de las tres sedes. Una categoría nueva que Kelly
 * invente mañana entra tal cual y se ve en Configuración — que es lo
 * correcto: inventar equivalencias por parecido terminaría metiendo
 * gastos en la categoría equivocada, que es peor que tener una línea de
 * más.
 *
 * Las diferencias de MAYÚSCULA/minúscula no van acá: de eso ya se
 * encarga `normalizeCategory`. Acá van los errores de tipeo, las tildes
 * invertidas y los singulares/plurales, que para el sistema son nombres
 * distintos por más que se lean igual.
 */

/** Variante (en minúscula, sin tildes) → nombre correcto. */
const ALIAS: Record<string, string> = {
  // Errores de tipeo vistos en los Excels de Centro y Fonavi
  packagin: "PACKAGING",
  // La tilde invertida: "REMODELACIÒN" en vez de "REMODELACIÓN". Se ve
  // casi igual pero son nombres distintos. `clave()` quita las tildes,
  // así que esta entrada captura las dos formas y las deja en una.
  remodelacion: "REMODELACIÓN",
  mantieniento: "MANTENIMIENTO",
  manteniento: "MANTENIMIENTO",
  mantenimientos: "MANTENIMIENTO",
  limipeza: "LIMPIEZA",
  marketink: "MARKETING",

  // Singular / plural del mismo concepto
  servicio: "SERVICIOS",
  auspicio: "AUSPICIOS",
  flete: "SS GENERALES",
  fletes: "SS GENERALES",
  delivers: "DELIVERY",
  deliverys: "DELIVERY",

  // Decisión de Jahnn (27-ago-2026): son la misma compra a Atelier.
  productos: "PRODUCTOS ATELIER",

  // Absorciones aprobadas: categorías de un solo uso que no merecen
  // línea propia en el reporte.
  cocina: "VAJILLA",
  proveedor: "CAJA CHICA",
  medicina: "OTROS",
  bono: "PLANILLA",

  // "FONDOS MUTUOS" contenía un flete de bases de torta — nada que ver
  // con fondos mutuos, y estaba marcada como no operativa, así que ese
  // gasto real no contaba. Va a DELIVERY, que es lo que era.
  "fondos mutuos": "DELIVERY",

  // Basura del Excel: la letra de la columna "Ing./Gsto." se coló en la
  // columna de categoría. Su concepto decía "(PRODUCTOS)".
  g: "PRODUCTOS ATELIER",

  // Filas que Kelly dejó sin grupo.
  "sin categoria": "OTROS",
  desconocido: "OTROS",

  // ─── Ampliación del 30-ago-2026: Atelier y Fonavi ───────────────
  //
  // Hasta acá el diccionario solo cubría lo visto en Centro. Al abrirlo a
  // las tres sedes aparecieron estas.

  // Financiamiento. Jahnn (30-ago-2026): las cuotas de préstamos y
  // tarjetas no son costo de operar, son cómo se financia el negocio —
  // van a su propio grupo y no ensucian el punto de equilibrio.
  // OJO: "PRESTAMO ATELIER" NO entra acá. Eso es una sede prestándole a
  // otra, no financiamiento del negocio, y tiene su propia categoría.
  prestamo: "FINANCIAMIENTO",
  prestamos: "FINANCIAMIENTO",

  // Mismo concepto, otro nombre.
  "utiles escritorio": "OFICINA",
  "utiles de escritorio": "OFICINA",
  enseres: "VAJILLA",
  sunat: "IMPUESTOS",
  ahorros: "AHORRO",

  // La caja chica de Luis (administrador de Atelier) es caja chica.
  "caja chica - luis": "CAJA CHICA",

  // El mismo nombre, escrito largo o corto.
  "servicios generales": "SS GENERALES",
  "servicios bancarios": "SS BANCARIOS",
  "servicios contables": "SS CONTABLES",

  // Lo que ya describe la categoría del catálogo: SS GENERALES incluye
  // uniformes, PERSONAL incluye capacitación, VAJILLA incluye utensilios.
  uniformes: "SS GENERALES",
  publicidad: "MARKETING",
  utencillos: "VAJILLA",
  utensilios: "VAJILLA",
  capacitaciones: "PERSONAL",
  capacitacion: "PERSONAL",
  "reclutamiento y seleccion": "PERSONAL",
  "equipos y utensilios de produccion": "EQUIPOS",
  "software y suscripciones": "SOFTWARE",
  suscripciones: "SOFTWARE",

  // Ya tienen su propio mecanismo en el sistema; el catálogo solo se
  // pone de acuerdo con los flags.
  "prestamos del socio": "PRESTAMOS SOCIO",
  "prestamo del socio": "PRESTAMOS SOCIO",
};

/** Quita tildes y baja a minúscula, para que "REMODELACIÒN" y "Remodelación" lleguen igual. */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * El nombre correcto de una categoría. Si no es una variante conocida,
 * devuelve el nombre tal como vino (sin los espacios de sobra).
 */
export function categoriaCanonica(nombre: string | null | undefined): string {
  const original = String(nombre ?? "").trim();
  if (!original) return original;
  return ALIAS[clave(original)] ?? original;
}

/**
 * true si al importar este nombre va a CAMBIAR.
 *
 * Se compara con el resultado, no con la presencia en el mapa: algunas
 * entradas apuntan a sí mismas una vez sin tildes ("remodelacion" →
 * "REMODELACIÓN"), y esas no son un cambio que haya que reportarle a
 * nadie cuando el nombre ya venía bien escrito.
 */
export function esVarianteConocida(nombre: string | null | undefined): boolean {
  const original = String(nombre ?? "").trim();
  if (!original) return false;
  return categoriaCanonica(original) !== original;
}

/** Todas las traducciones, para poder mostrarlas en pantalla o auditarlas. */
export function listaDeAlias(): { variante: string; correcta: string }[] {
  return Object.entries(ALIAS).map(([variante, correcta]) => ({ variante, correcta }));
}
