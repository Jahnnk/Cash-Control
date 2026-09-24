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
    .replace(/[’'´`]/g, "")
    // Pesos escritos igual: "750 g" = "750g" = "750"; "1 kg" = "1kg" = "1000".
    .replace(/(\d+(?:[.,]\d+)?)\s*kg\b/g, (_, n: string) => String(Math.round(Number(n.replace(",", ".")) * 1000)))
    .replace(/(\d+)\s*(g|gr)\b/g, "$1")
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
 * Parecido pesado por lo DISTINTIVO de cada palabra en la lista: "semilla"
 * aparece en dos productos y pesa mucho; "pan", "tipo", "molde" aparecen en
 * muchos y pesan poco. Desempata entre los que ya pasaron el umbral: "PAN DE
 * SEMILLAS TIPO MOLDE 1KG" es el "Pan de Semillas 1 Kg", no el "Pan con Pan
 * tipo Molde 1 kg" (que comparte más palabras, pero comunes).
 */
function parecidoPesado(a: string, b: string, peso: (w: string) => number): number {
  const A = palabras(a), B = palabras(b);
  const union = [...new Set([...A, ...B])];
  const total = union.reduce((s, w) => s + peso(w), 0);
  return total > 0 ? A.filter((w) => B.includes(w)).reduce((s, w) => s + peso(w), 0) / total : 0;
}

/**
 * Palabras de FORMATO (cómo viene, no qué es): pesan poco al desempatar.
 * "Pan de Semillas tipo molde" es ante todo pan de SEMILLAS.
 */
const FORMATO = new Set(["tipo", "molde", "normal", "ovalado", "grande", "bolsa", "pack", "entero", "porcion", "clasico"]);

function pesosDe(lista: CostoCarta[]): (w: string) => number {
  const df = new Map<string, number>();
  for (const i of lista) {
    for (const w of new Set([...palabras(i.nombre), ...(i.nombreCarta ? palabras(i.nombreCarta) : [])])) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const n = Math.max(1, lista.length);
  return (w) => (FORMATO.has(w) || /^\d/.test(w) ? 0.3 : Math.log(1 + n / (df.get(w) ?? 1)));
}

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
  const peso = pesosDe(lista);
  const puntuados = lista
    .filter(precioCalza)
    .map((i) => ({
      i,
      p: Math.max(parecido(nombreByte, i.nombre), i.nombreCarta ? parecido(nombreByte, i.nombreCarta) : 0),
      // Desempates, en orden: lo distintivo de las palabras; el nombre
      // principal del Excel (si dos dicen "Jugo de Piña" en carta, gana el
      // que SE LLAMA Jugo de Piña); que se venda en carta ("Sánguche de Pavo"
      // antes que el "Pavo" por kg que Atelier le vende a la cocina).
      d: Math.max(parecidoPesado(nombreByte, i.nombre, peso), i.nombreCarta ? parecidoPesado(nombreByte, i.nombreCarta, peso) : 0),
      m: parecido(nombreByte, i.nombre),
      c: i.precio !== null ? 1 : 0,
    }))
    .filter((x) => x.p >= UMBRAL)
    .sort((a, b) => b.d - a.d || b.m - a.m || b.c - a.c || b.p - a.p);
  if (puntuados.length === 0) return null;
  const [primero, segundo] = puntuados;
  const igual = (x: typeof primero, y: typeof primero) =>
    Math.abs(x.d - y.d) < 1e-9 && Math.abs(x.m - y.m) < 1e-9 && x.c === y.c && Math.abs(x.p - y.p) < 1e-9;
  return segundo && igual(primero, segundo) ? null : { item: primero.i, como: "nombre" };
}

export const claveByte = (nombre: string) => palabras(nombre).sort().join(" ");
