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
