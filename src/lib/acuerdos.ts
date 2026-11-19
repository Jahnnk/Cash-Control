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
 *   · El responsable marca «cumplido» y la dirección lo confirma o lo devuelve. Si el responsable es de la
 *     dirección, su «cumplido» vale directo (no tiene a quién pedirle confirmación).
 *   · «A tiempo» lo decide cuándo lo marcó el responsable, no cuándo lo confirmó la dirección.
 *   · Lo tarde queda tarde (`tarde`): devolver o mover la fecha no lava un atraso.
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

/** Lo que se guarda. «Vencido» no se guarda: se calcula con la fecha. */
export const ESTADOS = ["pendiente", "en_proceso", "por_confirmar", "cumplido", "anulado"] as const;
export type EstadoGuardado = (typeof ESTADOS)[number];
export type EstadoVisible = EstadoGuardado | "vencido";

export const ESTADO_LABEL: Record<EstadoVisible, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  por_confirmar: "Por confirmar",
  cumplido: "Cumplido",
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

/** ¿Sigue abierto? (pendiente o en proceso). Lo «por confirmar» ya lo entregó el responsable. */
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

/** Lo que la sesión puede hacer con un acuerdo. */
export type Yo = { clave: string; tipo: TipoPersona };
export type AccionAcuerdo =
  | "avanzar" // pendiente ↔ en proceso, marcar cumplido
  | "confirmar" // confirmar o devolver un «por confirmar»
  | "editar" // qué, área, responsable, fecha
  | "anular"
  | "comentar";

export function puede(yo: Yo, a: { responsableClave: string; creadoPorClave: string; estado: EstadoGuardado }, accion: AccionAcuerdo): boolean {
  const dir = yo.tipo === "direccion";
  const esResp = yo.clave === a.responsableClave;
  const esCreador = yo.clave === a.creadoPorClave;
  if (a.estado === "anulado") return false;
  switch (accion) {
    case "avanzar":
      return estaAbierto(a.estado) && (esResp || dir);
    case "confirmar":
      return a.estado === "por_confirmar" && dir;
    case "editar":
    case "anular":
      return a.estado !== "cumplido" && (dir || esCreador);
    case "comentar":
      return dir || esResp || esCreador || yo.tipo === "equipo";
  }
}

/** Al marcar cumplido: si quien responde es de la dirección, vale directo. */
export function estadoAlCumplir(tipoResponsable: TipoPersona): EstadoGuardado {
  return tipoResponsable === "direccion" ? "cumplido" : "por_confirmar";
}

/** Orden de la lista: vencidos primero, luego por confirmar, luego por fecha límite; cerrados al final. */
export function ordenAcuerdos<T extends AcuerdoBase & { id: number }>(lista: T[], hoy: string): T[] {
  const peso = (a: T) => {
    const v = estadoVisible(a, hoy);
    return v === "vencido" ? 0 : v === "por_confirmar" ? 1 : v === "en_proceso" || v === "pendiente" ? 2 : v === "cumplido" ? 3 : 4;
  };
  return [...lista].sort((a, b) => peso(a) - peso(b) || (peso(a) >= 3 ? b.fechaLimite.localeCompare(a.fechaLimite) : a.fechaLimite.localeCompare(b.fechaLimite)) || a.id - b.id);
}

/** Conteos para el resumen de una sección cerrada. */
export function conteos(lista: AcuerdoBase[], hoy: string) {
  const c = { abiertos: 0, vencidos: 0, porConfirmar: 0, venceHoy: 0 };
  for (const a of lista) {
    const v = estadoVisible(a, hoy);
    if (v === "vencido") c.vencidos++;
    if (v === "por_confirmar") c.porConfirmar++;
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
//   a tiempo   lo entregó (cumplido o por confirmar) sin atraso
//   tarde      lo entregó, pero tarde (o se le movió la fecha ya vencida)
//   vencido    sigue abierto y la fecha ya pasó
//   en plazo   sigue abierto y todavía tiene tiempo → aún no se juzga
// % a tiempo = a tiempo ÷ (a tiempo + tarde + vencido). Sin nada que juzgar es null, NO 0%: 0% acusaría
// a alguien que todavía no tuvo ninguna fecha (misma regla del Highlight).

export type AcuerdoIndicador = AcuerdoBase & { tarde: boolean; area: Area; responsableClave: string; responsableNombre: string };
export type Caja = "a_tiempo" | "tarde" | "vencido" | "en_plazo" | "fuera";

export function cajaDe(a: AcuerdoIndicador, hoy: string): Caja {
  if (a.estado === "anulado") return "fuera";
  if (a.estado === "cumplido" || a.estado === "por_confirmar") return a.tarde ? "tarde" : "a_tiempo";
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

export type Alerta = "vencido" | "hoy" | "manana" | "devuelto" | "nuevo";

export const ALERTA_LABEL: Record<Alerta, string> = {
  vencido: "Vencido",
  hoy: "Vence hoy",
  manana: "Vence mañana",
  devuelto: "Te lo devolvieron",
  nuevo: "Nuevo",
};

/** Días que una tarea recién asignada se marca como «Nuevo» si nadie la empezó. */
export const DIAS_NUEVO = 2;

/** La alerta más urgente de un acuerdo abierto, o null. `creadoDia` es el día (YYYY-MM-DD, Lima) en que se creó. */
export function alertaDe(a: AcuerdoBase & { devuelto?: boolean; creadoDia?: string }, hoy: string): Alerta | null {
  if (!estaAbierto(a.estado)) return null;
  const d = diasRestantes(a.fechaLimite, hoy);
  if (d < 0) return "vencido";
  if (a.devuelto) return "devuelto";
  if (d === 0) return "hoy";
  if (d === 1) return "manana";
  if (a.estado === "pendiente" && a.creadoDia && diasRestantes(hoy, a.creadoDia) < DIAS_NUEVO) return "nuevo";
  return null;
}

const PESO_ALERTA: Record<Alerta, number> = { vencido: 0, devuelto: 1, hoy: 2, manana: 3, nuevo: 4 };

/** Los acuerdos con alerta, el más urgente primero. */
export function conAlerta<T extends AcuerdoBase & { devuelto?: boolean; creadoDia?: string }>(lista: T[], hoy: string): { a: T; alerta: Alerta }[] {
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
  porConfirmar: AcuerdoResumen[];
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
  const porConfirmar = vivos.filter((a) => a.estado === "por_confirmar");

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
  if (porConfirmar.length) {
    rec.push(`Confirma o devuelve ${porConfirmar.length === 1 ? "el cumplido pendiente" : `los ${porConfirmar.length} cumplidos pendientes`}: sin tu revisión, los indicadores no muestran la realidad.`);
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
    porConfirmar,
    reuniones: reuniones.filter((r) => r.fecha >= semana.desde && r.fecha <= semana.hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    nuevos: vivos.filter((a) => a.creadoDia && a.creadoDia >= semana.desde && a.creadoDia <= semana.hasta).length,
    porResponsable: ind.porResponsable,
    recomendaciones: rec.slice(0, 3),
  };
}
