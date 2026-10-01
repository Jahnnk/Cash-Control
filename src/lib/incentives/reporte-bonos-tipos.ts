/**
 * Los datos que viajan entre el servidor y el reporte de Bonos e Incentivos
 * (PDF y Excel). Solo tipos: sin lógica, para que tanto las acciones del
 * servidor como los dibujantes del navegador hablen del mismo objeto.
 */

import type { EstadoCandadoVentas } from "./candado-ventas";
import type { OrigenHoras } from "./horas-planilla";

export type JornadaBono = "tiempo_completo" | "medio_turno" | "administrador";

/** Lo que se le paga a UNA persona, con de dónde sale cada número. */
export type PagoColaborador = {
  name: string;
  /** Documento de identidad: lo que Kelly necesita para la transferencia. */
  dni: string | null;
  jornada: JornadaBono;
  /** Horas con las que se calculó el bono (null = tabla fija, sin horas). */
  horasMes: number | null;
  /** true = horas que Planilla tiene; false = las del contrato. */
  horasReales: boolean;
  /** De dónde salen las horas en Planilla (null si no se pudo leer el desglose). */
  origenHoras: OrigenHoras | null;
  horasBase: number | null;
  /** Faltas, en horas. */
  horasMenos: number;
  /** Tiempo extra y horas no marcadas, en horas. */
  horasMas: number;
  bono: number;
  premioMv: number;
  /** bono + premio: lo que se transfiere. */
  total: number;
};

/** El pago del mes de una sede: lo que Kelly reparte. */
export type PagoSede = {
  businessId: number;
  sede: string;
  month: string;
  /** «acta» = el mes ya está cerrado (cifras congeladas); «vista-previa» = cálculo de hoy. */
  fuente: "acta" | "vista-previa";
  cerradaEn: string | null;
  /** Nivel de ticket alcanzado (null = sin nivel: no hay bono). */
  nivel: string | null;
  /** Lo que vale la hora de bono en ese nivel (bono medio turno ÷ 94 h). */
  tarifaHora: number | null;
  totalBonos: number;
  /** El pozo real del mes: el techo de lo que se puede pagar. */
  pozo: number | null;
  /** Lo que vale el premio al mejor vendedor en el nivel alcanzado (0 sin nivel). */
  premioDelNivel: number;
  mejorVendedor: {
    /** Quien ganó según el reporte de Byte (nombre completo de Byte). */
    sugeridoByte: string | null;
    /** Esa misma persona, ya emparejada con el equipo (null si no se pudo con seguridad). */
    sugeridoEquipo: string | null;
    /** A quién se le suma el premio en estas cifras (nombre del equipo). */
    usado: string | null;
    premio: number;
  };
  /** Todo el equipo activo, para poder elegir a quién premiar. */
  equipo: string[];
  lines: PagoColaborador[];
  warnings: string[];
  blockers: string[];
  /** Última vez que se comprobó el equipo contra Planilla. */
  sincronizadoEn: string | null;
  /** Meta de ventas del mes y cómo va (informativa o requisito, según el mes). */
  ventas: EstadoCandadoVentas | null;
  /** Qué reglas rigen ESE mes (cambian con la política: setiembre no es igual a octubre). */
  politica: {
    requiereEquilibrio: boolean;
    requiereSupervision: boolean;
    trafficFloor: number | null;
  };
};

export type PagosDelMes = {
  month: string;
  generadoEn: string;
  sedes: PagoSede[];
  /** Sedes para las que no se pudo calcular el pago (ej. un mes sin configuración del programa). */
  errores: string[];
};
