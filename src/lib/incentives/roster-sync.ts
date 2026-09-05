/**
 * Espeja el roster de PLANILLA en el de bonos de Cash Control.
 *
 * Pedido de Jahnn (5-sep-2026): "que se sincronice el sistema de planilla
 * con el de CashControl para el manejo de horas y colaboradores; cuando
 * alguien salga, se le dé de baja en planilla o se le cambien las horas,
 * automáticamente CashControl se entera".
 *
 * ─── Una sola fuente de verdad ───
 *
 * Planilla manda, siempre. Cash Control no edita el roster: lo refleja.
 * Es la regla que faltaba en agosto, cuando el sistema pagó a Micaela
 * (que ya no trabajaba) y no pagó a Piero (que sí, 80 h).
 *
 * ─── Lo que este módulo NO hace ───
 *
 * No borra a nadie. Una baja es `active = false`: el histórico de
 * liquidaciones ya cerradas tiene que seguir mostrando a quien cobró,
 * aunque hoy no trabaje. Borrar la fila reescribiría actas pasadas.
 *
 * Tampoco inventa una jornada cuando el dato no alcanza: si Planilla no
 * dice las horas, la persona entra sin ellas y el motor cae a la tabla
 * fija. Nadie pierde plata por un dato faltante.
 */

/** Una persona tal como la conoce PLANILLA (la fuente). */
export type TrabajadorPlanilla = {
  dni: string;
  nombre: string;
  /** Área de Planilla: "Asesores", "Cocina", "Administrativos"… */
  area: string | null;
  horasSemanales: number | null;
};

/** Una persona tal como está hoy en el roster de bonos. */
export type StaffCash = {
  id: string;
  name: string;
  dni: string | null;
  area: string;
  jornada: JornadaCash;
  horasSemanales: number | null;
  active: boolean;
};

export type JornadaCash = "tiempo_completo" | "medio_turno" | "administrador";

/** Horas semanales desde las que se considera jornada completa. */
export const HORAS_TIEMPO_COMPLETO = 48;

/**
 * Qué jornada le toca a alguien según Planilla.
 *
 * El área manda sobre las horas: una administradora con 48 h no es
 * "tiempo completo" para el bono, porque su tabla es otra (Chari cobra
 * S/179 donde un asesor de 48 h cobra S/98).
 */
export function derivarJornada(area: string | null, horasSemanales: number | null): JornadaCash {
  if (area && /administrativ/i.test(area)) return "administrador";
  if (horasSemanales !== null && horasSemanales >= HORAS_TIEMPO_COMPLETO) return "tiempo_completo";
  return "medio_turno";
}

/** El área de Planilla traducida al vocabulario de Cash Control. */
export function derivarArea(area: string | null): string {
  if (!area) return "salon";
  if (/administrativ/i.test(area)) return "administracion";
  if (/cocina|panader|pasteler/i.test(area)) return "cocina";
  if (/limpieza/i.test(area)) return "limpieza";
  return "salon";
}

/**
 * El nombre corto con el que el equipo se conoce ("Teresa", no "Teresa
 * Elena Briones Suarez"). Se usa SOLO al dar de alta a alguien nuevo: si
 * la persona ya existe en Cash Control, su nombre no se toca — puede
 * haber sido ajustado a mano y es como aparece en las actas firmadas.
 */
export function nombreCorto(nombreCompleto: string): string {
  const limpio = nombreCompleto.trim().replace(/\s+/g, " ");
  const primero = limpio.split(" ")[0] ?? limpio;
  // "MILAGROS" → "Milagros": Planilla mezcla MAYÚSCULAS y capitalizado.
  return capitalizar(primero);
}

function capitalizar(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/**
 * El nombre corto, garantizando que no choque con otro del roster.
 *
 * Fonavi tiene DOS Pieros: Piero André Manosalva y Piero Renato Obando.
 * Con solo el nombre de pila serían dos filas idénticas en la lista de
 * pago, y nadie podría decir a quién le toca cuál. Cuando hay choque se
 * agrega el apellido, y si aun así chocan, el segundo apellido.
 */
export function nombreCortoUnico(nombreCompleto: string, tomados: Set<string>): string {
  const partes = nombreCompleto.trim().replace(/\s+/g, " ").split(" ").map(capitalizar);
  const clave = (n: string) => n.toLowerCase();

  for (let n = 1; n <= partes.length; n++) {
    // Nombre de pila, luego + apellido, luego + segundo apellido.
    const cand = n === 1 ? partes[0] : `${partes[0]} ${partes.slice(1, n).join(" ")}`;
    if (!tomados.has(clave(cand))) return cand;
  }
  // Todo el nombre ya estaba tomado: se devuelve completo igual, para no
  // quedarse sin nombre. Es preferible un duplicado visible a una fila
  // sin identificar.
  return partes.join(" ");
}

export type PlanDeSync = {
  altas: { dni: string; name: string; area: string; jornada: JornadaCash; horasSemanales: number | null }[];
  bajas: { id: string; name: string; motivo: string }[];
  cambios: { id: string; name: string; campo: "horasSemanales" | "jornada"; de: string; a: string }[];
  reactivaciones: { id: string; name: string }[];
  /** Gente del roster sin DNI: no se puede emparejar, se avisa. */
  sinDni: { id: string; name: string }[];
};

/**
 * Compara los dos lados y devuelve QUÉ habría que hacer, sin hacerlo.
 * Separar el plan de la escritura es lo que permite mostrarlo antes de
 * aplicarlo y probarlo sin base de datos.
 */
export function planificarSync(enPlanilla: TrabajadorPlanilla[], enCash: StaffCash[]): PlanDeSync {
  const plan: PlanDeSync = { altas: [], bajas: [], cambios: [], reactivaciones: [], sinDni: [] };
  const porDni = new Map(enPlanilla.map((t) => [t.dni, t]));

  for (const s of enCash) {
    if (!s.dni) {
      // Sin DNI no hay forma segura de emparejar. NO se da de baja por
      // las dudas: dejar a alguien sin bono por un dato faltante es peor
      // que pagarle de más un mes.
      if (s.active) plan.sinDni.push({ id: s.id, name: s.name });
      continue;
    }
    const enPl = porDni.get(s.dni);

    if (!enPl) {
      if (s.active) {
        plan.bajas.push({ id: s.id, name: s.name, motivo: "ya no figura activo en Planilla" });
      }
      continue;
    }

    if (!s.active) {
      plan.reactivaciones.push({ id: s.id, name: s.name });
    }

    if (enPl.horasSemanales !== null && enPl.horasSemanales !== s.horasSemanales) {
      plan.cambios.push({
        id: s.id, name: s.name, campo: "horasSemanales",
        de: String(s.horasSemanales ?? "—"), a: String(enPl.horasSemanales),
      });
    }
    const jornada = derivarJornada(enPl.area, enPl.horasSemanales);
    if (jornada !== s.jornada) {
      plan.cambios.push({ id: s.id, name: s.name, campo: "jornada", de: s.jornada, a: jornada });
    }
  }

  const dnisEnCash = new Set(enCash.map((s) => s.dni).filter(Boolean));
  // Los nombres ya usados: los del roster actual más los que se vayan
  // creando en esta misma pasada.
  const tomados = new Set(enCash.map((s) => s.name.trim().toLowerCase()));
  for (const t of enPlanilla) {
    if (dnisEnCash.has(t.dni)) continue;
    const name = nombreCortoUnico(t.nombre, tomados);
    tomados.add(name.toLowerCase());
    plan.altas.push({
      dni: t.dni,
      name,
      area: derivarArea(t.area),
      jornada: derivarJornada(t.area, t.horasSemanales),
      horasSemanales: t.horasSemanales,
    });
  }

  return plan;
}

/** true si el plan no cambia nada. */
export function planVacio(p: PlanDeSync): boolean {
  return p.altas.length === 0 && p.bajas.length === 0 &&
    p.cambios.length === 0 && p.reactivaciones.length === 0;
}
