/**
 * ¿Están al día los reportes de las 3 sedes? — pedido de Jahnn (16-ago-2026):
 * "saber a primer vistazo si los reportes están al día todos, o qué sede
 * falta llenar y en qué día".
 *
 * Lógica pura y testeable: recibe los días ya cargados y devuelve el
 * estado de cada casilla sede × día. La pantalla solo pinta.
 *
 * Tres decisiones que evitan alarmas falsas:
 *
 *  1. Un día FUTURO no falta — todavía no pasó.
 *  2. Un día ANTERIOR a que la sede entrara al sistema no falta: Fonavi
 *     arrancó el 01-ago y marcarle julio en rojo sería mentir.
 *  3. El día de HOY no se cuenta como falta: el administrador cierra al
 *     final de la jornada. Se muestra aparte como "pendiente de hoy",
 *     que es un aviso, no una deuda.
 *  4. Cada sede declara QUÉ DÍAS de la semana se espera que registre.
 *     Atelier no reporta domingos: es el día libre de su administrador
 *     (decisión de Jahnn, 16-ago-2026). Marcárselo en rojo cada semana
 *     sería ruido garantizado.
 *
 * Lo de los días esperados es un DATO, no una regla escrita en la
 * lógica: si mañana Atelier pasa a reportar de lunes a domingo, se
 * cambia la lista y ya. Y si un domingo SÍ registran, se pinta como
 * cualquier día lleno — el dato real siempre gana sobre lo esperado.
 *
 * Además distingue FALTA de INCOMPLETO: si está la venta pero no el NPS,
 * el reporte existe y solo le falta un dato. Son problemas distintos y
 * se persiguen distinto.
 */

export type EstadoDia =
  | "lleno"         // todo lo esperable está
  | "incompleto"    // hay venta pero falta algún dato (NPS, mermas)
  | "falta"         // no hay registro y ya debería haberlo
  | "hoy"           // es hoy y aún no registra: normal hasta el cierre
  | "futuro"        // todavía no llega
  | "dia-libre"     // esa sede no reporta ese día de la semana
  | "sin-operar";   // la sede aún no existía en el sistema

export type DiaLlenado = {
  fecha: string;
  estado: EstadoDia;
  /** Qué dato falta, cuando el estado es "incompleto". */
  faltan: string[];
};

export type SedeLlenado = {
  businessId: number;
  sede: string;
  /** Atelier no lleva NPS ni tiempos: su registro sale del reporte de Byte. */
  esCafeteria: boolean;
  dias: DiaLlenado[];
  faltan: number;
  incompletos: number;
};

export type EstadoLlenado = {
  weekStart: string;
  hoy: string;
  sedes: SedeLlenado[];
  /** true si no falta ningún día ya vencido en ninguna sede. */
  alDia: boolean;
  totalFaltan: number;
  totalIncompletos: number;
  /** Sedes que aún no registran HOY (aviso, no deuda). */
  pendientesHoy: string[];
};

export type FilaDia = {
  businessId: number;
  fecha: string;
  revenue: number | null;
  nps: number | null;
  mermas: number | null;
};

export type SedeInfo = {
  businessId: number;
  sede: string;
  /** Desde cuándo la sede opera en el sistema. null = siempre. */
  desde: string | null;
  esCafeteria: boolean;
  /**
   * Días de la semana en que SÍ se espera registro (0=dom … 6=sáb).
   * Un día fuera de esta lista no cuenta como falta, pero si igual
   * llega el dato se muestra normalmente.
   */
  diasEsperados: number[];
};

/** Los 7 días. Es lo normal para una sede que reporta todos los días. */
export const TODA_LA_SEMANA = [0, 1, 2, 3, 4, 5, 6];

/** Lunes a sábado: para quien libra los domingos. */
export const LUNES_A_SABADO = [1, 2, 3, 4, 5, 6];

/** Día de la semana (0=dom) de una fecha ISO, sin líos de zona horaria. */
function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Los 7 días de la semana que arranca en `weekStart` (domingo). */
export function diasDeLaSemana(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const f = new Date(Date.UTC(y, m - 1, d + i));
    return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(
      f.getUTCDate(),
    ).padStart(2, "0")}`;
  });
}

export function evaluarLlenado(input: {
  weekStart: string;
  hoy: string;
  sedes: SedeInfo[];
  filas: FilaDia[];
}): EstadoLlenado {
  const { weekStart, hoy, sedes, filas } = input;
  const fechas = diasDeLaSemana(weekStart);

  const porSede: SedeLlenado[] = sedes.map((s) => {
    const dias: DiaLlenado[] = fechas.map((fecha) => {
      if (fecha > hoy) return { fecha, estado: "futuro", faltan: [] };
      if (s.desde && fecha < s.desde) return { fecha, estado: "sin-operar", faltan: [] };

      const fila = filas.find((f) => f.businessId === s.businessId && f.fecha === fecha);
      const tieneVenta = fila != null && fila.revenue != null;

      if (!tieneVenta) {
        // El dato manda sobre lo esperado, así que esto se pregunta
        // DESPUÉS de descartar que haya registro: un domingo con datos
        // se pinta como cualquier otro día lleno.
        if (!s.diasEsperados.includes(diaSemana(fecha))) {
          return { fecha, estado: "dia-libre", faltan: [] };
        }
        // Hoy todavía no vence: el cierre se hace al terminar la jornada.
        return { fecha, estado: fecha === hoy ? "hoy" : "falta", faltan: [] };
      }

      // Con venta cargada, se revisa qué más se espera de esa sede.
      const faltan: string[] = [];
      if (s.esCafeteria) {
        if (fila!.nps == null) faltan.push("NPS");
        if (fila!.mermas == null) faltan.push("mermas");
      }
      return { fecha, estado: faltan.length > 0 ? "incompleto" : "lleno", faltan };
    });

    return {
      businessId: s.businessId,
      sede: s.sede,
      esCafeteria: s.esCafeteria,
      dias,
      faltan: dias.filter((d) => d.estado === "falta").length,
      incompletos: dias.filter((d) => d.estado === "incompleto").length,
    };
  });

  return {
    weekStart,
    hoy,
    sedes: porSede,
    alDia: porSede.every((s) => s.faltan === 0),
    totalFaltan: porSede.reduce((a, s) => a + s.faltan, 0),
    totalIncompletos: porSede.reduce((a, s) => a + s.incompletos, 0),
    pendientesHoy: porSede
      .filter((s) => s.dias.some((d) => d.estado === "hoy"))
      .map((s) => s.sede),
  };
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "lun 11" — para nombrar el día que falta en el resumen. */
export function etiquetaDia(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_CORTOS[dow]} ${d}`;
}

/**
 * Resumen en una frase: "Fonavi (dom 9) · Atelier (dom 9, lun 10)".
 * Vacío si no falta nada — la pantalla decide qué decir en ese caso.
 */
export function resumenFaltantes(estado: EstadoLlenado): string {
  return estado.sedes
    .filter((s) => s.faltan > 0)
    .map((s) => {
      const dias = s.dias
        .filter((d) => d.estado === "falta")
        .map((d) => etiquetaDia(d.fecha))
        .join(", ");
      return `${s.sede} (${dias})`;
    })
    .join(" · ");
}
