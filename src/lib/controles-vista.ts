/**
 * Cómo se MUESTRAN los controles de fiabilidad, y a quién (lógica pura). Pedido de Jahnn, 24-oct-2026.
 *
 * Los ocho controles no cambian (lib/controles-fiabilidad.ts). Cambia la presentación:
 *   · El CEO ve una línea: si los números del mes son confiables y cuántos pendientes tiene Kelly. Al abrirla, solo
 *     los ROJOS, una fila por problema: Sede · Qué pasa (máx. 4 palabras) · S/ · Quién lo resuelve. Los amarillos
 *     solo se cuentan. Nada de «qué hacer»: no son tareas del CEO.
 *   · Kelly (finanzas) ve el checklist del mes por sede con el «qué hacer» de cada control: rojos primero, luego
 *     amarillos.
 *   · C7 (la app calcula mal) no es tarea de nadie del equipo: lo resuelve el «Sistema».
 */

import type { Control, ControlesMes, EstadoMes, Semaforo } from "./controles-fiabilidad";

export type QuienResuelve = "Kelly" | "Sistema";

/** «Qué pasa», en máximo 4 palabras (etiquetas fijas de Jahnn). */
export function quePasa(c: Control): string {
  switch (c.id) {
    case "C1": return "Excel incompleto";
    case "C2": return "Ventas Byte ≠ Excel";
    case "C3": return "Gastos sin categoría";
    case "C4": return "Banco no cuadra";
    case "C5":
      // El detalle de C5 lo escribe lib/controles-fiabilidad.ts (c5Caja); las pruebas fijan estas frases.
      if (/Caja negativa/.test(c.detalle)) return "Caja en negativo";
      if (/no trae la pestaña CONTROL EFECTIVO/.test(c.detalle)) return "Falta pestaña efectivo";
      return "Efectivo no cuadra";
    case "C6": return "Fila mal anotada";
    case "C7": return "Error de cálculo de la app";
    case "C8": return "Falta Excel del mes";
  }
}

/** Quién lo resuelve: C7 es un error de la app; todo lo demás, Kelly (C2 lo revisa con el administrador de la sede). */
export const quienResuelve = (c: Control): QuienResuelve => (c.id === "C7" ? "Sistema" : "Kelly");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
export const nombreDelMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** S/ sin decimales (vista del CEO): «3,811». */
export const solesSinDecimales = (n: number) => Math.round(n).toLocaleString("es-PE");
/** S/ con decimales (detalle y checklist): «3,810.52». */
export const solesConDecimales = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Datos = { mes: string; sedes: ControlesMes[]; grupo: ControlesMes };

export type FilaCeo = { clave: string; sede: string; quePasa: string; monto: number | null; quien: QuienResuelve; detalle: string; filas: string[] };

export type ResumenCeo = {
  estado: EstadoMes;
  /** La línea, tal cual: «Setiembre · números no confiables · 5 pendientes de Kelly» o «✓ Números de setiembre confiables». */
  texto: string;
  /** «· 2 observaciones» (gris); null sin amarillos. */
  observaciones: string | null;
  /** Un punto por sede (sin «Grupo»: el grupo es el peor de sus sedes). Vacío si todo está verde. */
  puntos: { sede: string; color: Semaforo }[];
  /** Solo los rojos, una fila por problema. */
  filas: FilaCeo[];
};

const COLOR: Record<EstadoMes, Semaforo> = { confiable: "verde", con_observaciones: "amarillo", no_confiable: "rojo" };

/** Los controles de una sede/grupo en un estado (el C7 del grupo solo si falla: los demás ya están en las sedes). */
const controlesCon = (d: Datos, estado: Semaforo) => [
  ...d.sedes.flatMap((s) => s.controles.filter((c) => c.estado === estado).map((c) => ({ sede: s.sede, c }))),
  ...d.grupo.controles.filter((c) => c.estado === estado).map((c) => ({ sede: "Grupo", c })),
];

export function resumenCeo(d: Datos): ResumenCeo {
  const rojos = controlesCon(d, "rojo");
  const amarillos = controlesCon(d, "amarillo");
  const mes = nombreDelMes(d.mes);
  const estado = d.grupo.estado;
  const pendientes = rojos.filter((x) => quienResuelve(x.c) === "Kelly").length;
  const sistema = rojos.length - pendientes;
  const texto = estado === "confiable"
    ? `✓ Números de ${mes} confiables`
    : estado === "no_confiable"
      ? [`${conMayuscula(mes)} · números no confiables`, pendientes ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"} de Kelly` : "", sistema ? `${sistema} error${sistema === 1 ? "" : "es"} de la app` : ""].filter(Boolean).join(" · ")
      : `${conMayuscula(mes)} · números con observaciones`;
  return {
    estado, texto,
    observaciones: estado !== "confiable" && amarillos.length ? `· ${amarillos.length} observaci${amarillos.length === 1 ? "ón" : "ones"}` : null,
    puntos: estado === "confiable" ? [] : d.sedes.map((s) => ({ sede: s.sede, color: COLOR[s.estado] })),
    filas: rojos.map(({ sede, c }) => ({ clave: `${sede}-${c.id}`, sede, quePasa: quePasa(c), monto: c.diferencia, quien: quienResuelve(c), detalle: c.detalle, filas: c.filas ?? [] })),
  };
}

export type TareaKelly = { clave: string; id: Control["id"]; estado: Semaforo; quePasa: string; monto: number | null; detalle: string; queHacer: string; filas: string[] };
export type ChecklistSede = { sede: string; estado: EstadoMes; tareas: TareaKelly[] };

/**
 * El checklist del mes para Kelly: por sede, rojos primero y luego amarillos (los verdes no son tarea). Lo que es un
 * error de la app (C7) no entra: no es tarea suya; va aparte en `sistema`.
 */
export function checklistKelly(d: Datos): { mes: string; sedes: ChecklistSede[]; sistema: FilaCeo[]; pendientes: number } {
  const orden: Record<Semaforo, number> = { rojo: 0, amarillo: 1, verde: 2 };
  const tarea = (c: Control): TareaKelly => ({ clave: c.id, id: c.id, estado: c.estado, quePasa: quePasa(c), monto: c.diferencia, detalle: c.detalle, queHacer: c.queHacer, filas: c.filas ?? [] });
  const sedes = d.sedes.map((s) => ({
    sede: s.sede, estado: s.estado,
    tareas: s.controles.filter((c) => c.estado !== "verde" && quienResuelve(c) === "Kelly")
      .sort((a, b) => orden[a.estado] - orden[b.estado] || a.id.localeCompare(b.id)).map(tarea),
  }));
  const sistema = [...d.sedes.map((s) => ({ sede: s.sede, controles: s.controles })), { sede: "Grupo", controles: d.grupo.controles }]
    .flatMap(({ sede, controles }) => controles.filter((c) => c.estado === "rojo" && quienResuelve(c) === "Sistema")
      .map((c) => ({ clave: `${sede}-${c.id}`, sede, quePasa: quePasa(c), monto: c.diferencia, quien: "Sistema" as const, detalle: c.detalle, filas: c.filas ?? [] })));
  return { mes: nombreDelMes(d.mes), sedes, sistema, pendientes: sedes.reduce((t, s) => t + s.tareas.length, 0) };
}
