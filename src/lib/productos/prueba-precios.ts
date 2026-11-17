/**
 * Prueba de precios: cuánto bajó de verdad la venta después de subir un precio · MOTOR (puro).
 *
 * Fase 2 de «¿Qué precios subir?» (pedido de Jahnn, 17-nov-2026). La fase 1 no puede medir la
 * sensibilidad al precio porque desde abril ningún precio cambió. La forma de medirla es una PRUEBA:
 * subir en una sede y dejar la otra igual, y comparar semana a semana.
 *
 * Nadie registra la prueba: el motor la DETECTA en las cargas semanales del reporte de Byte
 * (rotacion_cortes → semanasDeCortes). Si el precio promedio que cobró Byte por un producto sube
 * SUBIDA_MINIMA o más y se queda arriba, esa es una subida.
 *
 *   Antes     hasta SEMANAS_ANTES semanas antes del cambio.
 *   Cambio    la semana en que cambió; si su precio quedó a medio camino (parte de la semana con el
 *             precio viejo), no cuenta ni como antes ni como después.
 *   Después   las semanas siguientes. Con menos de SEMANAS_MINIMAS todavía «Midiendo».
 *
 *   Control   lo que habría pasado sin la subida: el mismo producto en la OTRA sede, si allí el precio
 *             no cambió; si no, el resto de la carta de la misma sede (los productos que no subieron).
 *             Así una semana floja (lluvia, feriado, vacaciones) no se confunde con el efecto del precio.
 *
 *   Efecto del precio = (después ÷ antes en la sede) ÷ (después ÷ antes en el control) − 1
 *   Sensibilidad (elasticidad) = efecto ÷ subida. −0.5 = por cada 10% que sube, vende 5% menos.
 *
 * Veredicto: «Funciona» si perdió menos ventas que su punto de quiebre (la subida deja más plata);
 * «No funciona» si perdió más. Sin costo de insumos, el corte es la propia subida (perder más % de
 * ventas que lo que subió el precio baja hasta lo que se cobra).
 */

import { claveByte } from "./costos-carta";

export const SUBIDA_MINIMA = 0.03;
export const SEMANAS_ANTES = 4;
export const SEMANAS_MINIMAS = 2;
export const SEMANAS_IDEALES = 4;
/** Unidades mínimas en una semana para leer su precio promedio. */
export const UNIDADES_MIN_SEMANA = 3;

export type SemanaSede = {
  sedeId: number;
  desde: string;
  hasta: string;
  dias: number;
  productos: { nombre: string; unidades: number; ingresos: number }[];
};

export type Sensibilidad = "poca" | "media" | "alta";
export type VeredictoPrueba = "midiendo" | "funciona" | "no-funciona";

export type FilaPrueba = {
  nombre: string;
  sedeId: number;
  sede: string;
  /** Desde qué semana se cobra el precio nuevo. */
  desde: string;
  precioAntes: number;
  precioDespues: number;
  subidaPct: number;
  control: "otra-sede" | "resto-carta";
  semanasAntes: number;
  semanasDespues: number;
  /** Unidades por día. */
  ritmoAntes: number;
  ritmoDespues: number;
  /** Cambio de la venta en la sede, sin corregir, y lo que cambió el control en las mismas fechas. */
  cambioPct: number;
  cambioControlPct: number;
  /** El efecto del precio: el cambio corregido por el control. */
  efectoPct: number;
  elasticidad: number;
  sensibilidad: Sensibilidad;
  /** Ventas que podía perder sin dejar menos plata (null sin costo). */
  quiebrePct: number | null;
  costo: number | null;
  /** Plata de más (o de menos) al mes por la subida; null sin costo. */
  extraMes: number | null;
  veredicto: VeredictoPrueba;
};

export type ResultadoPrueba = {
  filas: FilaPrueba[];
  /** Semanas cargadas por sede (para decir desde cuándo se puede medir). */
  semanasPorSede: { sedeId: number; semanas: number; hasta: string | null }[];
  conteo: Record<VeredictoPrueba, number>;
  /** Sensibilidad promedio de las pruebas ya medidas (ponderada por lo vendido antes). */
  elasticidadPromedio: number | null;
  extraMesTotal: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Punto = { semana: SemanaSede; unidades: number; ingresos: number; precio: number | null };

/** La serie semanal de un producto en una sede (las semanas sin venta cuentan con 0). */
function serie(semanas: SemanaSede[], clave: string): Punto[] {
  return semanas.map((s) => {
    let unidades = 0, ingresos = 0;
    for (const p of s.productos) if ((claveByte(p.nombre) || p.nombre) === clave) { unidades += p.unidades; ingresos += p.ingresos; }
    return { semana: s, unidades, ingresos, precio: unidades >= UNIDADES_MIN_SEMANA ? ingresos / unidades : null };
  });
}

type Cambio = { i: number; transicion: boolean; precioAntes: number; precioDespues: number };

/** La primera semana en que el precio sube SUBIDA_MINIMA o más y se queda arriba. */
export function detectarSubida(precios: (number | null)[]): Cambio | null {
  for (let i = 1; i < precios.length; i++) {
    const p = precios[i];
    if (p === null) continue;
    const previos = precios.slice(Math.max(0, i - SEMANAS_ANTES), i).filter((x): x is number => x !== null);
    if (previos.length === 0) continue;
    const ref = mediana(previos);
    if (p < ref * (1 + SUBIDA_MINIMA)) continue;
    const siguientes = precios.slice(i + 1).filter((x): x is number => x !== null);
    if (siguientes.some((x) => x < ref * (1 + SUBIDA_MINIMA))) continue; // volvió: era una semana rara, no una subida
    const nuevo = siguientes.length > 0 ? mediana(siguientes) : p;
    // A medio camino: parte de la semana se cobró el precio viejo.
    const transicion = siguientes.length > 0 && p < ref + 0.9 * (nuevo - ref);
    return { i, transicion, precioAntes: ref, precioDespues: transicion ? nuevo : mediana([p, ...siguientes]) };
  }
  return null;
}

/** Unidades por día de unas semanas. */
function ritmo(puntos: { semana: SemanaSede; unidades: number }[]): number {
  const dias = puntos.reduce((t, p) => t + p.semana.dias, 0);
  return dias > 0 ? puntos.reduce((t, p) => t + p.unidades, 0) / dias : 0;
}

/** Las semanas de `semanas` que caen dentro de las fechas de `ref` (mismas fechas o dentro de ellas). */
function mismasFechas(semanas: SemanaSede[], ref: SemanaSede[]): SemanaSede[] {
  return semanas.filter((s) => ref.some((r) => s.desde >= r.desde && s.hasta <= r.hasta) || ref.some((r) => r.desde >= s.desde && r.hasta <= s.hasta));
}

export function sensibilidadDe(elasticidad: number): Sensibilidad {
  if (elasticidad > -0.5) return "poca";
  if (elasticidad >= -1.5) return "media";
  return "alta";
}

export function medirPruebas(input: {
  semanas: SemanaSede[];
  sedes: { id: number; nombre: string }[];
  /** Costo de insumos por clave de producto (claveByte). */
  costos: Map<string, number>;
}): ResultadoPrueba {
  const porSede = new Map<number, SemanaSede[]>();
  for (const s of [...input.semanas].sort((a, b) => a.desde.localeCompare(b.desde))) {
    const l = porSede.get(s.sedeId) ?? [];
    l.push(s);
    porSede.set(s.sedeId, l);
  }

  // Primero se detectan las subidas de cada sede: el control depende de si la otra también subió.
  type Detectada = { sedeId: number; clave: string; nombre: string; puntos: Punto[]; cambio: Cambio };
  const detectadas: Detectada[] = [];
  for (const [sedeId, semanas] of porSede) {
    const nombres = new Map<string, string>();
    for (const s of semanas) for (const p of s.productos) {
      const k = claveByte(p.nombre) || p.nombre;
      if (!nombres.has(k)) nombres.set(k, p.nombre);
    }
    for (const [clave, nombre] of nombres) {
      const puntos = serie(semanas, clave);
      const cambio = detectarSubida(puntos.map((p) => p.precio));
      if (cambio) detectadas.push({ sedeId, clave, nombre, puntos, cambio });
    }
  }
  const subio = (sedeId: number, clave: string) => detectadas.some((d) => d.sedeId === sedeId && d.clave === clave);

  const filas: FilaPrueba[] = [];
  for (const d of detectadas) {
    const { cambio, puntos } = d;
    const antes = puntos.slice(Math.max(0, cambio.i - SEMANAS_ANTES), cambio.i);
    const despues = puntos.slice(cambio.transicion ? cambio.i + 1 : cambio.i);
    const semAntes = antes.map((p) => p.semana);
    const semDespues = despues.map((p) => p.semana);
    const ritmoAntes = ritmo(antes);
    const ritmoDespues = ritmo(despues);

    // Control: el mismo producto en otra sede que no subió; si no hay, el resto de la carta de esta sede.
    const otra = [...porSede.keys()].find((id) => id !== d.sedeId && !subio(id, d.clave));
    let control: FilaPrueba["control"] = "resto-carta";
    let cAntes = 0, cDespues = 0;
    if (otra !== undefined) {
      const sem = porSede.get(otra)!;
      const a = ritmo(serie(mismasFechas(sem, semAntes), d.clave));
      const b = ritmo(serie(mismasFechas(sem, semDespues), d.clave));
      if (a > 0 && b > 0) { control = "otra-sede"; cAntes = a; cDespues = b; }
    }
    if (control === "resto-carta") {
      const quedan = (s: SemanaSede) => s.productos
        .filter((p) => !subio(d.sedeId, claveByte(p.nombre) || p.nombre))
        .reduce((t, p) => t + p.unidades, 0);
      const r = (sem: SemanaSede[]) => { const dias = sem.reduce((t, s) => t + s.dias, 0); return dias > 0 ? sem.reduce((t, s) => t + quedan(s), 0) / dias : 0; };
      cAntes = r(semAntes); cDespues = r(semDespues);
    }

    const subida = cambio.precioDespues / cambio.precioAntes - 1;
    const cambioSede = ritmoAntes > 0 ? ritmoDespues / ritmoAntes - 1 : 0;
    const cambioControl = cAntes > 0 ? cDespues / cAntes - 1 : 0;
    const efecto = ritmoAntes > 0 && cAntes > 0 && cDespues > 0 ? (1 + cambioSede) / (1 + cambioControl) - 1 : cambioSede;
    const elasticidad = subida > 0 ? efecto / subida : 0;

    const costo = input.costos.get(d.clave) ?? null;
    const margenNuevo = costo !== null ? cambio.precioDespues - costo : null;
    const quiebre = margenNuevo !== null && margenNuevo > 0 ? (cambio.precioDespues - cambio.precioAntes) / margenNuevo : null;
    // Lo que se habría vendido con el precio nuevo, sin el ruido de la semana: el ritmo de antes con el efecto del precio.
    const extraMes = costo !== null && margenNuevo !== null
      ? r2((ritmoAntes * (1 + efecto) * margenNuevo - ritmoAntes * (cambio.precioAntes - costo)) * 30)
      : null;
    const corte = quiebre ?? subida;
    const veredicto: VeredictoPrueba = despues.length < SEMANAS_MINIMAS || antes.length === 0
      ? "midiendo"
      : -efecto <= corte ? "funciona" : "no-funciona";

    filas.push({
      nombre: d.nombre, sedeId: d.sedeId, sede: input.sedes.find((s) => s.id === d.sedeId)?.nombre ?? `Sede ${d.sedeId}`,
      desde: puntos[cambio.i].semana.desde,
      precioAntes: r2(cambio.precioAntes), precioDespues: r2(cambio.precioDespues), subidaPct: r1(subida * 100),
      control, semanasAntes: antes.length, semanasDespues: despues.length,
      ritmoAntes: r2(ritmoAntes), ritmoDespues: r2(ritmoDespues),
      cambioPct: r1(cambioSede * 100), cambioControlPct: r1(cambioControl * 100), efectoPct: r1(efecto * 100),
      elasticidad: r2(elasticidad), sensibilidad: sensibilidadDe(elasticidad),
      quiebrePct: quiebre !== null ? r1(quiebre * 100) : null, costo, extraMes, veredicto,
    });
  }

  const orden: Record<VeredictoPrueba, number> = { "no-funciona": 0, funciona: 1, midiendo: 2 };
  filas.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || b.ritmoAntes - a.ritmoAntes);
  const conteo: Record<VeredictoPrueba, number> = { midiendo: 0, funciona: 0, "no-funciona": 0 };
  for (const f of filas) conteo[f.veredicto] += 1;
  const medidas = filas.filter((f) => f.veredicto !== "midiendo");
  const peso = medidas.reduce((t, f) => t + f.ritmoAntes, 0);

  return {
    filas,
    semanasPorSede: input.sedes.map((s) => {
      const sem = porSede.get(s.id) ?? [];
      return { sedeId: s.id, semanas: sem.length, hasta: sem.length ? sem[sem.length - 1].hasta : null };
    }),
    conteo,
    elasticidadPromedio: peso > 0 ? r2(medidas.reduce((t, f) => t + f.elasticidad * f.ritmoAntes, 0) / peso) : null,
    extraMesTotal: r2(medidas.reduce((t, f) => t + (f.extraMes ?? 0), 0)),
  };
}
