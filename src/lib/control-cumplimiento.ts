/**
 * "¿Están todos al día?" — el control de cumplimiento de dirección.
 *
 * Pedido de Jahnn (19-ago-2026): "para mí es muy importante corroborar
 * que los administradores están al día subiendo su información, los
 * KPIs diarios y los archivos que da Byte todos los sábados".
 *
 * ─── El hueco que tenía ───
 *
 * Las DOS mitades ya existían, pero repartidas y desparejas:
 *
 *   · KPIs diarios  → Grupo → Reportes las mostraba bien, 3 sedes × 7 días.
 *   · Los archivos → cada admin los veía en SU panel; dirección solo
 *     veía el de rotación, en otra pantalla. Los otros tres (Cortesías,
 *     Ventas por Trabajador) no llegaban a Jahnn.
 *
 * Así que para saber si el equipo estaba al día había que entrar a tres
 * paneles y cruzarlo de memoria. Esto lo junta en una sola respuesta.
 *
 * ─── Cómo se decide la gravedad ───
 *
 * No todo lo pendiente pesa igual y mezclarlo sería tan inútil como no
 * avisar. El orden que se usa:
 *
 *   1. Días de KPI sin registrar — el dato no vuelve. Si nadie lo carga,
 *      ese día queda sin venta, sin NPS y sin mermas para siempre.
 *   2. Un archivo que NUNCA se subió — no es un olvido de la semana, es
 *      una rutina que no arrancó.
 *   3. Archivos que faltan de ESTA semana — se recuperan el sábado.
 *
 * Y "al día" exige las dos cosas a la vez: KPIs sin huecos Y todos los
 * archivos de la semana. Un verde que se enciende con la mitad hecha es
 * peor que no tener semáforo.
 */

import type { EstadoSemanal } from "./incentivos/reportes-semanales";

export type SedeCumplimiento = {
  businessId: number;
  sede: string;
  /** Días de KPI ya vencidos y sin registrar, dentro de la ventana. */
  diasKpiFaltantes: string[];
  /** Los 4 archivos del sábado. null = no se pudo leer. */
  semanal: EstadoSemanal | null;
};

export type Severidad = "al-dia" | "atencion" | "urgente";

export type SedeEvaluada = {
  businessId: number;
  sede: string;
  severidad: Severidad;
  diasKpiFaltantes: string[];
  archivosFaltantes: string[];
  /** Archivos que no se han subido NUNCA. Subconjunto de los faltantes. */
  archivosNunca: string[];
  /** Frase corta lista para mostrar. */
  resumen: string;
};

export type ControlCumplimiento = {
  sedes: SedeEvaluada[];
  todoAlDia: boolean;
  /** Solo las que tienen algo pendiente, lo más grave primero. */
  pendientes: SedeEvaluada[];
};

const PESO: Record<Severidad, number> = { urgente: 0, atencion: 1, "al-dia": 2 };

export function evaluarSede(s: SedeCumplimiento): SedeEvaluada {
  const archivosFaltantes = (s.semanal?.faltan ?? []).map((f) => f.nombre);
  const archivosNunca = (s.semanal?.faltan ?? [])
    .filter((f) => f.ultimaCarga === null)
    .map((f) => f.nombre);

  const hayKpi = s.diasKpiFaltantes.length > 0;
  const hayNunca = archivosNunca.length > 0;
  const hayArchivos = archivosFaltantes.length > 0;

  // Un día de KPI perdido no se recupera; un archivo de la semana sí.
  const severidad: Severidad =
    hayKpi || hayNunca ? "urgente" : hayArchivos ? "atencion" : "al-dia";

  const partes: string[] = [];
  if (hayKpi) {
    partes.push(
      s.diasKpiFaltantes.length === 1
        ? "1 día de KPIs sin registrar"
        : `${s.diasKpiFaltantes.length} días de KPIs sin registrar`,
    );
  }
  if (hayArchivos) {
    // Cuántos le tocan a ESTA sede, no "4" a secas: a Atelier solo le
    // corresponde el de rotación, y decirle "falta 1 de los 3" sería
    // reclamarle tres archivos que su operación no produce.
    const total = s.semanal?.reportes.length || 3;
    partes.push(
      archivosFaltantes.length === 1
        ? `falta 1 de los ${total} reportes`
        : `faltan ${archivosFaltantes.length} de los ${total} reportes`,
    );
  }

  return {
    businessId: s.businessId,
    sede: s.sede,
    severidad,
    diasKpiFaltantes: s.diasKpiFaltantes,
    archivosFaltantes,
    archivosNunca,
    resumen: partes.length > 0 ? partes.join(" · ") : "Todo al día",
  };
}

export function evaluarCumplimiento(sedes: SedeCumplimiento[]): ControlCumplimiento {
  const evaluadas = sedes.map(evaluarSede);
  const pendientes = evaluadas
    .filter((s) => s.severidad !== "al-dia")
    .sort((a, b) => {
      const p = PESO[a.severidad] - PESO[b.severidad];
      if (p !== 0) return p;
      // A igual gravedad, primero quien más días de KPI debe.
      return b.diasKpiFaltantes.length - a.diasKpiFaltantes.length;
    });

  return { sedes: evaluadas, todoAlDia: pendientes.length === 0, pendientes };
}

/** "Fonavi (2 días de KPIs) · Centro (falta 1 reporte)" */
export function resumenPendientes(c: ControlCumplimiento): string {
  return c.pendientes.map((p) => `${p.sede} (${p.resumen})`).join(" · ");
}
