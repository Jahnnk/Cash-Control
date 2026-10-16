/**
 * Por qué cada monto del bono · lógica PURA.
 *
 * Pedido de Jahnn (16-oct-2026): una tarjeta interactiva, corta y fácil, que explique por qué cada sede
 * tiene que repartir lo que reparte en cada nivel (Fonavi S/538 y Centro S/391 en el Nivel 1 eran correctos,
 * pero nadie lo entendía de un vistazo). La transparencia es el motor del programa.
 *
 * No calcula nada nuevo: usa las MISMAS funciones del motor (bonoDeColaborador, bonusTableSum), así la
 * explicación no puede contradecir el número de la tarjeta de arriba.
 *
 *   total del nivel = Σ bono de cada persona + premio al mejor vendedor
 *   bono de una persona = sus horas del mes × la tarifa por hora del nivel (el administrador, un monto fijo por puesto)
 *   tarifa por hora = bono del medio turno ÷ 94 horas (23.5 h/semana × 4)
 *   colchón = pozo del nivel − total del nivel
 */

import { bonoDeColaborador, bonusTableSum, horasDelMes, tarifaHoraBono, HORAS_MES_MEDIO_TURNO, type IncentiveLevel, type StaffMember } from "./engine";

export type PersonaExplicada = {
  nombre: string;
  rol: "Administración" | "Tiempo completo" | "Medio turno";
  esAdmin: boolean;
  /** Horas del mes con las que se calcula (null = sin dato: se usa la tabla fija). */
  horas: number | null;
  /** Lo que cobra en cada nivel, en el mismo orden que `niveles`. */
  montos: number[];
};

export type NivelExplicado = {
  nombre: string;
  /** Cuánto se reparte en total: personas + premio. */
  total: number;
  sumaPersonas: number;
  premioMv: number;
  /** Lo que vale una hora de bono en este nivel. */
  tarifaHora: number;
  bonoMedioTurno: number;
  bonoTiempoCompleto: number;
  bonoAdmin: number;
  pozo: number | null;
  colchon: number | null;
};

export type ExplicacionBono = {
  /** De dónde salen las horas: las trabajadas del mes (Planilla) o las del contrato. */
  horasDe: "planilla" | "contrato";
  horasMedioTurno: number;
  personas: PersonaExplicada[];
  niveles: NivelExplicado[];
  excluidos: { nombre: string; motivo: string }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ROL: Record<StaffMember["jornada"], PersonaExplicada["rol"]> = { administrador: "Administración", tiempo_completo: "Tiempo completo", medio_turno: "Medio turno" };

export function explicarBono(e: {
  staff: StaffMember[];
  levels: IncentiveLevel[];
  porNivel: { level: IncentiveLevel; pozoNivel: number | null; colchon: number | null }[];
  excluidos: { nombre: string; motivo: string }[];
  usaTrabajadas: boolean;
}): ExplicacionBono {
  const niveles = [...e.levels].sort((a, b) => a.delta - b.delta);
  const activos = e.staff.filter((s) => s.active);

  const personas: PersonaExplicada[] = activos.map((s) => ({
    nombre: s.name, rol: ROL[s.jornada], esAdmin: s.jornada === "administrador",
    horas: horasDelMes(s) !== null ? r2(horasDelMes(s)!) : null,
    montos: niveles.map((l) => bonoDeColaborador(s, l)),
  })).sort((a, b) => Number(b.esAdmin) - Number(a.esAdmin) || b.montos[0] - a.montos[0] || a.nombre.localeCompare(b.nombre));

  return {
    horasDe: e.usaTrabajadas ? "planilla" : "contrato",
    horasMedioTurno: HORAS_MES_MEDIO_TURNO,
    personas,
    niveles: niveles.map((l) => {
      const total = bonusTableSum(activos, l);
      const p = e.porNivel.find((x) => x.level.nombre === l.nombre);
      return {
        nombre: l.nombre, total, sumaPersonas: r2(total - l.premio_mv), premioMv: l.premio_mv,
        tarifaHora: Math.round(tarifaHoraBono(l) * 10000) / 10000, bonoMedioTurno: l.bono_mt, bonoTiempoCompleto: l.bono_tc, bonoAdmin: l.bono_admin,
        pozo: p?.pozoNivel ?? null, colchon: p?.colchon ?? null,
      };
    }),
    excluidos: e.excluidos,
  };
}
