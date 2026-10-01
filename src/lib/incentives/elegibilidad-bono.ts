/**
 * Quién entra al bono de un mes · lógica PURA.
 *
 * Reglas de Jahnn (1-oct-2026, al revisar septiembre):
 *
 *  · Quien ya figura CESADO pero hizo el mes completo cobra su parte. Junior
 *    (Centro) se fue el 30 de septiembre: aunque hoy figure cesado, trabajó
 *    todo el mes. Quién cuenta como "hizo el mes completo" lo decide la
 *    lectura de Planilla (planilla-db.ts); aquí solo se distingue.
 *  · Quien está en PERIODO DE PRUEBA no cobra ese mes. Ghyan ingresó a Centro
 *    el 30 de septiembre. La regla automática lo reconoce por su fecha de
 *    ingreso: si entró después del día 1 del mes, no hizo el mes completo.
 *
 * Límite de la regla automática: solo deja afuera el MES de ingreso, y la
 * prueba dura más. Por eso existen las EXCEPCIONES (tabla bono_exclusiones,
 * las decide Jahnn): "excluir" a alguien de un periodo (ej. de octubre a
 * diciembre) o "incluir" a alguien que la regla dejó afuera (ej. una
 * administradora que ingresó a mitad de mes pero sí debe cobrar). La fecha de
 * ingreso no sirve para inferirlo todo: en Fonavi varias son de un segundo
 * registro y no del primer día de trabajo.
 */

export type PersonaDelMes = {
  dni: string;
  nombre: string;
  estado: string;
  fechaIngreso: string | null;
  fechaCese: string | null;
};

/** Una excepción decidida por la dirección. */
export type ReglaExcepcion = {
  id: number;
  dni: string;
  accion: "excluir" | "incluir";
  desdeMes: string;
  /** null = sin fin. */
  hastaMes: string | null;
  motivo: string;
};

export type Excluido = {
  dni: string;
  /** null si no se encontró en Planilla (la excepción es de alguien que ya no figura). */
  nombre: string | null;
  motivo: string;
  origen: "automatico" | "manual";
  /** La excepción manual que lo excluye (para poder quitarla). */
  reglaId: number | null;
};

export type Elegibilidad = {
  /** Figuran cesados pero hicieron el mes completo: sí cobran. */
  cesadosQueCobran: PersonaDelMes[];
  /** Los que NO cobran este mes y por qué. Indexados por DNI. */
  excluidos: Map<string, Excluido>;
  /** Los que la regla automática dejaba afuera pero una excepción manda cobrar. */
  incluidosPorExcepcion: { dni: string; nombre: string | null; motivo: string; reglaId: number }[];
};

const aplicaEnMes = (r: ReglaExcepcion, month: string) =>
  r.desdeMes <= month && (r.hastaMes === null || r.hastaMes >= month);

export function elegibilidadDelMes(personas: PersonaDelMes[], month: string, reglas: ReglaExcepcion[] = []): Elegibilidad {
  const inicio = `${month}-01`;
  const vigentes = reglas.filter((r) => aplicaEnMes(r, month));
  const nombreDe = new Map(personas.map((p) => [p.dni, p.nombre]));
  const excluidos = new Map<string, Excluido>();
  const incluidosPorExcepcion: Elegibilidad["incluidosPorExcepcion"] = [];

  // 1) La regla automática: ingresó después del día 1 = prueba.
  for (const p of personas) {
    if (p.fechaIngreso !== null && p.fechaIngreso > inicio) {
      const dd = p.fechaIngreso.slice(8, 10);
      const mm = p.fechaIngreso.slice(5, 7);
      excluidos.set(p.dni, { dni: p.dni, nombre: p.nombre, motivo: `ingresó el ${dd}/${mm} y está en periodo de prueba`, origen: "automatico", reglaId: null });
    }
  }
  // 2) Las excepciones de la dirección mandan sobre la regla automática.
  for (const r of vigentes) {
    if (r.accion === "incluir") {
      if (excluidos.delete(r.dni)) incluidosPorExcepcion.push({ dni: r.dni, nombre: nombreDe.get(r.dni) ?? null, motivo: r.motivo, reglaId: r.id });
    }
  }
  for (const r of vigentes) {
    if (r.accion === "excluir") {
      excluidos.set(r.dni, { dni: r.dni, nombre: nombreDe.get(r.dni) ?? null, motivo: r.motivo, origen: "manual", reglaId: r.id });
    }
  }
  return { cesadosQueCobran: personas.filter((p) => p.estado !== "activo"), excluidos, incluidosPorExcepcion };
}
