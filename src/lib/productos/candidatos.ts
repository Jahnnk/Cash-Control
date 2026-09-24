/**
 * Candidatos a reemplazo · MOTOR (puro).
 *
 * Pedido de Jahnn (24-sep-2026): un apartado "muy visual y claro" en Grupo →
 * Productos que clasifique qué productos no nos convienen, cómo han ido en
 * ventas y rentabilidad por meses y semanas, y ayude a decidir qué sacar de
 * carta y cuándo — sabiendo que Fonavi y Centro venden la misma carta.
 *
 * Es un modelo de decisión con reglas A LA VISTA (filosofía del Centro de
 * Comando: cada número tiene de dónde sale). Cada producto recibe puntos de
 * riesgo por cuatro señales, medidas en los últimos 3 meses con datos de
 * cada sede (por día, para que un mes a medias no parezca una caída):
 *
 *   · VENDE POCO   — está en el 20% de la carta que menos factura por día Y
 *                    vende menos de la mitad que el producto típico (35 pts;
 *                    hasta el 35% y bajo el típico suma 20).
 *   · DEJA POCO    — su ganancia por día (unidades × (precio − costo)) está en
 *                    el 20% más bajo y es menos de la mitad de la típica (25
 *                    pts; hasta el 35% suma 12). Si pierde plata en cada venta, 30.
 *   · VIENE CAYENDO — el último mes vendió por día 40% menos que el promedio de
 *                    los dos anteriores (25 pts; 20% menos suma 15).
 *   · ROTA LENTO   — menos de 3 unidades por semana (15 pts; menos de 7 suma 8).
 *
 * 55 puntos o más en una sede = candidato ahí; de 35 a 54 = en observación.
 * No se juzgan: los productos nuevos (menos de 2 meses vendiéndose) ni los
 * acompañamientos (huevos, humitas, porciones: se venden como complemento
 * de otro plato). "Viene cayendo" solo cuenta si antes vendía al menos 6 al
 * mes: de 2 a 1 unidad no es una caída, es ruido. "Dejó de venderse" pide
 * dos meses seguidos sin ventas (un mes a medias no alcanza).
 *
 * Archivar (pedido de Jahnn, 24-sep-2026: "que sea más aplicativo"): cuando
 * Jahnn confirma que un producto ya no se vende o que ya lo sacó de carta,
 * lo archiva y deja de aparecer. Si vuelve a venderse en un mes POSTERIOR al
 * del archivo, reaparece marcado "volvió a venderse" (un producto de
 * temporada no queda escondido por error).
 *
 * Decisión de Jahnn: las dos cafeterías deciden JUNTAS.
 *   · Candidato en las dos           → Sacar de carta, en el próximo cambio de carta.
 *   · Candidato en una, flojo en otra → Preparar reemplazo, decidir en 4 semanas.
 *   · Candidato en una, bien en otra  → Revisar en esa sede (precio, vitrina, oferta).
 *   · Flojo en las dos               → En observación.
 */

import type { Familia } from "./panorama";
import { claveByte, enlazarCosto, palabras, type CostoCarta } from "./costos-carta";

export type MesCandidatos = {
  month: string;
  /** Días que cubre lo cargado del mes. */
  dias: number;
  /** Un mes con carga parcial subida como completa no se usa (ver trimestral.ts). */
  sospechoso: boolean;
  carta: { nombre: string; familia: Familia; unidades: number; ingresos: number }[];
};

export type SemanaCandidatos = {
  desde: string;
  hasta: string;
  dias: number;
  productos: { nombre: string; unidades: number; ingresos: number }[];
};

export type SedeCandidatos = {
  businessId: number;
  sede: string;
  meses: MesCandidatos[];
  semanas: SemanaCandidatos[];
};

export type Senal = "vende-poco" | "deja-poco" | "pierde" | "cayendo" | "rota-lento";

export type ProductoEnSede = {
  businessId: number;
  sede: string;
  /** Ventas y unidades por día de cada mes (0 si no vendió). */
  porMes: { month: string; ventaDia: number; unidadesDia: number; ingresos: number; unidades: number }[];
  /** Unidades por semana de las semanas guardadas (vacío hasta que haya cargas semanales). */
  porSemana: { desde: string; hasta: string; unidades: number; ingresos: number }[];
  ventaDia: number;
  unidadesSemana: number;
  precio: number | null;
  costo: number | null;
  margenUnidad: number | null;
  margenPct: number | null;
  gananciaDia: number | null;
  /** % respecto del promedio de los dos meses anteriores (null si no hay con qué comparar). */
  variacion: number | null;
  /** 0 = el que menos vende de la carta de la sede, 1 = el que más. */
  percentilVenta: number;
  percentilGanancia: number | null;
  puntos: number;
  senales: Senal[];
  estado: "candidato" | "observar" | "bien" | "nuevo" | "dejo-de-venderse" | "acompanamiento";
};

export type Veredicto = "sacar" | "preparar" | "revisar" | "observar" | "confirmar";

export type Candidato = {
  clave: string;
  nombre: string;
  familia: Familia;
  veredicto: Veredicto;
  /** Promedio de puntos de riesgo entre las sedes donde se vende. */
  puntos: number;
  cuando: string;
  razon: string;
  /** Sede a revisar cuando el problema es de una sola. */
  sedeRevisar: string | null;
  sedes: ProductoEnSede[];
  /** El que mejor le va en su familia, como referencia para el reemplazo. */
  referencia: { nombre: string; gananciaDia: number | null; ventaDia: number } | null;
  costoEnlazado: "manual" | "nombre" | null;
  /** Lo había archivado y volvió a venderse después. */
  volvioAVenderse: Archivado | null;
};

export type ResultadoCandidatos = {
  candidatos: Candidato[];
  /** Meses que se usaron para decidir. */
  meses: string[];
  semanas: number;
  /** % de las ventas analizadas que tienen costo (para decir cuánto se sabe de rentabilidad). */
  coberturaCosto: number;
  sinCosto: { nombre: string; ventaDia: number }[];
  archivados: (Archivado & { volvio: boolean })[];
};

export type MotivoArchivo = "ya-no-se-vende" | "sacado-de-carta";

export type Archivado = {
  clave: string;
  nombre: string;
  motivo: MotivoArchivo;
  /** Fecha (AAAA-MM-DD) en que se archivó. */
  archivadoEl: string;
  archivadoPor: string | null;
};

const MESES_VENTANA = 3;
export const UMBRAL_CANDIDATO = 55;
export const UMBRAL_OBSERVAR = 35;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Posición de v entre los valores (0 = el menor, 1 = el mayor); los empates comparten posición. */
function percentil(v: number, valores: number[]): number {
  if (valores.length <= 1) return 1;
  const menores = valores.filter((x) => x < v).length;
  const iguales = valores.filter((x) => x === v).length;
  return (menores + (iguales - 1) / 2) / (valores.length - 1);
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

type Acum = {
  nombre: string;
  familia: Familia;
  porMes: Map<string, { ingresos: number; unidades: number }>;
  mejorNombreIngresos: number;
};

/** Complementos de otro plato: no compiten como producto propio. */
const ES_COMPLEMENTO = /^(huevos? |humita|porcion )/;

function evaluarSede(sede: SedeCandidatos, costos: CostoCarta[], vinculos: Map<string, string>, protegidos: Set<string>) {
  const validos = sede.meses.filter((m) => !m.sospechoso && m.dias > 0 && m.carta.length > 0);
  const ventana = validos.slice(-MESES_VENTANA);
  const diasVentana = ventana.reduce((s, m) => s + m.dias, 0);

  // Una fila por producto; las variantes "PROMO MOSTRADOR" o con tilde se juntan.
  const productos = new Map<string, Acum>();
  for (const m of validos) {
    for (const p of m.carta) {
      const k = claveByte(p.nombre);
      if (!k) continue;
      const a = productos.get(k) ?? { nombre: p.nombre, familia: p.familia, porMes: new Map(), mejorNombreIngresos: 0 };
      const x = a.porMes.get(m.month) ?? { ingresos: 0, unidades: 0 };
      x.ingresos += p.ingresos; x.unidades += p.unidades;
      a.porMes.set(m.month, x);
      if (p.ingresos > a.mejorNombreIngresos) { a.nombre = p.nombre; a.familia = p.familia; a.mejorNombreIngresos = p.ingresos; }
      productos.set(k, a);
    }
  }

  const semanasPorClave = new Map<string, { desde: string; hasta: string; unidades: number; ingresos: number }[]>();
  for (const s of sede.semanas) {
    const suma = new Map<string, { unidades: number; ingresos: number }>();
    for (const p of s.productos) {
      const k = claveByte(p.nombre);
      const x = suma.get(k) ?? { unidades: 0, ingresos: 0 };
      x.unidades += p.unidades; x.ingresos += p.ingresos;
      suma.set(k, x);
    }
    for (const k of productos.keys()) {
      const x = suma.get(k) ?? { unidades: 0, ingresos: 0 };
      semanasPorClave.set(k, [...(semanasPorClave.get(k) ?? []), { desde: s.desde, hasta: s.hasta, ...x }]);
    }
  }

  const base = [...productos.entries()].map(([clave, a]) => {
    const porMes = validos.map((m) => {
      const x = a.porMes.get(m.month) ?? { ingresos: 0, unidades: 0 };
      return { month: m.month, ingresos: r2(x.ingresos), unidades: x.unidades, ventaDia: x.ingresos / m.dias, unidadesDia: x.unidades / m.dias };
    });
    const enVentana = porMes.slice(-ventana.length);
    const ingresos = enVentana.reduce((s, x) => s + x.ingresos, 0);
    const unidades = enVentana.reduce((s, x) => s + x.unidades, 0);
    const ventaDia = diasVentana > 0 ? ingresos / diasVentana : 0;
    const unidadesDia = diasVentana > 0 ? unidades / diasVentana : 0;
    const precio = unidades > 0 ? ingresos / unidades : null;
    const enlace = enlazarCosto(a.nombre, costos, vinculos, precio);
    const costo = enlace?.item.costo ?? null;
    const margenUnidad = precio !== null && costo !== null ? precio - costo : null;
    const ultimo = porMes[porMes.length - 1];
    const previos = porMes.slice(-3, -1);
    const promPrevio = previos.length > 0 ? previos.reduce((s, x) => s + x.ventaDia, 0) / previos.length : 0;
    const primerMes = porMes.findIndex((x) => x.unidades > 0);
    const ultimosDos = porMes.slice(-2);
    const unidadesMesPrevio = previos.length > 0 ? previos.reduce((s, x) => s + x.unidadesDia, 0) / previos.length * 30 : 0;
    return {
      clave, a, porMes, ventaDia, unidadesDia, precio, costo, margenUnidad,
      gananciaDia: margenUnidad !== null ? unidadesDia * margenUnidad : null,
      variacion: previos.length > 0 && promPrevio > 0 && ultimo && unidadesMesPrevio >= 6 ? ((ultimo.ventaDia - promPrevio) / promPrevio) * 100 : null,
      mesesVendiendo: primerMes === -1 ? 0 : porMes.length - primerMes,
      dejoDeVender: ultimosDos.length === 2 && ultimosDos.every((x) => x.unidades === 0) && porMes.some((x) => x.unidades > 0),
      acompanamiento: protegidos.has(clave) || ES_COMPLEMENTO.test(palabras(a.nombre).join(" ") + " "),
      enlace: enlace?.como ?? null,
    };
  });

  // Las posiciones se miden contra la carta ACTIVA de la sede (lo que vendió algo en la ventana).
  const activos = base.filter((b) => b.ventaDia > 0);
  const ventas = activos.map((b) => b.ventaDia);
  const ganancias = activos.filter((b) => b.gananciaDia !== null).map((b) => b.gananciaDia!);
  // "Poco" es relativo a la carta Y lejos del producto típico: en una carta
  // pareja, el último no está mal por ser el último.
  const ventaTipica = mediana(ventas);
  const gananciaTipica = mediana(ganancias);

  const evaluados = new Map<string, ProductoEnSede & { familia: Familia; nombre: string; enlace: "manual" | "nombre" | null }>();
  for (const b of base) {
    const percentilVenta = b.ventaDia > 0 ? percentil(b.ventaDia, ventas) : 0;
    const percentilGanancia = b.gananciaDia !== null && b.ventaDia > 0 ? percentil(b.gananciaDia, ganancias) : null;
    const senales: Senal[] = [];
    let puntos = 0;
    if (percentilVenta <= 0.2 && b.ventaDia < ventaTipica * 0.5) { puntos += 35; senales.push("vende-poco"); }
    else if (percentilVenta <= 0.35 && b.ventaDia < ventaTipica) puntos += 20;
    if (b.margenUnidad !== null && b.margenUnidad <= 0) { puntos += 30; senales.push("pierde"); }
    else if (percentilGanancia !== null && percentilGanancia <= 0.2 && b.gananciaDia! < gananciaTipica * 0.5) { puntos += 25; senales.push("deja-poco"); }
    else if (percentilGanancia !== null && percentilGanancia <= 0.35 && b.gananciaDia! < gananciaTipica) puntos += 12;
    if (b.variacion !== null && b.variacion <= -40) { puntos += 25; senales.push("cayendo"); }
    else if (b.variacion !== null && b.variacion <= -20) { puntos += 15; senales.push("cayendo"); }
    const unidadesSemana = b.unidadesDia * 7;
    if (unidadesSemana < 3) { puntos += 15; senales.push("rota-lento"); } else if (unidadesSemana < 7) puntos += 8;
    puntos = Math.min(100, puntos);

    const estado: ProductoEnSede["estado"] =
      b.acompanamiento ? "acompanamiento"
      : b.dejoDeVender ? "dejo-de-venderse"
      : b.mesesVendiendo < 2 ? "nuevo"
      : puntos >= UMBRAL_CANDIDATO ? "candidato"
      : puntos >= UMBRAL_OBSERVAR ? "observar" : "bien";

    evaluados.set(b.clave, {
      businessId: sede.businessId, sede: sede.sede, nombre: b.a.nombre, familia: b.a.familia, enlace: b.enlace,
      porMes: b.porMes.map((x) => ({ ...x, ventaDia: r2(x.ventaDia), unidadesDia: Math.round(x.unidadesDia * 100) / 100 })),
      porSemana: semanasPorClave.get(b.clave) ?? [],
      ventaDia: r2(b.ventaDia), unidadesSemana: Math.round(unidadesSemana * 10) / 10,
      precio: b.precio !== null ? r2(b.precio) : null, costo: b.costo !== null ? r2(b.costo) : null,
      margenUnidad: b.margenUnidad !== null ? r2(b.margenUnidad) : null,
      margenPct: b.margenUnidad !== null && b.precio ? Math.round((b.margenUnidad / b.precio) * 100) : null,
      gananciaDia: b.gananciaDia !== null ? r2(b.gananciaDia) : null,
      variacion: b.variacion !== null ? Math.round(b.variacion) : null,
      percentilVenta: Math.round(percentilVenta * 100) / 100,
      percentilGanancia: percentilGanancia !== null ? Math.round(percentilGanancia * 100) / 100 : null,
      puntos, senales, estado,
    });
  }
  return { evaluados, meses: validos.map((m) => m.month), ventana: ventana.map((m) => m.month) };
}

const soles = (n: number) => `S/${n.toFixed(2)}`;

function razonDe(sedes: ProductoEnSede[]): string {
  const partes: string[] = [];
  const en = (s: Senal) => sedes.filter((x) => x.senales.includes(s));
  const donde = (xs: ProductoEnSede[]) => (xs.length === sedes.length && sedes.length > 1 ? "en las dos sedes" : `en ${xs.map((x) => x.sede).join(" y ")}`);
  const poco = en("vende-poco");
  if (poco.length) partes.push(`está entre los que menos venden ${donde(poco)}`);
  const pierde = en("pierde");
  if (pierde.length) partes.push(`pierde plata en cada venta ${donde(pierde)}`);
  const deja = en("deja-poco");
  if (deja.length) {
    const g = deja.filter((x) => x.gananciaDia !== null).map((x) => `${x.sede} ${soles(x.gananciaDia!)}`);
    partes.push(`gana muy poco al día${g.length ? ` (${g.join(", ")})` : ""} aunque su margen por unidad sea bueno`);
  }
  const cae = en("cayendo");
  if (cae.length) partes.push(`viene cayendo ${cae.map((x) => `${x.sede} ${x.variacion}%`).join(", ")}`);
  const lento = en("rota-lento");
  if (lento.length) partes.push(`sale menos de 3 por semana ${donde(lento)}`);
  if (partes.length === 0) return "Sus números están por debajo del resto de la carta.";
  const t = partes.join("; ");
  return t.charAt(0).toUpperCase() + t.slice(1) + ".";
}

/**
 * Junta las sedes y decide. `sedes` son las cafeterías (Fonavi y Centro); un
 * producto que solo existe en una se decide con esa.
 */
export function armarCandidatos(
  sedes: SedeCandidatos[],
  costos: CostoCarta[],
  vinculos: Map<string, string>,
  /** Nombres marcados como acompañamiento en el sistema (products.es_acompanamiento). */
  acompanamientos: string[] = [],
  archivos: Archivado[] = [],
): ResultadoCandidatos {
  const protegidos = new Set(acompanamientos.map(claveByte));
  const porSede = sedes.map((s) => ({ sede: s, ...evaluarSede(s, costos, vinculos, protegidos) }));
  const claves = new Set(porSede.flatMap((x) => [...x.evaluados.keys()]));

  // ¿Volvió a venderse después de archivarlo? Vendió algo en un mes posterior al del archivo.
  const archivo = new Map(archivos.map((a) => [a.clave, a]));
  const volvio = (clave: string): boolean => {
    const a = archivo.get(clave);
    if (!a) return false;
    const mesArchivo = a.archivadoEl.slice(0, 7);
    return porSede.some((x) => x.evaluados.get(clave)?.porMes.some((m) => m.month > mesArchivo && m.unidades > 0));
  };

  // Referencia de reemplazo: el que más gana por día en su familia (entre todas las sedes).
  const lideres = new Map<Familia, { nombre: string; gananciaDia: number | null; ventaDia: number; valor: number }>();
  for (const { evaluados } of porSede) {
    for (const e of evaluados.values()) {
      if (e.estado !== "bien") continue;
      const valor = e.gananciaDia ?? e.ventaDia * 0.5;
      const l = lideres.get(e.familia);
      if (!l || valor > l.valor) lideres.set(e.familia, { nombre: e.nombre, gananciaDia: e.gananciaDia, ventaDia: e.ventaDia, valor });
    }
  }

  const candidatos: Candidato[] = [];
  for (const clave of claves) {
    if (archivo.has(clave) && !volvio(clave)) continue;
    const enSedes = porSede.map((x) => x.evaluados.get(clave)).filter((x): x is NonNullable<typeof x> => !!x && x.ventaDia + x.porMes.reduce((s, m) => s + m.ingresos, 0) > 0);
    if (enSedes.length === 0) continue;
    const estados = enSedes.map((x) => x.estado);
    if (estados.includes("acompanamiento")) continue;
    if (estados.includes("nuevo") && !estados.includes("candidato")) continue;
    const cand = enSedes.filter((x) => x.estado === "candidato");
    const obs = enSedes.filter((x) => x.estado === "observar");
    const bien = enSedes.filter((x) => x.estado === "bien");

    let veredicto: Veredicto | null = null;
    let cuando = "";
    let sedeRevisar: string | null = null;
    if (enSedes.every((x) => x.estado === "dejo-de-venderse")) {
      veredicto = "confirmar"; cuando = "Confirmar esta semana si ya salió de carta o si fue falta de stock";
    } else if (cand.length > 0 && cand.length === enSedes.filter((x) => x.estado !== "dejo-de-venderse").length) {
      veredicto = "sacar"; cuando = "En el próximo cambio de carta";
    } else if (cand.length > 0 && obs.length > 0) {
      veredicto = "preparar"; cuando = "Tener listo el reemplazo y decidir en 4 semanas";
    } else if (cand.length > 0 && bien.length > 0) {
      veredicto = "revisar"; sedeRevisar = cand.map((x) => x.sede).join(" y ");
      cuando = `Revisar en ${sedeRevisar} este mes: precio, vitrina y cómo se ofrece`;
    } else if (obs.length > 0 && bien.length === 0) {
      veredicto = "observar"; cuando = "Volver a mirar el próximo mes";
    }
    if (!veredicto) continue;

    const primero = enSedes[0];
    const puntos = Math.round(enSedes.reduce((s, x) => s + x.puntos, 0) / enSedes.length);
    const lider = lideres.get(primero.familia);
    candidatos.push({
      clave, nombre: primero.nombre, familia: primero.familia, veredicto, puntos, cuando,
      razon: veredicto === "confirmar" ? "No vendió nada en los dos últimos meses y antes sí." : razonDe(enSedes),
      sedeRevisar,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se quitan los campos internos
      sedes: enSedes.map(({ nombre: _n, familia: _f, enlace: _e, ...x }) => x),
      referencia: lider && lider.nombre !== primero.nombre ? { nombre: lider.nombre, gananciaDia: lider.gananciaDia, ventaDia: lider.ventaDia } : null,
      costoEnlazado: enSedes.find((x) => x.enlace)?.enlace ?? null,
      volvioAVenderse: archivo.get(clave) ?? null,
    });
  }

  const orden: Record<Veredicto, number> = { sacar: 0, preparar: 1, revisar: 2, confirmar: 3, observar: 4 };
  candidatos.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || b.puntos - a.puntos);

  // Cuánto de lo analizado tiene costo.
  let total = 0, conCosto = 0;
  const sinCosto = new Map<string, number>();
  for (const { evaluados } of porSede) {
    for (const e of evaluados.values()) {
      total += e.ventaDia;
      if (e.costo !== null) conCosto += e.ventaDia; else sinCosto.set(e.nombre, (sinCosto.get(e.nombre) ?? 0) + e.ventaDia);
    }
  }
  const meses = [...new Set(porSede.flatMap((x) => x.ventana))].sort();
  return {
    candidatos,
    meses,
    semanas: Math.max(0, ...sedes.map((s) => s.semanas.length)),
    coberturaCosto: total > 0 ? Math.round((conCosto / total) * 100) : 0,
    sinCosto: [...sinCosto.entries()].map(([nombre, ventaDia]) => ({ nombre, ventaDia: r2(ventaDia) })).sort((a, b) => b.ventaDia - a.ventaDia),
    archivados: archivos.map((a) => ({ ...a, volvio: volvio(a.clave) })).sort((a, b) => b.archivadoEl.localeCompare(a.archivadoEl)),
  };
}
