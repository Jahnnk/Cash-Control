/**
 * Cruce Atelier → cafeterías → mermas (pedido de Jahnn, 13-nov-2026). Lógica pura.
 *
 * «Atelier vendió 73 brownies veganos en octubre; Centro vendió 22 al público y Fonavi 44. Salieron 73 y se vendieron 66:
 * los 7 que faltan deberían estar en las mermas de las cafeterías.» Para cada producto que Atelier vende a las
 * cafeterías (líneas «Y-» de su reporte de productos):
 *
 *     sin explicar = salió de Atelier − vendido en Fonavi − vendido en Centro − mermas de Fonavi − mermas de Centro
 *
 * Qué se cruza y qué no (se dice en pantalla, nunca se adivina):
 *   · SE CRUZA lo que se vende tal cual, unidad por unidad: el mismo nombre en Atelier (sin «Y-») y en la cafetería.
 *     «de», «con»… no cuentan: «COOKIE DE ALMENDRA CON MANJAR» = «COOKIE ALMENDRA CON MANJAR».
 *   · NO se cruza lo que sale ENTERO y se vende en porciones (falta saber cuántas porciones da cada entero) ni lo que es
 *     insumo de cocina (pan de molde para sánguches, bases, mermeladas): la cafetería no lo vende con ese nombre.
 *   · Tampoco se cruza lo que la cafetería vende poco con ese nombre (menos de la mitad de lo que salió, contando
 *     mermas): casi todo se usa en cocina (focaccia para sánguches) o se vende con otro nombre.
 *   · Atelier no separa Fonavi de Centro en su reporte: el cruce es de las dos cafeterías juntas.
 *   · Las mermas las escribe el administrador a mano («empanada vegetaria»): se emparejan por palabras y, si hay duda,
 *     quedan en «mermas sin emparejar» en vez de cargarse a un producto equivocado.
 */

export type LineaVenta = { nombre: string; unidades: number; ingresos: number };
export type LineaMerma = { sedeId: number; producto: string; cantidad: number; unidad: string | null };

export const FONAVI = 2, CENTRO = 3;
/** Cuadra si lo que falta no pasa de 2 unidades ni del 3% de lo que salió. */
export const TOLERANCIA_UNIDADES = 2;
export const TOLERANCIA_PCT = 3;
/** Si la cafetería vendió y mermó menos de esta parte de lo que salió, casi todo se usa en cocina o se vende con otro nombre: no se cruza. */
export const MINIMO_VENTA_DIRECTA_PCT = 50;

const VACIAS = new Set(["DE", "DEL", "CON", "LA", "EL", "LOS", "LAS", "Y", "EN", "A"]);
const ELIMINADO = /^\s*\[[^\]]*\]\s*/;
const PREFIJO_Y = /^Y\s*-\s*/;
const ENTERO = /\bENTER[AO]S?\b/;
const PESO = /^(kg|g|gr|grs|gramos|lt|l|ml|kilo|kilos)$/i;

const limpiar = (s: string) => s.replace(ELIMINADO, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9/ -]/g, " ").replace(/\s+/g, " ").trim();
/** Las palabras que identifican al producto (sin «de», «con»…). */
export function palabras(nombre: string): string[] {
  return limpiar(nombre).replace(PREFIJO_Y, "").split(/[\s-]+/).filter((w) => w && !VACIAS.has(w));
}
export const clave = (nombre: string) => palabras(nombre).join(" ");
/** ¿La línea de Atelier es una venta a las cafeterías? */
export const esParaCafeterias = (nombre: string) => PREFIJO_Y.test(limpiar(nombre));

export type EstadoCruce = "cuadra" | "falta" | "sobra";

export type FilaCruce = {
  clave: string;
  nombre: string;
  /** Unidades que Atelier vendió a las cafeterías y a qué precio interno promedio. */
  salio: number;
  precioInterno: number;
  vendido: { fonavi: number; centro: number };
  mermas: { fonavi: number; centro: number };
  /** Cómo escribió el administrador las mermas que se cargaron a este producto. */
  mermasComo: string[];
  /** salió − vendido − mermas. Positivo = falta explicar; negativo = se vendió más de lo que salió. */
  sinExplicar: number;
  /** Lo que falta explicar, a precio interno (0 si no falta). */
  valor: number;
  estado: EstadoCruce;
};

export type MotivoSinCruce = "entero" | "sin-pareja" | "poca-venta";
export type SinCruce = { nombre: string; salio: number; motivo: MotivoSinCruce };

export type Cruce = {
  filas: FilaCruce[];
  sinCruce: SinCruce[];
  /** Mermas en unidades de las cafeterías que no se pudieron cargar a un producto del cruce. */
  mermasSinEmparejar: { sedeId: number; producto: string; cantidad: number }[];
  totales: { salio: number; vendido: number; mermas: number; falta: number; valorFalta: number; productosConFalta: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const compatibles = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** A qué producto del cruce pertenece una merma escrita a mano (null = ninguno o más de uno). */
export function emparejarMerma(producto: string, claves: string[]): string | null {
  const m = palabras(producto);
  if (m.length === 0) return null;
  const candidatas = claves.filter((c) => { const f = c.split(" "); return m.every((w) => f.some((x) => compatibles(w, x))); });
  const exactas = candidatas.filter((c) => c.split(" ").length === m.length);
  if (exactas.length === 1) return exactas[0];
  return exactas.length === 0 && candidatas.length === 1 ? candidatas[0] : null;
}

function estadoDe(sinExplicar: number, salio: number): EstadoCruce {
  const tolerancia = Math.max(TOLERANCIA_UNIDADES, salio * (TOLERANCIA_PCT / 100));
  return Math.abs(sinExplicar) <= tolerancia ? "cuadra" : sinExplicar > 0 ? "falta" : "sobra";
}

export function cruzar(e: { atelier: LineaVenta[]; fonavi: LineaVenta[]; centro: LineaVenta[]; mermas: LineaMerma[] }): Cruce {
  const sumar = (lineas: LineaVenta[]) => {
    const m = new Map<string, number>();
    for (const l of lineas) { const k = clave(l.nombre); if (k) m.set(k, (m.get(k) ?? 0) + l.unidades); }
    return m;
  };
  const fonavi = sumar(e.fonavi), centro = sumar(e.centro);
  // Lo que salió de Atelier a las cafeterías, por producto.
  const salidas = new Map<string, { nombre: string; u: number; r: number }>();
  for (const l of e.atelier) {
    if (!esParaCafeterias(l.nombre)) continue;
    const k = clave(l.nombre);
    const s = salidas.get(k) ?? { nombre: l.nombre.replace(ELIMINADO, "").replace(/^\s*Y\s*-\s*/i, "").trim(), u: 0, r: 0 };
    s.u += l.unidades; s.r += l.ingresos; salidas.set(k, s);
  }
  const filas: FilaCruce[] = [], sinCruce: SinCruce[] = [];
  for (const [k, s] of salidas) {
    if (s.u <= 0) continue;
    const enCafeterias = fonavi.has(k) || centro.has(k);
    if (ENTERO.test(k) || !enCafeterias) { sinCruce.push({ nombre: s.nombre, salio: s.u, motivo: ENTERO.test(k) ? "entero" : "sin-pareja" }); continue; }
    filas.push({ clave: k, nombre: s.nombre, salio: s.u, precioInterno: r2(s.r / s.u), vendido: { fonavi: fonavi.get(k) ?? 0, centro: centro.get(k) ?? 0 }, mermas: { fonavi: 0, centro: 0 }, mermasComo: [], sinExplicar: 0, valor: 0, estado: "cuadra" });
  }
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const claves = [...porClave.keys()];
  const mermasSinEmparejar: Cruce["mermasSinEmparejar"] = [];
  for (const m of e.mermas) {
    if ((m.sedeId !== FONAVI && m.sedeId !== CENTRO) || m.cantidad <= 0 || (m.unidad && PESO.test(m.unidad.trim()))) continue;
    const k = emparejarMerma(m.producto, claves);
    if (!k) { mermasSinEmparejar.push({ sedeId: m.sedeId, producto: m.producto.trim(), cantidad: m.cantidad }); continue; }
    const f = porClave.get(k)!;
    if (m.sedeId === FONAVI) f.mermas.fonavi += m.cantidad; else f.mermas.centro += m.cantidad;
    if (!f.mermasComo.includes(m.producto.trim())) f.mermasComo.push(m.producto.trim());
  }
  // Lo que casi no se vende con ese nombre sale del cruce (y sus mermas no cuentan en los totales del cruce).
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    const explicado = f.vendido.fonavi + f.vendido.centro + f.mermas.fonavi + f.mermas.centro;
    if (explicado < f.salio * (MINIMO_VENTA_DIRECTA_PCT / 100)) { sinCruce.push({ nombre: f.nombre, salio: f.salio, motivo: "poca-venta" }); filas.splice(i, 1); }
  }
  for (const f of filas) {
    f.sinExplicar = r2(f.salio - f.vendido.fonavi - f.vendido.centro - f.mermas.fonavi - f.mermas.centro);
    f.estado = estadoDe(f.sinExplicar, f.salio);
    f.valor = f.estado === "falta" ? r2(f.sinExplicar * f.precioInterno) : 0;
  }
  // Primero lo que falta explicar (lo más caro arriba), luego lo que sobra, al final lo que cuadra.
  const orden: Record<EstadoCruce, number> = { falta: 0, sobra: 1, cuadra: 2 };
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || b.valor - a.valor || Math.abs(b.sinExplicar) - Math.abs(a.sinExplicar) || b.salio - a.salio);
  sinCruce.sort((a, b) => b.salio - a.salio);
  const conFalta = filas.filter((f) => f.estado === "falta");
  return {
    filas, sinCruce, mermasSinEmparejar,
    totales: {
      salio: r2(filas.reduce((t, f) => t + f.salio, 0)),
      vendido: r2(filas.reduce((t, f) => t + f.vendido.fonavi + f.vendido.centro, 0)),
      mermas: r2(filas.reduce((t, f) => t + f.mermas.fonavi + f.mermas.centro, 0)),
      falta: r2(conFalta.reduce((t, f) => t + f.sinExplicar, 0)), valorFalta: r2(conFalta.reduce((t, f) => t + f.valor, 0)), productosConFalta: conFalta.length,
    },
  };
}
