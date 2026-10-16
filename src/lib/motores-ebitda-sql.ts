/**
 * Los cuatro motores del EBITDA · LECTURA (servidor). Junta lo que las pantallas necesitan además de
 * las seis cifras: la venta esperada y la del mes anterior (motor 1) y las señales de eficiencia del
 * sistema (motor 4): mermas y tiempos de atención, cumplimiento del registro, de los reportes del
 * sábado y del Highlight, y las supervisiones. El cálculo y las frases: lib/motores-ebitda.ts.
 *
 * Solo se llama desde páginas de servidor que ya leyeron las seis cifras (solo dirección). Nunca
 * lanza: si algo falla, esa señal queda en gris y el resto se muestra.
 */

import { neon } from "@neondatabase/serverless";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { computeRangeSummary, mermasTraffic, type KpiDaily, type KpiTargets, type KpiTraffic } from "@/lib/kpis/engine";
import { planDe } from "@/lib/presupuesto-datos";
import { esSemanal, sumarDias } from "@/lib/highlight";
import { motoresDeSede, type EstadoMotor, type Motores, type Senal } from "@/lib/motores-ebitda";
import { regla33 } from "@/lib/regla-33";
import type { CifrasSede } from "@/lib/seis-cifras";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { getCumplimientoEquipo } from "@/app/actions/llenado-reportes";
import { getConsolaSupervision } from "@/app/actions/supervisiones";

const sql = neon(process.env.DATABASE_URL!);

const ES_CAFETERIA: Record<number, boolean> = { 1: false, 2: true, 3: true };
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const r1 = (n: number) => Math.round(n * 10) / 10;
const dd = (n: number) => String(n).padStart(2, "0");
const diasDelMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const aEstado = (t: KpiTraffic): EstadoMotor => t;

// ── Motor 1: la venta esperada y la del mes anterior ──────────────────────

async function ventasHasta(bId: number, mes: string, diaTope: number): Promise<number> {
  const { rows } = await loadVentaRowsBlended(sql as never, bId, `${mes}-01`, `${mes}-${dd(Math.min(diaTope, diasDelMes(mes)))}`);
  return rows.reduce((t, r) => t + (r.total > 0 ? r.total : 0), 0);
}

/**
 * La venta esperada del MES entero: la meta del presupuesto aprobado o, si no hay, la venta típica
 * (promedio de los hasta 3 meses anteriores con venta en al menos 20 días). Es la misma idea del
 * piso diario (lib/equilibrio.ts): no depende del ritmo del mes.
 */
async function ventaEsperadaDelMes(bId: number, mes: string): Promise<number | null> {
  try {
    const p = await planDe(bId, mes);
    const meta = p.cab?.aprobadoEl ? p.cab.ventaEsperada : null;
    if (meta !== null && meta !== undefined && meta > 0) return meta;
  } catch { /* sin presupuesto: se usa la venta típica */ }
  const totales: number[] = [];
  for (const m of [mesMas(mes, -1), mesMas(mes, -2), mesMas(mes, -3)]) {
    const { rows } = await loadVentaRowsBlended(sql as never, bId, `${m}-01`, `${m}-${dd(diasDelMes(m))}`);
    const conVenta = rows.filter((r) => r.total > 0);
    if (conVenta.length >= 20) totales.push(conVenta.reduce((t, r) => t + r.total, 0));
  }
  return totales.length > 0 ? totales.reduce((t, x) => t + x, 0) / totales.length : null;
}

// ── Motor 4: las señales ──────────────────────────────────────────────────

const METAS_POR_DEFECTO: KpiTargets = { ventaDiaria: 1, ticketRef: 1, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: 6, tiempoMesaMaxMin: 15, tiempoDeliveryMaxMin: 20 };

async function metasKpi(bId: number, mes: string): Promise<KpiTargets> {
  try {
    const rows = (await sql`
      SELECT venta_diaria::float AS vd, ticket_ref::float AS tr, nps_min::float AS nm, mermas_max_pct::float AS mp,
             tiempo_max_min::float AS tm, tiempo_mesa_max_min::float AS tmm
      FROM kpi_targets WHERE business_id = ${bId} AND effective_month <= ${mes} ORDER BY effective_month DESC LIMIT 1
    `) as { vd: number; tr: number; nm: number; mp: number; tm: number | null; tmm: number | null }[];
    if (rows[0]) return { ventaDiaria: rows[0].vd, ticketRef: rows[0].tr, npsMin: rows[0].nm, mermasMaxPct: rows[0].mp, tiempoMaxMin: rows[0].tm, tiempoMesaMaxMin: rows[0].tmm, tiempoDeliveryMaxMin: 20 };
  } catch { /* sin tabla de metas: las de siempre */ }
  return METAS_POR_DEFECTO;
}

async function diariosDelPeriodo(bId: number, desde: string, hasta: string): Promise<KpiDaily[]> {
  try {
    const rows = (await sql`
      SELECT date::text AS date, revenue::float AS ventas, personas, nps::float AS nps, mermas_soles::float AS mermas,
             tiempo_atencion_min::float AS tiempo, tiempo_mesa_min::float AS tiempo_mesa
      FROM upselling_daily WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} ORDER BY date
    `) as { date: string; ventas: number | null; personas: number | null; nps: number | null; mermas: number | null; tiempo: number | null; tiempo_mesa: number | null }[];
    return rows.map((r) => ({ date: r.date, ventas: r.ventas, personas: r.personas, nps: r.nps, mermasSoles: r.mermas, tiempoMin: r.tiempo, tiempoMesaMin: r.tiempo_mesa, tiempoDeliveryMin: null }));
  } catch {
    return [];
  }
}

const gris = (clave: string, etiqueta: string, detalle: string): Senal => ({ clave, etiqueta, estado: "gris", detalle });

async function senalesDeSede(s: CifrasSede, mes: string, cumplimiento: Awaited<ReturnType<typeof getCumplimientoEquipo>> | null,
  supervision: Awaited<ReturnType<typeof getConsolaSupervision>> | null): Promise<Senal[]> {
  const out: Senal[] = [];
  const hoy = hoyLima();
  const desde = `${mes}-01`;
  const hasta = s.corte && s.corte < `${mes}-${dd(diasDelMes(mes))}` ? s.corte : `${mes}-${dd(diasDelMes(mes))}`;
  const tope = hasta > hoy ? hoy : hasta;

  // Mermas y tiempos de atención (KPIs diarios de la sede).
  const [metas, diarios] = await Promise.all([metasKpi(s.businessId, mes), diariosDelPeriodo(s.businessId, desde, tope)]);
  const resumen = diarios.length > 0 ? computeRangeSummary(desde, tope, diarios, metas) : null;
  if (resumen && resumen.mermasPct !== null && diarios.some((d) => d.mermasSoles !== null)) {
    out.push({
      clave: "mermas", etiqueta: "Mermas",
      estado: aEstado(mermasTraffic(resumen.mermasTotal, resumen.ventasTotal || null, metas.mermasMaxPct)),
      detalle: `${resumen.mermasPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })}% de la venta · meta ${r1(metas.mermasMaxPct * 100)}%`,
      valor: resumen.mermasPct, peso: resumen.ventasTotal, meta: r1(metas.mermasMaxPct * 100),
    });
  } else out.push(gris("mermas", "Mermas", "Sin mermas registradas en el período"));

  if (resumen && (resumen.tiempoProm !== null || resumen.tiempoMesaProm !== null)) {
    const partes: { nombre: string; t: KpiTraffic; txt: string }[] = [];
    if (resumen.tiempoProm !== null && metas.tiempoMaxMin !== null) partes.push({ nombre: "mostrador", t: resumen.traffic.tiempo, txt: `mostrador ${resumen.tiempoProm} min (meta ${metas.tiempoMaxMin})` });
    if (resumen.tiempoMesaProm !== null && metas.tiempoMesaMaxMin !== null) partes.push({ nombre: "mesa", t: resumen.traffic.tiempoMesa, txt: `mesa ${resumen.tiempoMesaProm} min (meta ${metas.tiempoMesaMaxMin})` });
    const estados = partes.map((p) => aEstado(p.t));
    out.push(partes.length > 0
      ? { clave: "tiempos", etiqueta: "Tiempos de atención", estado: estados.includes("rojo") ? "rojo" : estados.includes("ambar") ? "ambar" : "verde", detalle: partes.map((p) => p.txt).join(" · ") }
      : gris("tiempos", "Tiempos de atención", "Sin metas de tiempo"));
  } else out.push(gris("tiempos", "Tiempos de atención", "Sin tiempos registrados en el período"));

  // «Generar valor» (triángulo del valor): ¿el cliente percibe el valor? NPS y ticket promedio de la sede (cafeterías).
  if (ES_CAFETERIA[s.businessId]) {
    out.push(resumen && resumen.npsProm !== null
      ? { clave: "nps", etiqueta: "NPS", paso: "generar", estado: aEstado(resumen.traffic.nps), detalle: `${resumen.npsProm} de 10 · meta ${metas.npsMin}` }
      : { ...gris("nps", "NPS", "Sin NPS registrado en el período"), paso: "generar" });
    out.push(resumen && resumen.ticketProm !== null && metas.ticketRef > 1
      ? { clave: "ticket", etiqueta: "Ticket promedio", paso: "generar", estado: aEstado(resumen.traffic.ticket), detalle: `S/${resumen.ticketProm.toFixed(2)} · referencia S/${metas.ticketRef.toFixed(2)}` }
      : { ...gris("ticket", "Ticket promedio", "Sin ticket en el período"), paso: "generar" });
  }

  // Registro diario: días con venta registrada sobre los días del período (cafeterías; Atelier llega con el Reporte de Ventas).
  if (ES_CAFETERIA[s.businessId]) {
    const dias = Number(tope.slice(8, 10));
    const registrados = diarios.filter((d) => d.ventas !== null).length;
    const ratio = dias > 0 ? registrados / dias : 0;
    out.push({
      clave: "registro", etiqueta: "Registro diario",
      estado: dias === 0 ? "gris" : ratio >= 0.95 ? "verde" : ratio >= 0.8 ? "ambar" : "rojo",
      detalle: `${registrados} de ${dias} días registrados`,
    });
  } else out.push(gris("registro", "Registro diario", "El día llega con el Reporte de Ventas de Byte"));

  // Reportes del sábado: solo el mes en curso (se comprueba contra la semana de hoy).
  const enCurso = mes === hoy.slice(0, 7);
  const ctl = cumplimiento?.control?.sedes.find((x) => x.businessId === s.businessId);
  if (enCurso && ctl) {
    out.push({
      clave: "reportes", etiqueta: "Reportes del sábado",
      estado: ctl.archivosFaltantes.length === 0 ? "verde" : ctl.archivosNunca.length > 0 ? "rojo" : "ambar",
      detalle: ctl.archivosFaltantes.length === 0 ? "Todos subidos esta semana" : `Faltan ${ctl.archivosFaltantes.join(", ")}`,
    });
  } else out.push(gris("reportes", "Reportes del sábado", "Se comprueban solo en el mes en curso"));

  // Highlight: semanas ya vencidas que el administrador cerró con su Reflect.
  try {
    const rows = (await sql`
      SELECT fecha::text AS fecha, estado FROM highlights
      WHERE business_id = ${s.businessId} AND fecha >= ${sumarDias(desde, -6)} AND fecha <= ${tope}
    `) as { fecha: string; estado: string }[];
    // Vencido: la semana (Highlight semanal) o el día (los de antes del 5-oct-2026) ya pasó.
    const vencidos = rows.filter((r) => (esSemanal(r.fecha) ? sumarDias(r.fecha, 6) < hoy : r.fecha < hoy));
    const cerrados = vencidos.filter((r) => r.estado !== "pendiente").length;
    out.push(vencidos.length === 0
      ? gris("highlight", "Highlight", "Sin Highlights vencidos en el período")
      : { clave: "highlight", etiqueta: "Highlight", estado: cerrados / vencidos.length >= 0.9 ? "verde" : cerrados / vencidos.length >= 0.7 ? "ambar" : "rojo", detalle: `${cerrados} de ${vencidos.length} cerrados` });
  } catch {
    out.push(gris("highlight", "Highlight", "No se pudo leer"));
  }

  // Supervisiones (solo Fonavi y Centro).
  const sup = supervision && supervision.ok ? supervision.data.sedes.find((x) => x.businessId === s.businessId) : null;
  if (sup) {
    const r = sup.resumen;
    out.push(r.estado === "sin_visitas"
      ? gris("supervision", "Supervisiones", "Sin visitas este mes")
      : { clave: "supervision", etiqueta: "Supervisiones", estado: r.estado === "al_dia" ? "verde" : r.estado === "pendiente" ? "ambar" : "rojo", detalle: `${r.visitas} ${r.visitas === 1 ? "visita" : "visitas"}${r.criticas.fueraDePlazo > 0 ? ` · ${r.criticas.fueraDePlazo} crítica fuera de plazo` : ""}` });
  } else out.push(gris("supervision", "Supervisiones", s.businessId === 1 ? "Atelier no se supervisa" : "Sin datos"));
  return out;
}

/** Las señales del Grupo: por cada una, la peor entre las sedes que la tienen, diciendo cuáles fallan. */
function senalesDelGrupo(porSede: { sede: string; senales: Senal[] }[]): Senal[] {
  const claves = [...new Set(porSede.flatMap((x) => x.senales.map((s) => s.clave)))];
  const orden: Record<EstadoMotor, number> = { rojo: 0, ambar: 1, verde: 2, gris: 3 };
  return claves.map((clave) => {
    const de = porSede.map((x) => ({ sede: x.sede, s: x.senales.find((s) => s.clave === clave) })).filter((x): x is { sede: string; s: Senal } => !!x.s);
    const conDato = de.filter((x) => x.s.estado !== "gris");
    const etiqueta = de[0].s.etiqueta;
    const paso = de[0].s.paso;
    if (conDato.length === 0) return { ...gris(clave, etiqueta, de[0].s.detalle), paso };
    const peor = conDato.reduce((p, x) => (orden[x.s.estado] < orden[p.s.estado] ? x : p));
    const falla = conDato.filter((x) => x.s.estado !== "verde");
    // Las señales con número (mermas) se promedian entre sedes, pesadas por su venta.
    const conNumero = conDato.filter((x) => x.s.valor !== null && x.s.valor !== undefined && (x.s.peso ?? 0) > 0);
    const pesoTotal = conNumero.reduce((t, x) => t + (x.s.peso ?? 0), 0);
    const valor = conNumero.length > 0 && pesoTotal > 0 ? conNumero.reduce((t, x) => t + (x.s.valor ?? 0) * (x.s.peso ?? 0), 0) / pesoTotal : null;
    return { clave, etiqueta, paso, estado: peor.s.estado, detalle: falla.length === 0 ? "En verde en todas las sedes" : falla.map((x) => `${x.sede}: ${x.s.detalle}`).join(" · "), valor: valor !== null ? r1(valor * 100) / 100 : null, peso: pesoTotal || null, meta: conNumero[0]?.s.meta ?? null };
  });
}

/** Los motores del Grupo y de cada sede en el mes, listos para mostrar. */
export async function leerMotores(cifras: SeisCifras): Promise<Motores[]> {
  const mes = cifras.mes;
  const reglas = regla33(cifras);
  const [cumplimiento, supervision] = await Promise.all([
    getCumplimientoEquipo().catch(() => null),
    getConsolaSupervision(mes).catch(() => null),
  ]);

  const sedes = await Promise.all(cifras.sedes.map(async (s) => {
    const fin = `${mes}-${dd(diasDelMes(mes))}`;
    const corte = s.corte && s.corte < fin ? s.corte : fin;
    const dia = Number(corte.slice(8, 10));
    const [esperadaMes, anterior, senales] = await Promise.all([
      ventaEsperadaDelMes(s.businessId, mes).catch(() => null),
      ventasHasta(s.businessId, mesMas(mes, -1), dia).catch(() => null),
      senalesDeSede(s, mes, cumplimiento, supervision),
    ]);
    // La venta esperada del tramo: si el Excel llega hasta el día 13, se espera lo de 13 de 31 días.
    const esperada = esperadaMes !== null ? esperadaMes * (dia / diasDelMes(mes)) : null;
    return { s, esperada, anterior: anterior !== null && anterior > 0 ? anterior : null, senales };
  }));

  const conResultado = sedes.filter((x) => x.s.conResultado);
  const internas = cifras.grupo.ventasInternas;
  const sumaEsperada = conResultado.every((x) => x.esperada !== null) && conResultado.length > 0 ? conResultado.reduce((t, x) => t + (x.esperada ?? 0), 0) - internas : null;
  const sumaAnterior = conResultado.every((x) => x.anterior !== null) && conResultado.length > 0 ? conResultado.reduce((t, x) => t + (x.anterior ?? 0), 0) - internas : null;

  return reglas.map((fila) => {
    if (fila.esGrupo) {
      return motoresDeSede({
        regla: fila,
        ventas: { monto: fila.ventas ?? 0, esperada: sumaEsperada, mesAnterior: sumaAnterior },
        senales: senalesDelGrupo(sedes.map((x) => ({ sede: x.s.sede, senales: x.senales }))),
      });
    }
    const x = sedes.find((y) => y.s.sede === fila.etiqueta);
    return motoresDeSede({
      regla: fila,
      ventas: { monto: fila.ventas ?? 0, esperada: x?.esperada ?? null, mesAnterior: x?.anterior ?? null },
      senales: x?.senales ?? [],
    });
  });
}
