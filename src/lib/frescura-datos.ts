/**
 * ¿Hasta cuándo tenemos datos? · MOTOR (lógica pura).
 *
 * ─── Por qué existe, si ya había dos tarjetas ───
 *
 * Había dos —"Cargas de Excel por sede" y "¿Hasta cuándo hay datos?"— y
 * las dos vivían DETRÁS del botón "Ver detalle operativo" del dashboard
 * de Grupo, plegadas por omisión. O sea: la información existía y no se
 * veía nunca.
 *
 * Jahnn (9-sep-2026): "Kelly debería darme sus excel actualizados cada
 * viernes, pero a veces se retrasa… me gustaría que el sistema me diga
 * hasta cuándo tenemos datos, que sea lo primero que me jale la vista".
 *
 * Este módulo produce UNA frase —no un panel— para poner arriba del todo
 * en Reportes del Grupo y en el dashboard. Las dos tarjetas siguen
 * existiendo para el detalle; lo que faltaba era el titular.
 *
 * ─── La regla, y por qué el grupo vale por su peor sede ───
 *
 * Un reporte del grupo suma las tres sedes. Si Atelier llega al 3 de
 * setiembre y Centro al 7, el consolidado NO llega al 7: llega al 3,
 * porque del 4 al 7 le faltaría una sede. Por eso el corte del grupo es
 * el MÍNIMO de las tres y no el máximo ni el promedio. Mostrar el máximo
 * sería la mentira cómoda.
 *
 * El semáforo se mide contra el acuerdo real (Kelly entrega los
 * viernes), no contra "hoy": pedirle datos de ayer un martes sería
 * absurdo. Una semana de rezago es lo pactado; dos, un atraso; más de
 * dos, algo se rompió.
 */

export type EstadoFrescura = "al_dia" | "atrasado" | "muy_atrasado" | "sin_datos";

export type SedeFrescura = {
  businessId: number;
  name: string;
  /** Última fecha con movimiento financiero. null = sin datos. */
  lastDate: string | null;
};

export type FrescuraGrupo = {
  /** El corte del GRUPO: la fecha de la sede más atrasada. */
  hasta: string | null;
  /** Días entre ese corte y hoy. */
  diasAtraso: number | null;
  /** Quién arrastra al grupo (puede ser más de una si empatan). */
  masAtrasadas: string[];
  /** Las sedes ordenadas de la más atrasada a la más al día. */
  sedes: (SedeFrescura & { diasAtraso: number | null })[];
  estado: EstadoFrescura;
  /** La frase que va arriba del todo. Una línea. */
  titular: string;
  /** Qué pedirle a Kelly, si hay algo que pedir. null = nada pendiente. */
  accion: string | null;
  /**
   * Cuándo toca la próxima entrega (el viernes). Va SIEMPRE, incluso al
   * día: la pregunta de Jahnn no es solo "¿falta algo?" sino "¿estoy
   * esperando algo?", y saber que el viernes llega lo siguiente evita
   * pedirle a Kelly un martes lo que iba a llegar igual.
   */
  proximaEntrega: string;
};

/**
 * Días de rezago que el acuerdo admite. Kelly entrega los viernes, así
 * que un lunes es normal tener datos hasta el jueves o viernes previo.
 * A los 8 días ya se saltó una entrega.
 */
export const DIAS_ACUERDO = 7;
export const DIAS_ALARMA = 14;

const diasEntre = (desde: string, hasta: string): number =>
  Math.max(0, Math.round(
    (new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86400000,
  ));

/** "3 de setiembre" — para leerlo en voz alta, no "03/09". */
export function fechaLarga(iso: string | null): string {
  if (!iso) return "—";
  const MESES = ["enero","febrero","marzo","abril","mayo","junio",
                 "julio","agosto","setiembre","octubre","noviembre","diciembre"];
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1] ?? ""}`;
}

/** El próximo viernes (o hoy, si hoy es viernes). */
export function proximoViernes(todayISO: string): string {
  const d = new Date(todayISO + "T00:00:00Z");
  const falta = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + falta);
  return d.toISOString().slice(0, 10);
}

export function resumirFrescura(input: {
  todayISO: string;
  sedes: SedeFrescura[];
}): FrescuraGrupo {
  const { todayISO } = input;
  const sedes = input.sedes
    .map((s) => ({ ...s, diasAtraso: s.lastDate ? diasEntre(s.lastDate, todayISO) : null }))
    // Sin datos primero (es lo más grave), luego de más atrasada a menos.
    .sort((a, b) => (b.diasAtraso ?? Infinity) - (a.diasAtraso ?? Infinity));

  const conDatos = sedes.filter((s) => s.lastDate !== null);
  if (conDatos.length === 0) {
    return {
      hasta: null, diasAtraso: null, masAtrasadas: sedes.map((s) => s.name), sedes,
      estado: "sin_datos",
      titular: "No hay datos financieros cargados en ninguna sede.",
      accion: "Sube los Excels de Kelly desde Configuración de cada sede.",
      proximaEntrega: proximoViernes(todayISO),
    };
  }

  // El corte del grupo es el de la sede MÁS atrasada: el consolidado no
  // puede llegar más lejos que su eslabón más corto.
  const sinDatos = sedes.filter((s) => s.lastDate === null);
  const hasta = conDatos.reduce((min, s) => (s.lastDate! < min ? s.lastDate! : min), conDatos[0].lastDate!);
  const diasAtraso = diasEntre(hasta, todayISO);

  const estado: EstadoFrescura =
    sinDatos.length > 0 ? "muy_atrasado"
    : diasAtraso <= DIAS_ACUERDO ? "al_dia"
    : diasAtraso <= DIAS_ALARMA ? "atrasado"
    : "muy_atrasado";

  const masAtrasadas =
    sinDatos.length > 0
      ? sinDatos.map((s) => s.name)
      : sedes.filter((s) => s.lastDate === hasta).map((s) => s.name);

  const quienes = masAtrasadas.join(" y ");
  const cuando = fechaLarga(hasta);
  const dia = diasAtraso === 0 ? "hoy mismo" : diasAtraso === 1 ? "hace 1 día" : `hace ${diasAtraso} días`;

  const titular =
    estado === "al_dia"
      ? `Tenemos datos hasta el ${cuando} (${dia}).`
      : sinDatos.length > 0
        ? `Tenemos datos hasta el ${cuando}, pero ${quienes} no tiene ninguno cargado.`
        : `Tenemos datos solo hasta el ${cuando} — ${dia}. ${quienes} es la sede que va más atrás.`;

  const accion =
    estado === "al_dia"
      ? null
      : `Pídele a Kelly el Excel de ${quienes} desde el ${fechaLarga(siguienteDia(hasta))} en adelante.`;

  return { hasta, diasAtraso, masAtrasadas, sedes, estado, titular, accion, proximaEntrega: proximoViernes(todayISO) };
}

/** El día siguiente a una fecha, que es desde donde falta pedir. */
export function siguienteDia(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
