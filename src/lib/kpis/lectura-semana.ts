/**
 * "Lectura de la semana" del deck · MOTOR (puro).
 *
 * Pedido de Jahnn (24-sep-2026, rediseño del deck): cada diapositiva lleva
 * sus hallazgos y una acción. Decisión de Jahnn: los escribe el sistema con
 * REGLAS FIJAS a partir de los números — siempre las mismas, sin inventar —
 * para que el texto nunca contradiga a la tarjeta de al lado.
 *
 * Los umbrales son los del semáforo del sistema (engine.ts): verde ≥ 100% de
 * la meta, ámbar ≥ 95%, rojo por debajo.
 */

import type { KpiTraffic } from "./engine";

export type Tono = "verde" | "ambar" | "rojo" | "gris";

export type LecturaSede = {
  titulo: string;
  tono: Tono;
  puntos: string[];
  /** Una acción concreta (null = no hace falta). */
  accion: string | null;
};

export type Hallazgo = { titulo: string; texto: string; tono: Tono };

const pct1 = (n: number) => `${Math.abs(Math.round(n * 10) / 10)}%`;
const signo = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${pct1(n)}`;
const soles = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

const PEOR: Record<Tono, number> = { rojo: 3, ambar: 2, verde: 1, gris: 0 };
export const peorTono = (...ts: Tono[]): Tono => ts.reduce((a, b) => (PEOR[b] > PEOR[a] ? b : a), "gris" as Tono);

/* ───────────── Diapositiva 2 · La semana en una mirada ───────────── */

export type ResumenCafeteria = {
  sede: string;
  ventasPct: number | null;
  ticketPct: number | null;
  nps: number | null;
  npsMin: number;
  mermasPct: number | null;
  mermasMaxPct: number;
  traffic: { ventas: KpiTraffic; ticket: KpiTraffic; nps: KpiTraffic; mermas: KpiTraffic };
};

function frasePct(nombre: string, pct: number | null, referencia: string): string | null {
  if (pct === null) return null;
  const dif = pct - 100;
  if (dif >= 0) return `${nombre} ${pct1(dif)} sobre la ${referencia}.`;
  if (dif > -5) return `${nombre} casi en ${referencia} (${signo(dif)}).`;
  return `${nombre} ${pct1(dif)} por debajo de la ${referencia}.`;
}

export function lecturaCafeteria(c: ResumenCafeteria): LecturaSede {
  const puntos = [
    frasePct("Ventas", c.ventasPct, "meta"),
    frasePct("Ticket", c.ticketPct, "referencia"),
  ].filter((x): x is string => !!x);

  const npsOk = c.traffic.nps === "verde";
  const mermaOk = c.traffic.mermas === "verde";
  if (c.nps !== null || c.mermasPct !== null) {
    if (npsOk && mermaOk) puntos.push("NPS en meta y merma en rango.");
    else {
      if (c.nps !== null) puntos.push(npsOk ? `NPS en meta (${c.nps}).` : `NPS bajo la meta (${c.nps}, meta ≥ ${c.npsMin}).`);
      if (c.mermasPct !== null) {
        puntos.push(mermaOk ? "Merma en rango." : `Merma por encima del rango (${c.mermasPct}%, máx. ${Math.round(c.mermasMaxPct * 100)}%).`);
      }
    }
  }

  const tv = c.traffic.ventas as Tono;
  const tt = c.traffic.ticket as Tono;
  const tono = peorTono(tv, tt, c.traffic.nps as Tono, c.traffic.mermas as Tono);
  let accion: string;
  if (tv === "rojo" && tt === "rojo") accion = "Revisar acciones para recuperar ventas y ticket la próxima semana.";
  else if (tv === "rojo") accion = "Revisar acciones para recuperar las ventas la próxima semana.";
  else if (tt === "rojo") accion = "Empujar el ticket: ofrecer productos de mayor valor en caja y en mesa.";
  else if (!mermaOk && c.mermasPct !== null) accion = "Mantener el ritmo de ventas y enfocar en reducir mermas.";
  else if (!npsOk && c.nps !== null) accion = "Mantener las ventas y revisar la atención: el NPS bajó.";
  else if (tv === "ambar" || tt === "ambar") accion = "Mantener el ritmo de ventas y cerrar la brecha del ticket.";
  else accion = "Semana en meta: mantener lo que está funcionando.";
  return { titulo: c.sede, tono, puntos, accion };
}

export type ResumenAtelier = { ventasTotal: number; dias: number; ticketProm: number | null; mermasPct: number | null; mermasMaxPct: number };

export function lecturaAtelier(a: ResumenAtelier): LecturaSede {
  const puntos = [`${soles0(a.ventasTotal)} vendidos en ${a.dias} ${a.dias === 1 ? "día" : "días"}.`];
  if (a.ticketProm !== null) puntos.push(`Ticket promedio ${soles(a.ticketProm)} por pedido.`);
  if (a.mermasPct !== null) {
    puntos.push(a.mermasPct <= a.mermasMaxPct * 100 ? "Merma en rango." : `Merma por encima del rango (${a.mermasPct}%).`);
  }
  return { titulo: "Atelier", tono: "gris", puntos, accion: "Falta definir meta/referencia de ventas para evaluar su desempeño." };
}

/* ───────────── Diapositiva 3 · Ventas del mes (Byte) ───────────── */

export type ResumenVentas = { sede: string; deltaSemanaPct: number | null; deltaMesPct: number | null; esAtelier: boolean };

export function lecturaVentas(v: ResumenVentas): LecturaSede {
  const puntos: string[] = [];
  const m = v.deltaMesPct;
  if (m !== null) {
    puntos.push(m >= -2 && m <= 2 ? `Acumulado prácticamente estable (${signo(m)}).` : `${signo(m)} en el acumulado vs. mes anterior.`);
  }
  const s = v.deltaSemanaPct;
  if (s !== null) {
    puntos.push(
      s >= 5 ? `Semana en alza (${signo(s)}).`
      : s >= 0 ? `Semana con ligero crecimiento (${signo(s)}).`
      : s > -5 ? `Semana casi estable (${signo(s)}).`
      : s > -10 ? `Semana en baja (${signo(s)}).`
      : `Caída importante en la semana (${signo(s)}).`,
    );
  }
  let accion: string;
  if (m === null) accion = "Falta el reporte del mes anterior para comparar.";
  else if (v.esAtelier && m < -2) accion = "Revisar la cartera B2B y los próximos pedidos.";
  else if (m <= -10) accion = "Revisar las causas y definir un plan de acción inmediato.";
  else if (m < -2) accion = "Vigilar la tendencia y reforzar lo que más vende.";
  else accion = "Mantener las estrategias y el monitoreo.";
  const tono: Tono = m === null ? "gris" : m >= -2 ? "verde" : m > -10 ? "ambar" : "rojo";
  return { titulo: v.sede, tono, puntos, accion };
}

/* ───────────── Diapositivas 4 y 5 · Detalle de KPIs de una cafetería ───────────── */

export type DetalleCafeteria = ResumenCafeteria & {
  ventasProm: number | null;
  ticketProm: number | null;
  peorDiaVentas: { dia: string; valor: number } | null;
};

export function hallazgosCafeteria(c: DetalleCafeteria): Hallazgo[] {
  const out: Hallazgo[] = [];
  const tv = c.traffic.ventas as Tono;
  if (c.ventasPct !== null && c.ventasProm !== null) {
    const dif = c.ventasPct - 100;
    out.push({
      titulo: tv === "verde" ? "Ventas en meta" : tv === "ambar" ? "Ventas cerca de la meta" : "Ventas bajo la meta",
      texto: `Promedio diario ${soles(c.ventasProm)} (${signo(dif)} vs meta).` +
        (c.peorDiaVentas && tv !== "verde" ? ` ${c.peorDiaVentas.dia} fue el día más bajo (${soles0(c.peorDiaVentas.valor)}).` : ""),
      tono: tv,
    });
  }
  const tt = c.traffic.ticket as Tono;
  if (c.ticketPct !== null && c.ticketProm !== null) {
    const dif = c.ticketPct - 100;
    out.push({
      titulo: tt === "verde" ? "Ticket en la referencia" : tt === "ambar" ? "Ticket algo por debajo" : "Ticket bajo la referencia",
      texto: `${soles(c.ticketProm)} (${signo(dif)} vs referencia).` +
        (tt === "verde" ? " Mantener el upselling." : " Oportunidad de impulsar productos de mayor valor."),
      tono: tt,
    });
  }
  const tn = c.traffic.nps as Tono;
  const tm = c.traffic.mermas as Tono;
  const partes = [
    c.nps !== null ? `NPS ${c.nps}${tn === "verde" ? " (en meta)" : ` (meta ≥ ${c.npsMin})`}` : null,
    c.mermasPct !== null ? `mermas ${c.mermasPct}%${tm === "verde" ? ` (dentro del rango ≤ ${Math.round(c.mermasMaxPct * 100)}%)` : ` (máx. ${Math.round(c.mermasMaxPct * 100)}%)`}` : null,
  ].filter((x): x is string => !!x);
  if (partes.length > 0) {
    const bien = (tn === "verde" || c.nps === null) && (tm === "verde" || c.mermasPct === null);
    out.push({
      titulo: bien ? "NPS y mermas en buen nivel" : tn !== "verde" && c.nps !== null && tm !== "verde" && c.mermasPct !== null ? "NPS y mermas fuera de meta"
        : tn !== "verde" && c.nps !== null ? "NPS bajo la meta" : "Merma por encima del rango",
      texto: partes.join(" y ").replace(/^./, (m) => m.toUpperCase()) + ".",
      tono: bien ? "verde" : peorTono(c.nps !== null ? tn : "gris", c.mermasPct !== null ? tm : "gris"),
    });
  }
  return out;
}

/* ───────────── Diapositiva 6 · Atelier ───────────── */

export function hallazgosAtelier(a: {
  ventasTotal: number; dias: number; deltaSemanaPct: number | null;
  promDia: number | null; deltaPromMesPct: number | null;
  ticketProm: number | null; mermasTotal: number | null; mermasPct: number | null;
}): Hallazgo[] {
  const out: Hallazgo[] = [];
  const s = a.deltaSemanaPct;
  out.push({
    titulo: s === null ? "Ventas del período" : s >= 5 ? "Ventas en alza" : s >= 0 ? "Ventas estables" : s > -5 ? "Ventas ligeramente menores" : "Ventas en caída",
    texto: `${soles(a.ventasTotal)}${s !== null ? ` (${signo(s)} vs. semana anterior)` : ""} en ${a.dias} ${a.dias === 1 ? "día" : "días"} con venta.`,
    tono: s === null ? "gris" : s >= 0 ? "verde" : s > -5 ? "ambar" : "rojo",
  });
  const m = a.deltaPromMesPct;
  if (a.promDia !== null) {
    out.push({
      titulo: m === null ? "Promedio por día" : m >= 2 ? "Promedio por día en alza" : m > -2 ? "Promedio por día estable" : "Promedio por día en caída",
      texto: `${soles(a.promDia)}${m !== null ? ` (${signo(m)} vs. promedio diario del mes anterior)` : ""}.`,
      tono: m === null ? "gris" : m >= -2 ? "verde" : m > -10 ? "ambar" : "rojo",
    });
  }
  const t = [
    a.ticketProm !== null ? `Ticket promedio: ${soles(a.ticketProm)} por pedido.` : null,
    a.mermasTotal !== null ? `Mermas del período: ${soles(a.mermasTotal)}${a.mermasPct !== null ? ` (${a.mermasPct}% de la venta)` : ""}.` : null,
  ].filter((x): x is string => !!x);
  if (t.length > 0) out.push({ titulo: "Ticket y mermas", texto: t.join(" "), tono: "gris" });
  return out;
}

/* ───────────── Diapositiva 7 · Incentivos ───────────── */

export type ResumenIncentivo = {
  sede: string;
  deltaActual: number | null;
  personasPorDia: number | null;
  trafficFloor: number | null;
  trafficOk: boolean;
  /** Candado de ventas del mes (desde octubre 2026): reemplaza al piso de tráfico. */
  candado: { meta: number; proyeccion: number | null; cumple: boolean; enCamino: boolean } | null;
  /** Avance hacia el primer nivel que falta (0–100), o null si ya los pasó todos. */
  avanceProximo: { nivel: string; pct: number } | null;
  nivelAlcanzado: string | null;
};

/** Cuánto del aumento de ticket que pide un nivel ya se logró (decisión de Jahnn). */
export function avanceNivel(deltaActual: number | null, deltaNivel: number): number {
  if (deltaActual === null || deltaNivel <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((deltaActual / deltaNivel) * 100)));
}

export function hallazgosIncentivos(xs: ResumenIncentivo[]): Hallazgo[] {
  const out: Hallazgo[] = [];
  const conDato = xs.filter((x) => x.deltaActual !== null);
  if (conDato.length > 0) {
    const suben = conDato.filter((x) => x.deltaActual! > 0);
    out.push({
      titulo: suben.length === conDato.length ? (conDato.length > 1 ? "Ambas sedes aumentan el ticket" : `${conDato[0].sede} aumenta el ticket`)
        : suben.length === 0 ? "El ticket no sube respecto de la base" : `${suben.map((x) => x.sede).join(" y ")} aumenta el ticket`,
      texto: conDato.map((x) => `${x.sede} ${x.deltaActual! >= 0 ? "+" : "−"}${soles(Math.abs(x.deltaActual!))}`).join(" y ") + " de venta nueva por cliente vs. base del mes.",
      tono: suben.length === conDato.length ? "verde" : suben.length === 0 ? "rojo" : "ambar",
    });
  }
  const conCandado = xs.filter((x) => x.candado);
  if (conCandado.length > 0) {
    const ok = conCandado.every((x) => x.candado!.cumple || x.candado!.enCamino);
    out.push({
      titulo: ok ? "Meta de ventas en camino" : "Meta de ventas en riesgo",
      texto: conCandado.map((x) => `${x.sede}: ${x.candado!.proyeccion !== null ? `al ritmo actual ${soles0(x.candado!.proyeccion)}` : "sin proyección"} de ${soles0(x.candado!.meta)}`).join(" · ") + ".",
      tono: ok ? "verde" : "rojo",
    });
  } else {
    const conPiso = xs.filter((x) => x.trafficFloor !== null && x.personasPorDia !== null);
    if (conPiso.length > 0) {
      const ok = conPiso.every((x) => x.trafficOk);
      out.push({
        titulo: ok ? "Tráfico en el piso objetivo" : "Tráfico bajo el piso",
        texto: conPiso.map((x) => `${x.sede} ${x.personasPorDia} (mín. ${x.trafficFloor})`).join(" y ") + ".",
        tono: ok ? "verde" : "rojo",
      });
    }
  }
  const prox = xs.filter((x) => x.avanceProximo);
  if (prox.length > 0) {
    const nivel = prox[0].avanceProximo!.nivel;
    const mismo = prox.every((x) => x.avanceProximo!.nivel === nivel);
    const alto = prox.every((x) => x.avanceProximo!.pct >= 80);
    out.push({
      titulo: mismo ? `${nivel} ${alto ? "casi alcanzado" : "en camino"}` : "Avance hacia el próximo nivel",
      texto: prox.map((x) => `${x.sede} ${x.avanceProximo!.pct}%${mismo ? "" : ` de ${x.avanceProximo!.nivel}`}`).join(" y ") + ". Enfocar en cerrar la brecha.",
      tono: alto ? "ambar" : "gris",
    });
  } else if (xs.some((x) => x.nivelAlcanzado)) {
    out.push({ titulo: "Todos los niveles alcanzados", texto: "El equipo ya llegó al nivel más alto del mes.", tono: "verde" });
  }
  return out;
}

/* ───────────── Diapositiva 8 · Punto de equilibrio ───────────── */

export type ResumenEquilibrio = { nombre: string; avancePct: number | null; falta: number | null; superado: boolean; sinDatos: boolean };

export function hallazgosEquilibrio(sedes: ResumenEquilibrio[], grupo: ResumenEquilibrio): Hallazgo[] {
  const out: Hallazgo[] = [];
  const debajo = sedes.filter((s) => !s.sinDatos && !s.superado);
  const arriba = sedes.filter((s) => s.superado);
  for (const s of debajo.slice(0, 1)) {
    out.push({
      titulo: `${s.nombre} por debajo`,
      texto: `${Math.round(s.avancePct ?? 0)}% de la meta.${s.falta !== null ? ` Faltan ${soles0(s.falta)} para cubrir costos.` : ""}`,
      tono: "rojo",
    });
  }
  if (arriba.length > 0) {
    out.push({
      titulo: `${arriba.map((s) => s.nombre).join(" y ")} ya en ganancia`,
      texto: `${arriba.map((s) => `${Math.round(s.avancePct ?? 0)}%`).join(" y ")} de la meta${arriba.length > 1 ? " respectivamente" : ""}.`,
      tono: "verde",
    });
  }
  if (!grupo.sinDatos) {
    const p = Math.round(grupo.avancePct ?? 0);
    out.push({
      titulo: grupo.superado ? "Grupo en ganancia" : p >= 90 ? "Grupo casi en equilibrio" : "Grupo por debajo del equilibrio",
      texto: `${p}%.${!grupo.superado && grupo.falta !== null ? ` Faltan ${soles0(grupo.falta)} para cubrir costos fijos.` : ""}`,
      tono: grupo.superado ? "verde" : p >= 90 ? "ambar" : "rojo",
    });
  }
  return out;
}
