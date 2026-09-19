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
  // ─── Lista única del 19-sep-2026 (lib/reglas-gasto.ts) ───────────
  // Los nombres de la lista anterior y los que Kelly escribía, llevados a
  // la lista nueva. Los BOLSONES (OTROS, SS GENERALES, FONDOS MUTUOS,
  // PENDIENTE…) NO están acá a propósito: ahí adentro hay de todo, así que
  // cada gasto se clasifica por su concepto (ver `esGrupoBolson`).

  // Errores de tipeo y singulares/plurales vistos en los Excels
  packagin: "PACKAGING", packagins: "PACKAGING",
  remodelacion: "REMODELACIÓN",
  mantieniento: "MANTENIMIENTO", manteniento: "MANTENIMIENTO", mantenimientos: "MANTENIMIENTO",
  limipeza: "LIMPIEZA",
  marketink: "MARKETING",
  servicio: "SERVICIOS",
  delivery: "DELIVERY Y FLETES", delivers: "DELIVERY Y FLETES", deliverys: "DELIVERY Y FLETES",
  flete: "DELIVERY Y FLETES", fletes: "DELIVERY Y FLETES",

  // Compras a Atelier (decisión de Jahnn, 27-ago-2026)
  productos: "PRODUCTOS ATELIER",

  // Juntas en una sola (19-sep-2026)
  vajilla: "MENAJE Y UTENSILIOS", cocina: "MENAJE Y UTENSILIOS", utencillos: "MENAJE Y UTENSILIOS",
  utensilios: "MENAJE Y UTENSILIOS", enseres: "MENAJE Y UTENSILIOS", "accesorios atelier": "MENAJE Y UTENSILIOS",
  auspicio: "MARKETING", auspicios: "MARKETING", publicidad: "MARKETING", decoracion: "MARKETING",
  oficina: "OFICINA Y SISTEMAS", software: "OFICINA Y SISTEMAS", sistemas: "OFICINA Y SISTEMAS",
  "utiles escritorio": "OFICINA Y SISTEMAS", "utiles de escritorio": "OFICINA Y SISTEMAS",
  "software y suscripciones": "OFICINA Y SISTEMAS", suscripciones: "OFICINA Y SISTEMAS",
  contabilidad: "CONTABILIDAD Y ASESORÍAS", "ss contables": "CONTABILIDAD Y ASESORÍAS", "servicios contables": "CONTABILIDAD Y ASESORÍAS",
  consultoria: "CONTABILIDAD Y ASESORÍAS", asesoria: "CONTABILIDAD Y ASESORÍAS",
  personal: "PERSONAL", uniformes: "PERSONAL", capacitacion: "PERSONAL", capacitaciones: "PERSONAL", entrenamiento: "PERSONAL",
  "reclutamiento y seleccion": "PERSONAL", medicina: "PERSONAL", "beneficios al personal": "PERSONAL",
  bono: "PLANILLA",
  "servicios bancarios": "SS BANCARIOS",
  sunat: "IMPUESTOS", ir: "IMPUESTOS",
  equipo: "EQUIPOS", "equipos y utensilios de produccion": "EQUIPOS",
  seguros: "SERVICIOS",
  "caja chica - luis": "CAJA CHICA", "falta rendir": "CAJA CHICA", proveedor: "CAJA CHICA",

  // Plata que no es costo de operar
  financiamiento: "PRÉSTAMOS Y TARJETAS", prestamo: "PRÉSTAMOS Y TARJETAS", prestamos: "PRÉSTAMOS Y TARJETAS",
  "prestamo diners": "PRÉSTAMOS Y TARJETAS",
  // "DEUDA" queda fuera a propósito (ago-2026 fue una devolución): si
  // vuelve, se clasifica por el concepto o se pregunta.
  "prestamo atelier": "PRÉSTAMOS ENTRE SEDES",
  utilidades: "UTILIDADES A SOCIOS", "utilidades 2025": "UTILIDADES A SOCIOS", socios: "UTILIDADES A SOCIOS",
  ahorros: "AHORRO",
  "vueltos y devoluciones": "DEVOLUCIONES", "devoluciones / regularizaciones": "DEVOLUCIONES", "devoluciones fonavi, centro": "DEVOLUCIONES", "devoluciones fonavi centro": "DEVOLUCIONES",

  // Ya tienen su propio mecanismo en el sistema
  "prestamos del socio": "PRESTAMOS SOCIO", "prestamo del socio": "PRESTAMOS SOCIO",
  "transferencias internas": "TRANSFERENCIA INTERNA",
};

/**
 * Grupos que son BOLSONES: ahí Kelly metió cosas de todo tipo (en FONDOS
 * MUTUOS había azúcar y bases para torta; en SS GENERALES uniformes,
 * extintores y cartas). Un gasto con uno de estos grupos se clasifica por su
 * concepto con las reglas de lib/reglas-gasto.ts, no por el grupo.
 */
const BOLSONES = new Set([
  "otros", "ss generales", "servicios generales", "fondos mutuos", "pendiente", "grupo", "g", "dcto",
  "adminitrativo", "administrativo", "gtos operativos", "sin categoria", "desconocido", "por aclarar", "prestamos socio",
]);

export function esGrupoBolson(nombre: string | null | undefined): boolean {
  const k = clave(String(nombre ?? ""));
  return k === "" || BOLSONES.has(k);
}

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
