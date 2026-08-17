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

/**
 * La fecha `n` días antes. Sirve para armar la ventana móvil de los
 * últimos 7 días que ve el administrador en su panel: a él le importa
 * "lo que se me está pasando", no el calendario de domingo a sábado.
 */
export function restarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d - n));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(
    f.getUTCDate(),
  ).padStart(2, "0")}`;
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

/**
 * Días seguidos con registro, contando hacia atrás desde AYER.
 *
 * Hoy se salta a propósito: el día sigue abierto y no debe leerse como
 * si ya hubiera cortado la racha — sería castigar a las 9 de la mañana
 * a quien todavía no cerró. Un día libre no suma ni corta: no rompió
 * nada quien no tenía que reportar.
 */
export function rachaDeRegistro(dias: DiaLlenado[], hoy: string): number {
  let racha = 0;
  for (const d of [...dias].reverse()) {
    if (d.fecha === hoy) continue;
    if (d.estado === "dia-libre" || d.estado === "sin-operar") continue;
    if (d.estado === "lleno" || d.estado === "incompleto") racha++;
    else break;
  }
  return racha;
}

/* ─────────────────────────────────────────────────────────────────────
 * Qué le decimos al administrador en su panel.
 *
 * Está acá y no dentro del componente a propósito: las palabras que lee
 * Raúl cada mañana son una decisión de negocio, no un detalle de
 * pantalla. Acá se pueden probar una por una.
 * ───────────────────────────────────────────────────────────────────── */

/**
 * De dónde sale normalmente el dato de esa sede.
 *
 *  · "manual"     → el administrador lo teclea (Fonavi, Centro).
 *  · "importado"  → llega con el reporte de Byte (Atelier), aunque
 *                   TAMBIÉN se puede teclear: el panel de Atelier ya
 *                   tiene su formulario y lo importado manda sobre lo
 *                   manual.
 *
 * Solo cambia las PALABRAS, no la regla: el día falta igual venga de
 * donde venga. El día que Atelier pase a cargarse a mano, se cambia a
 * "manual" y el aviso habla como el de Fonavi.
 */
export type ModoRegistro = "manual" | "importado";

export type MensajeKpis = {
  tono: "verde" | "ambar" | "rojo";
  titulo: string;
  detalle: string;
  /**
   * Fecha que conviene abrir en el formulario, o null si no hay nada
   * que hacer. Es lo que convierte el aviso en un clic.
   */
  accion: string | null;
};

/** "mar 11 y mié 12" — como lo diría una persona, no una lista. */
function enumerar(fechas: string[]): string {
  const e = fechas.map(etiquetaDia);
  if (e.length <= 1) return e.join("");
  return `${e.slice(0, -1).join(", ")} y ${e[e.length - 1]}`;
}

export function mensajeEstadoKpis(input: {
  hoy: string;
  dias: DiaLlenado[];
  modo?: ModoRegistro;
}): MensajeKpis {
  const { hoy, dias, modo = "manual" } = input;
  const importado = modo === "importado";
  // La coletilla que le dice al administrador CÓMO se arregla.
  const comoSeLlena = importado
    ? "Llega con el reporte de Byte, o regístralo a mano acá abajo."
    : "Sin ese día no corren los KPIs, la meta ni el bono.";
  const comoSeLlenanVarios = importado
    ? "Llegan con el reporte de Byte, o regístralos a mano acá abajo."
    : "Sin esos días no corren los KPIs, la meta ni el bono.";
  const faltantes = dias.filter((d) => d.estado === "falta").map((d) => d.fecha);
  const incompletos = dias.filter((d) => d.estado === "incompleto");
  const estadoHoy = dias.find((d) => d.fecha === hoy)?.estado ?? "hoy";

  // Lo VENCIDO manda sobre lo de hoy: que falte el cierre de hoy a las
  // 3pm es normal, que falte el del martes no.
  if (faltantes.length > 0) {
    return {
      tono: "rojo",
      titulo: faltantes.length === 1
        ? `Falta registrar el ${enumerar(faltantes)}`
        : `Faltan ${faltantes.length} días por registrar`,
      detalle: faltantes.length === 1
        ? comoSeLlena
        : `${enumerar(faltantes)}. ${comoSeLlenanVarios}`,
      accion: faltantes[0],
    };
  }

  if (estadoHoy === "hoy") {
    return {
      tono: "ambar",
      titulo: importado ? "Cierre de hoy: aún sin registrar" : "KPIs de hoy: aún sin registrar",
      detalle: importado
        ? "Llega con el reporte de Byte al cierre. También puedes cargarlo a mano."
        : "Se llenan con el cierre del día. Todavía estás a tiempo.",
      accion: hoy,
    };
  }

  if (incompletos.length > 0) {
    const primero = incompletos[0];
    return {
      tono: "ambar",
      titulo: "Registrado, pero falta un dato",
      detalle: incompletos.length === 1
        ? `Al ${etiquetaDia(primero.fecha)} le falta ${primero.faltan.join(" y ")}.`
        : `${incompletos.length} días registrados a medias: ${enumerar(incompletos.map((d) => d.fecha))}.`,
      accion: primero.fecha,
    };
  }

  // Sin esto, un domingo de descanso felicitaría por un registro que
  // nadie hizo.
  if (estadoHoy === "dia-libre") {
    return {
      tono: "verde",
      titulo: "Hoy es día libre",
      detalle: "No tienes registro pendiente. La semana está al día.",
      accion: null,
    };
  }

  return {
    tono: "verde",
    titulo: importado ? "Cierre de hoy registrado" : "KPIs de hoy registrados",
    detalle: "Todo al día. Nada pendiente de la última semana.",
    accion: null,
  };
}
