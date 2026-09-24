/**
 * Costo y precio de carta de cada producto de las cafeterías · MOTOR (puro).
 *
 * Fuente: la hoja PRICING del Excel maestro de pricing (columnas "Costo para
 * cafetería" y "Precio público carta"), que Jahnn sube en Grupo → Recetas y
 * costos. Decisión de Jahnn (24-sep-2026): la rentabilidad de "Candidatos a
 * reemplazo" sale de ahí; los costos viejos del sistema (julio) cubrían solo
 * el 48% de lo vendido.
 *
 * Byte y el Excel no escriben igual los nombres ("POLLO CON PIÑA GRILL" vs
 * "Sánguche de Pollo con Piña al Grill"). El enlace compara PALABRAS: quita
 * tildes, plurales y palabras de relleno ("de", "sánguche", "yayi's") y exige
 * que todas las palabras del nombre más corto estén en el otro. Lo que no
 * enlaza solo, Jahnn lo vincula a mano (carta_vinculos).
 */

export type CostoCarta = {
  /** ID de PRICING (CF-011, AT-046…). */
  ref: string;
  nombre: string;
  nombreCarta: string | null;
  categoria: string | null;
  /** Lo que le cuesta a la cafetería una unidad (receta propia o precio interno de Atelier). */
  costo: number;
  /** Precio de carta; null si no se vende al público. */
  precio: number | null;
};

const RELLENO = new Set([
  "de", "del", "con", "y", "la", "el", "los", "las", "al", "a", "en", "x",
  "sanguche", "sandwich", "sanguches", "yayis", "yayi", "s", "g", "gr", "und", "unidad", "unidades",
  "promo", "mostrador",
]);

const SINONIMOS: Record<string, string> = {
  entera: "entero", porcion: "porcion", porciones: "porcion",
  cheesburguer: "cheeseburger", cheesburger: "cheeseburger", capresse: "caprese",
  cheescake: "cheesecake", fresas: "fresa", arandanos: "arandano", frutas: "fruta",
  mocaccino: "moccaccino", mocachino: "moccaccino",
  img: "integral multigrano", // así abrevia el Excel el pan integral multigrano
  torta: "", roll: "rollo", ahumado: "",
};

export function palabras(nombre: string): string[] {
  const t = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'´`]/g, "").replace(/(\d)\s*(g|gr|kg|ml)\b/g, "$1$2")
    .replace(/[^a-z0-9ñ]+/g, " ");
  const out: string[] = [];
  for (let w of t.split(" ").flatMap((x) => (x in SINONIMOS ? SINONIMOS[x].split(" ") : [x]))) {
    if (!w || RELLENO.has(w)) continue;
    if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1); // plural simple
    out.push(w);
  }
  return [...new Set(out)];
}

/** 0 a 1: qué tanto se parecen dos nombres por sus palabras. */
export function parecido(a: string, b: string): number {
  const A = palabras(a), B = palabras(b);
  if (A.length === 0 || B.length === 0) return 0;
  const comunes = A.filter((w) => B.includes(w)).length;
  const corto = Math.min(A.length, B.length);
  // Todas las palabras del más corto en el otro = mismo producto dicho más
  // largo, siempre que no sea una sola palabra suelta dentro de un nombre
  // largo ("pan" no es "Pan Integral Multigrano 550 g").
  if (comunes === corto && comunes / Math.max(A.length, B.length) >= 0.5) return 0.8 + 0.2 * (comunes / Math.max(A.length, B.length));
  return comunes / new Set([...A, ...B]).size;
}

const UMBRAL = 0.8;

/**
 * El costo de un producto de Byte: primero el vínculo manual, si no el
 * nombre más parecido (si es claramente el mejor). null = sin costo conocido.
 */
export function enlazarCosto(
  nombreByte: string,
  lista: CostoCarta[],
  vinculos: Map<string, string>,
  /** Precio promedio al que Byte lo vendió: un enlace por nombre con un precio de carta muy distinto se descarta. */
  precioByte?: number | null,
): { item: CostoCarta; como: "manual" | "nombre" } | null {
  const manual = vinculos.get(claveByte(nombreByte));
  if (manual) {
    const item = lista.find((i) => i.ref === manual);
    if (item) return { item, como: "manual" };
  }
  // "LATTE: LECHE DESLACTOSADA" (S/14) no es "Leche deslactosada" (S/1, el
  // adicional) ni "CAFÉ PASADO BOTELLA" (S/10) es el "Café Pasado" de taza
  // (S/7): si los precios difieren en más de 28%, el parecido de nombre
  // engaña. Las promos de mostrador (empanada a S/6 en vez de S/8) sí pasan.
  const precioCalza = (i: CostoCarta) =>
    !precioByte || !i.precio || Math.abs(precioByte - i.precio) / Math.max(precioByte, i.precio) <= 0.28;
  const puntuados = lista
    .filter(precioCalza)
    .map((i) => ({ i, p: Math.max(parecido(nombreByte, i.nombre), i.nombreCarta ? parecido(nombreByte, i.nombreCarta) : 0) }))
    .filter((x) => x.p >= UMBRAL)
    .sort((a, b) => b.p - a.p);
  if (puntuados.length === 0) return null;
  const top = puntuados.filter((x) => Math.abs(x.p - puntuados[0].p) < 1e-9);
  // Empate: gana el que se vende en carta ("Sánguche de Pavo" antes que el
  // "Pavo" por kg que Atelier le vende a la cocina).
  const conPrecio = top.filter((x) => x.i.precio !== null);
  const elegibles = conPrecio.length > 0 ? conPrecio : top;
  return elegibles.length === 1 ? { item: elegibles[0].i, como: "nombre" } : null;
}

export const claveByte = (nombre: string) => palabras(nombre).sort().join(" ");
