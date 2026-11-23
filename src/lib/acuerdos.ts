/**
 * Acuerdos y tareas · MOTOR (puro, sin base de datos).
 *
 * Pedido de Jahnn (19-nov-2026): centralizar los acuerdos de las reuniones de marketing, administración,
 * operaciones, finanzas y calidad, Y las tareas que surgen en el día a día. Cada compromiso tiene un
 * responsable, una fecha límite y un seguimiento hasta que se cumple.
 *
 * Complementa al Highlight, no lo reemplaza: el Highlight es UNA sola tarea por sede y semana («lo que más
 * importa»); aquí van todos los compromisos.
 *
 * Reglas (copiadas de lo que ya funciona en Highlight y Supervisiones):
 *   · «Vencido» lo pone el sistema: fecha límite pasada y el acuerdo sin cumplir. Nadie lo marca a mano.
 *   · Tres estados, como Monday (pedido de Jahnn, 19-nov-2026): No iniciado → En progreso → Hecho. El
 *     responsable lo cambia solo; no hay paso de «confirmar». Si algo no quedó bien, se vuelve a En progreso.
 *     (Los acuerdos viejos guardados como «por confirmar» se leen como Hecho: ver actions/acuerdos.ts.)
 *   · Lo tarde queda tarde (`tarde`): reabrir o mover la fecha no lava un atraso.
 *   · Cambiar la fecha límite pide motivo y guarda la fecha original.
 */

export const AREAS = ["marketing", "administracion", "operaciones", "finanzas", "calidad"] as const;
export type Area = (typeof AREAS)[number];
export const AREA_LABEL: Record<Area, string> = {
  marketing: "Marketing",
  administracion: "Administración",
  operaciones: "Operaciones",
  finanzas: "Finanzas",
  calidad: "Calidad",
};
export const esArea = (v: string): v is Area => (AREAS as readonly string[]).includes(v);

/** Prioridad (19-nov-2026, referencia Jira): tres niveles bastan para un equipo chico. Media por defecto. */
export const PRIORIDADES = ["alta", "media", "baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export const PRIORIDAD_LABEL: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };
export const esPrioridad = (v: unknown): v is Prioridad => (PRIORIDADES as readonly unknown[]).includes(v);
const rangoPrioridad = (p: unknown) => (p === "alta" ? 0 : p === "baja" ? 2 : 1);

/** Lo que se guarda. «Vencido» no se guarda: se calcula con la fecha. */
export const ESTADOS = ["pendiente", "en_proceso", "cumplido", "anulado"] as const;
export type EstadoGuardado = (typeof ESTADOS)[number];
export type EstadoVisible = EstadoGuardado | "vencido";

export const ESTADO_LABEL: Record<EstadoVisible, string> = {
  pendiente: "No iniciado",
  en_proceso: "En progreso",
  cumplido: "Hecho",
  vencido: "Vencido",
  anulado: "Anulado",
};

export const MAX_QUE = 200;
export const MAX_DETALLE = 1000;
export const MAX_MOTIVO = 300;

/** Quién es cada persona en el módulo. La clave identifica al responsable: «jahnn», «kelly» o «u:<id>». */
export type TipoPersona = "direccion" | "equipo" | "admin";
export type Persona = { clave: string; nombre: string; tipo: TipoPersona; detalle: string };

export type AcuerdoBase = {
  estado: EstadoGuardado;
  fechaLimite: string; // YYYY-MM-DD
};

/** ¿Sigue abierto? (no iniciado o en progreso). */
export const estaAbierto = (e: EstadoGuardado) => e === "pendiente" || e === "en_proceso";

export function estadoVisible(a: AcuerdoBase, hoy: string): EstadoVisible {
  if (estaAbierto(a.estado) && a.fechaLimite < hoy) return "vencido";
  return a.estado;
}

/** Días entre hoy y la fecha límite. Negativo = ya pasó. */
export function diasRestantes(fechaLimite: string, hoy: string): number {
  const ms = Date.parse(`${fechaLimite}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Texto corto del plazo: «vence hoy», «en 3 días», «hace 2 días». */
export function textoPlazo(fechaLimite: string, hoy: string): string {
  const d = diasRestantes(fechaLimite, hoy);
  if (d === 0) return "vence hoy";
  if (d === 1) return "vence mañana";
  if (d > 1) return `en ${d} días`;
  if (d === -1) return "venció ayer";
  return `venció hace ${-d} días`;
}

/** Al marcar cumplido (o al mover una fecha ya vencida): ¿queda como tarde? Es pegajoso: una vez tarde, tarde. */
export function quedaTarde(tardeAntes: boolean, fechaLimite: string, hoy: string): boolean {
  return tardeAntes || hoy > fechaLimite;
}

export type NuevoAcuerdo = { que: string; area: string; responsable: string; fechaLimite: string };

/** Errores de un acuerdo nuevo, en español. Vacío = se puede guardar. */
export function erroresAcuerdo(a: NuevoAcuerdo, hoy: string, claves: Set<string>): string[] {
  const e: string[] = [];
  const que = a.que.trim();
  if (que.length < 3) e.push("Escribe qué se hará.");
  if (que.length > MAX_QUE) e.push(`«Qué se hará» puede tener hasta ${MAX_QUE} letras.`);
  if (!esArea(a.area)) e.push("Elige el área.");
  if (!claves.has(a.responsable)) e.push("Elige al responsable.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fechaLimite)) e.push("Elige la fecha límite.");
  else if (a.fechaLimite < hoy) e.push("La fecha límite no puede ser anterior a hoy.");
  return e;
}

/**
 * Apoyos de una tarea (23-nov-2026): solo personas que existen, sin repetir y sin el responsable principal.
 * El principal es quien responde; los apoyos ayudan y no cuentan en el cumplimiento.
 */
export function limpiarApoyos(apoyos: readonly string[] | undefined, responsable: string, claves: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const c of apoyos ?? []) if (c !== responsable && claves.has(c) && !out.includes(c)) out.push(c);
  return out.slice(0, MAX_APOYOS);
}
export const MAX_APOYOS = 6;

/**
 * Subtareas (23-nov-2026): un solo nivel, la madre sigue abierta y la subtarea no vence después que la madre.
 * null = se puede crear.
 */
export function erroresSubtarea(madre: { padreId: number | null; estado: EstadoGuardado; fechaLimite: string }, fecha: string): string | null {
  if (madre.padreId != null) return "Una subtarea no puede tener sus propias subtareas.";
  if (!estaAbierto(madre.estado)) return "La tarea ya está cerrada: reábrela para agregarle subtareas.";
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha > madre.fechaLimite) return "La subtarea no puede vencer después que su tarea.";
  return null;
}

/** «Luana Vásquez + 2»: el principal y cuántos apoyos tiene. */
export function nombreConApoyos(a: { responsableNombre: string; apoyoNombres?: string[] }): string {
  const n = a.apoyoNombres?.length ?? 0;
  return n ? `${a.responsableNombre} + ${n}` : a.responsableNombre;
}

/** Lo que la sesión puede hacer con un acuerdo. */
export type Yo = { clave: string; tipo: TipoPersona };
export type AccionAcuerdo =
  | "avanzar" // cambiar el estado: no iniciado, en progreso o hecho (también reabrir)
  | "editar" // qué, área, responsable, fecha
  | "anular"
  | "comentar";

export function puede(yo: Yo, a: { responsableClave: string; creadoPorClave: string; estado: EstadoGuardado; apoyoClaves?: string[] }, accion: AccionAcuerdo): boolean {
  const dir = yo.tipo === "direccion";
  // Un apoyo (23-nov-2026) trabaja la tarea como el responsable: cambia el estado y comenta. No la edita ni la anula.
  const esResp = yo.clave === a.responsableClave || (a.apoyoClaves ?? []).includes(yo.clave);
  const esCreador = yo.clave === a.creadoPorClave;
  if (a.estado === "anulado") return false;
  switch (accion) {
    case "avanzar":
      return esResp || dir;
    case "editar":
    case "anular":
      return a.estado !== "cumplido" && (dir || esCreador);
    case "comentar":
      return dir || esResp || esCreador || yo.tipo === "equipo";
  }
}

/** Orden de la lista: vencidos y abiertos (dentro de cada uno, Alta primero y luego por fecha); cerrados al final. */
export function ordenAcuerdos<T extends AcuerdoBase & { id: number; prioridad?: Prioridad }>(lista: T[], hoy: string): T[] {
  const peso = (a: T) => {
    const v = estadoVisible(a, hoy);
    return v === "vencido" ? 0 : v === "en_proceso" || v === "pendiente" ? 2 : v === "cumplido" ? 3 : 4;
  };
  return [...lista].sort((a, b) => peso(a) - peso(b)
    || (peso(a) >= 3 ? b.fechaLimite.localeCompare(a.fechaLimite) : rangoPrioridad(a.prioridad) - rangoPrioridad(b.prioridad) || a.fechaLimite.localeCompare(b.fechaLimite))
    || a.id - b.id);
}

/** Conteos para el resumen de una sección cerrada. */
export function conteos(lista: AcuerdoBase[], hoy: string) {
  const c = { abiertos: 0, vencidos: 0, venceHoy: 0 };
  for (const a of lista) {
    const v = estadoVisible(a, hoy);
    if (v === "vencido") c.vencidos++;
    if (estaAbierto(a.estado)) {
      c.abiertos++;
      if (a.fechaLimite === hoy) c.venceHoy++;
    }
  }
  return c;
}

// ─────────────────────────────────────────────────────────────────
// Indicadores de cumplimiento (fase 2, 19-nov-2026)
//
// El periodo se mide por FECHA LÍMITE: «¿cumplimos lo que vencía en noviembre?». Cada acuerdo cae en una de
// cuatro cajas (los anulados no cuentan):
//   a tiempo   lo entregó (hecho) sin atraso
//   tarde      lo entregó, pero tarde (o se le movió la fecha ya vencida)
//   vencido    sigue abierto y la fecha ya pasó
//   en plazo   sigue abierto y todavía tiene tiempo → aún no se juzga
// % a tiempo = a tiempo ÷ (a tiempo + tarde + vencido). Sin nada que juzgar es null, NO 0%: 0% acusaría
// a alguien que todavía no tuvo ninguna fecha (misma regla del Highlight).

export type AcuerdoIndicador = AcuerdoBase & { tarde: boolean; area: Area; responsableClave: string; responsableNombre: string };
export type Caja = "a_tiempo" | "tarde" | "vencido" | "en_plazo" | "fuera";

export function cajaDe(a: AcuerdoIndicador, hoy: string): Caja {
  if (a.estado === "anulado") return "fuera";
  if (a.estado === "cumplido") return a.tarde ? "tarde" : "a_tiempo";
  return a.fechaLimite < hoy ? "vencido" : "en_plazo";
}

export type Resumen = { aTiempo: number; tarde: number; vencidos: number; enPlazo: number; juzgados: number; pctATiempo: number | null; pctCumplido: number | null };

export function resumir(lista: AcuerdoIndicador[], hoy: string): Resumen {
  const r = { aTiempo: 0, tarde: 0, vencidos: 0, enPlazo: 0 };
  for (const a of lista) {
    const c = cajaDe(a, hoy);
    if (c === "a_tiempo") r.aTiempo++;
    else if (c === "tarde") r.tarde++;
    else if (c === "vencido") r.vencidos++;
    else if (c === "en_plazo") r.enPlazo++;
  }
  const juzgados = r.aTiempo + r.tarde + r.vencidos;
  const pct = (n: number) => (juzgados ? Math.round((n / juzgados) * 100) : null);
  return { ...r, juzgados, pctATiempo: pct(r.aTiempo), pctCumplido: pct(r.aTiempo + r.tarde) };
}

export type Periodo = { desde: string; hasta: string };
export const enPeriodo = (a: { fechaLimite: string }, p: Periodo) => a.fechaLimite >= p.desde && a.fechaLimite <= p.hasta;

/** Peor primero: menor % a tiempo; los que aún no se pueden juzgar, al final. */
const peorPrimero = (a: Resumen, b: Resumen) =>
  (a.pctATiempo ?? 101) - (b.pctATiempo ?? 101) || b.vencidos - a.vencidos || b.juzgados - a.juzgados;

export function indicadores(lista: AcuerdoIndicador[], hoy: string, p: Periodo) {
  const del = lista.filter((a) => a.estado !== "anulado" && enPeriodo(a, p));
  const agrupar = <K extends string>(clave: (a: AcuerdoIndicador) => K, nombre: (a: AcuerdoIndicador) => string) => {
    const m = new Map<K, { nombre: string; items: AcuerdoIndicador[] }>();
    for (const a of del) {
      const k = clave(a);
      const g = m.get(k) ?? { nombre: nombre(a), items: [] };
      g.items.push(a);
      m.set(k, g);
    }
    return [...m.entries()].map(([k, g]) => ({ clave: k, nombre: g.nombre, ...resumir(g.items, hoy) })).sort(peorPrimero);
  };
  return {
    total: resumir(del, hoy),
    porResponsable: agrupar((a) => a.responsableClave, (a) => a.responsableNombre),
    porArea: agrupar((a) => a.area, (a) => AREA_LABEL[a.area]),
  };
}

/** Primer y último día de un mes «YYYY-MM». */
export function periodoMes(mes: string): Periodo {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** Los últimos `n` meses terminando en `mes`, del más viejo al más nuevo. */
export function mesesHasta(mes: string, n: number): string[] {
  const [y, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7));
}

// ─────────────────────────────────────────────────────────────────
// Alertas en pantalla (19-nov-2026). Jahnn dejó los correos para después: los avisos se ven en el panel de
// cada persona. Una alerta es algo que pide moverse YA; lo que tiene tiempo no grita.

export type Alerta = "vencido" | "hoy" | "manana" | "nuevo";

export const ALERTA_LABEL: Record<Alerta, string> = {
  vencido: "Vencido",
  hoy: "Vence hoy",
  manana: "Vence mañana",
  nuevo: "Nuevo",
};

/** Días que una tarea recién asignada se marca como «Nuevo» si nadie la empezó. */
export const DIAS_NUEVO = 2;

/** La alerta más urgente de un acuerdo abierto, o null. `creadoDia` es el día (YYYY-MM-DD, Lima) en que se creó. */
export function alertaDe(a: AcuerdoBase & { creadoDia?: string }, hoy: string): Alerta | null {
  if (!estaAbierto(a.estado)) return null;
  const d = diasRestantes(a.fechaLimite, hoy);
  if (d < 0) return "vencido";
  if (d === 0) return "hoy";
  if (d === 1) return "manana";
  if (a.estado === "pendiente" && a.creadoDia && diasRestantes(hoy, a.creadoDia) < DIAS_NUEVO) return "nuevo";
  return null;
}

const PESO_ALERTA: Record<Alerta, number> = { vencido: 0, hoy: 2, manana: 3, nuevo: 4 };

/** Los acuerdos con alerta, el más urgente primero. */
export function conAlerta<T extends AcuerdoBase & { creadoDia?: string }>(lista: T[], hoy: string): { a: T; alerta: Alerta }[] {
  return lista
    .map((a) => ({ a, alerta: alertaDe(a, hoy) }))
    .filter((x): x is { a: T; alerta: Alerta } => x.alerta !== null)
    .sort((x, y) => PESO_ALERTA[x.alerta] - PESO_ALERTA[y.alerta] || x.a.fechaLimite.localeCompare(y.a.fechaLimite));
}

// ─────────────────────────────────────────────────────────────────
// Resumen ejecutivo semanal (fase 4, 19-nov-2026)
//
// Para la reunión de los lunes: mira la última semana CERRADA (domingo → sábado, la misma del deck,
// lib/kpis/semana-reunion.ts) y la que empieza. Voz de asesor (ver EIRS): termina con recomendaciones
// concretas, no solo con cifras.

export type AcuerdoResumen = AcuerdoIndicador & { id: number; que: string; creadoDia?: string };
export type ReunionResumen = { fecha: string; titulo: string; area: Area };

export type ResumenSemanal = {
  semana: Periodo;
  /** Lo que vencía en la semana: a tiempo, tarde, vencido, en plazo. */
  cumplimiento: Resumen;
  /** % a tiempo de la semana anterior, para comparar. */
  pctAnterior: number | null;
  /** Hoy siguen vencidos (de cualquier semana), el más atrasado primero. */
  arrastrados: (AcuerdoResumen & { diasAtraso: number })[];
  /** Abiertos que vencen en los 7 días siguientes a la semana. */
  proximos: AcuerdoResumen[];
  reuniones: ReunionResumen[];
  /** Acuerdos y tareas creados en la semana. */
  nuevos: number;
  porResponsable: ReturnType<typeof indicadores>["porResponsable"];
  recomendaciones: string[];
};

const moverDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function resumenSemanal(lista: AcuerdoResumen[], reuniones: ReunionResumen[], hoy: string, semana: Periodo): ResumenSemanal {
  const vivos = lista.filter((a) => a.estado !== "anulado");
  const ind = indicadores(vivos, hoy, semana);
  const anterior = resumir(vivos.filter((a) => enPeriodo(a, { desde: moverDias(semana.desde, -7), hasta: moverDias(semana.hasta, -7) })), hoy);
  const sig = { desde: moverDias(semana.hasta, 1), hasta: moverDias(semana.hasta, 7) };
  const arrastrados = vivos
    .filter((a) => estadoVisible(a, hoy) === "vencido")
    .map((a) => ({ ...a, diasAtraso: -diasRestantes(a.fechaLimite, hoy) }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso || a.id - b.id);
  const proximos = vivos.filter((a) => estaAbierto(a.estado) && enPeriodo(a, sig) && a.fechaLimite >= hoy)
    .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite) || a.id - b.id);

  const rec: string[] = [];
  const porPersona = new Map<string, { nombre: string; n: number; max: number }>();
  for (const a of arrastrados) {
    const p = porPersona.get(a.responsableClave) ?? { nombre: a.responsableNombre, n: 0, max: 0 };
    p.n++;
    p.max = Math.max(p.max, a.diasAtraso);
    porPersona.set(a.responsableClave, p);
  }
  const peor = [...porPersona.values()].sort((a, b) => b.n - a.n || b.max - a.max)[0];
  if (peor && (peor.n >= 2 || peor.max >= 7)) {
    rec.push(`Habla con ${peor.nombre}: tiene ${peor.n} ${peor.n === 1 ? "acuerdo vencido" : "acuerdos vencidos"}, el más antiguo hace ${peor.max} ${peor.max === 1 ? "día" : "días"}. Acuerden una fecha nueva realista o reasígnalo.`);
  } else if (arrastrados.length) {
    rec.push(`Cierra los ${arrastrados.length} ${arrastrados.length === 1 ? "vencido" : "vencidos"} en la reunión: cada uno sale con fecha nueva o se anula con su motivo.`);
  }
  const c = ind.total;
  if (c.pctATiempo !== null && c.juzgados >= 3 && c.pctATiempo < 60) {
    rec.push(`Solo el ${c.pctATiempo}% de lo que vencía se cumplió a tiempo. Al asignar, pregunta «¿llegas para esa fecha?» antes de anotarla.`);
  }
  const carga = new Map<string, { nombre: string; n: number }>();
  for (const a of proximos) carga.set(a.responsableClave, { nombre: a.responsableNombre, n: (carga.get(a.responsableClave)?.n ?? 0) + 1 });
  const cargado = [...carga.values()].sort((a, b) => b.n - a.n)[0];
  if (cargado && cargado.n >= 3) rec.push(`${cargado.nombre} tiene ${cargado.n} entregas esta semana: confirma que puede con todas o reparte alguna.`);
  if (rec.length === 0) rec.push(c.juzgados ? "Todo al día: lo que vencía se cumplió. Mantén el ritmo y reconoce al equipo en la reunión." : "Sin acuerdos que vencieran la semana pasada. Usa la reunión para fijar los de esta semana, cada uno con responsable y fecha.");

  return {
    semana,
    cumplimiento: c,
    pctAnterior: anterior.pctATiempo,
    arrastrados,
    proximos,
    reuniones: reuniones.filter((r) => r.fecha >= semana.desde && r.fecha <= semana.hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    nuevos: vivos.filter((a) => a.creadoDia && a.creadoDia >= semana.desde && a.creadoDia <= semana.hasta).length,
    porResponsable: ind.porResponsable,
    recomendaciones: rec.slice(0, 3),
  };
}

// ─────────────────────────────────────────────────────────────────
// Carga del equipo y avance por estado (referencia: informes de Jira, 19-nov-2026)

export type CargaPersona = { clave: string; nombre: string; abiertos: number; vencidos: number; pct: number };

/** Cuánto del trabajo abierto (pendiente o en proceso) tiene cada persona. El que más carga, primero. */
export function cargaEquipo(lista: (AcuerdoBase & { responsableClave: string; responsableNombre: string })[], hoy: string): CargaPersona[] {
  const abiertos = lista.filter((a) => estaAbierto(a.estado));
  const m = new Map<string, CargaPersona>();
  for (const a of abiertos) {
    const p = m.get(a.responsableClave) ?? { clave: a.responsableClave, nombre: a.responsableNombre, abiertos: 0, vencidos: 0, pct: 0 };
    p.abiertos++;
    if (a.fechaLimite < hoy) p.vencidos++;
    m.set(a.responsableClave, p);
  }
  const total = abiertos.length;
  return [...m.values()].map((p) => ({ ...p, pct: Math.round((p.abiertos / total) * 100) }))
    .sort((a, b) => b.abiertos - a.abiertos || b.vencidos - a.vencidos || a.nombre.localeCompare(b.nombre, "es"));
}

export const ESTADOS_AVANCE = ["cumplido", "en_proceso", "vencido", "pendiente"] as const;
export type Avance = { conteo: Record<(typeof ESTADOS_AVANCE)[number], number>; total: number; pctCumplido: number | null };

/**
 * Avance por estado: todo lo abierto más lo que vencía en los últimos `dias` días. El centro de la dona es el
 * % hecho. Sin nada, null (no 0%).
 */
export function avancePorEstado(lista: AcuerdoBase[], hoy: string, dias = 30): Avance {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
  const conteo = { cumplido: 0, en_proceso: 0, vencido: 0, pendiente: 0 };
  for (const a of lista) {
    if (a.estado === "anulado") continue;
    if (!estaAbierto(a.estado) && a.fechaLimite < desde) continue;
    conteo[estadoVisible(a, hoy) as keyof typeof conteo]++;
  }
  const total = Object.values(conteo).reduce((t, n) => t + n, 0);
  return { conteo, total, pctCumplido: total ? Math.round((conteo.cumplido / total) * 100) : null };
}
