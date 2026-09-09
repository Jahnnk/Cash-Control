/**
 * ¿Están completos los datos del mes? · MOTOR (lógica pura).
 *
 * ─── Por qué esto va PRIMERO en el reporte ───
 *
 * Pedido de Jahnn (9-sep-2026): "lo primero que el sistema me tiene que
 * informar es que tenemos completo todos los datos de agosto, después de
 * esto…". El "después de esto" es la parte importante: hasta que no se
 * sepa si el mes está completo, ninguna cifra del reporte significa
 * nada.
 *
 * ─── El daño concreto de no comprobarlo ───
 *
 * Las ventas entran DÍA POR DÍA (el administrador registra cada jornada)
 * y los gastos entran DE GOLPE (Kelly sube el Excel del mes entero). Un
 * mes a medio cargar tiene, entonces, ventas parciales contra gastos
 * completos — y muestra una pérdida que no existe.
 *
 * Casos reales de la base:
 *   · Fonavi, abril 2026: 10 días de venta de 30, gastos del mes entero.
 *     EBITDA −S/22,778. No perdió S/22,778: faltaban 20 días de venta.
 *   · Atelier, agosto 2026: 25 días de 31. El reporte lo mostró en rojo.
 *
 * Por eso la cobertura no es un adorno al pie: es el permiso para leer
 * el resto. Si el mes está incompleto, el reporte lo dice arriba y con
 * todas sus letras, y la cifra de resultado se marca como no confiable.
 *
 * ─── Lo que se mide, y por qué esas dos cosas ───
 *
 * 1. DÍAS DE VENTA cargados contra los días del mes (o contra los días
 *    transcurridos, si el mes está en curso). Es lo que falla en la
 *    práctica: nadie se olvida de subir el Excel de gastos, pero sí se
 *    acumulan días de registro sin llenar.
 * 2. HASTA QUÉ DÍA llegan los gastos. Si el Excel del mes todavía no se
 *    subió, los gastos van a estar cortados en una fecha temprana y el
 *    resultado saldría demasiado bueno — el error opuesto, y más
 *    peligroso porque nadie desconfía de una buena noticia.
 */

export type EstadoCobertura = "completo" | "casi_completo" | "parcial" | "vacio" | "en_curso";

export type CoberturaSede = {
  unitId: number;
  unitName: string;
  /** Días con venta registrada. */
  diasConVenta: number;
  /** Días que DEBERÍA tener (del mes, o transcurridos si está en curso). */
  diasEsperados: number;
  /** 0–100. */
  pctVentas: number;
  /** Último día con gasto registrado (YYYY-MM-DD). null = ni uno. */
  ultimoGasto: string | null;
  /** Cuántos días del final del mes quedaron sin gastos. */
  diasSinGasto: number;
  /**
   * Los días SIN NINGÚN dato de venta, en ISO. Se listan y no solo se
   * cuentan: "faltan 6 días" no le dice nada a nadie, pero "sáb 1 y los
   * 5 domingos" se lee en un segundo y revela si es un hueco de carga o
   * una sede que cerró. Pedido de Jahnn, 9-sep-2026.
   */
  diasFaltantes: string[];
  estado: EstadoCobertura;
  /** Qué falta, dicho para que alguien pueda arreglarlo. */
  faltante: string | null;
};

export type CoberturaMes = {
  month: string;
  /** true si el mes ya terminó. */
  cerrado: boolean;
  sedes: CoberturaSede[];
  /** El peor estado manda: el reporte del grupo vale lo que vale su peor sede. */
  estado: EstadoCobertura;
  /**
   * ¿Se puede confiar en el resultado (EBITDA, margen, salud)?
   * false = el reporte debe mostrar las cifras como preliminares.
   */
  confiable: boolean;
  /** El mensaje que va ARRIBA del reporte, antes de cualquier número. */
  titular: string;
};

/**
 * Umbrales. 95% y no 100% porque un domingo cerrado o un feriado dejan
 * días legítimamente sin venta, y exigir el 100% haría que todos los
 * meses salieran "incompletos" — un aviso que salta siempre es un aviso
 * que nadie lee.
 */
export const UMBRAL_COMPLETO = 95;
export const UMBRAL_CASI = 80;

/** Días del mes. */
export function diasDelMes(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function estadoDe(pct: number, diasConVenta: number, enCurso: boolean): EstadoCobertura {
  if (diasConVenta === 0) return "vacio";
  if (enCurso) return "en_curso";
  if (pct >= UMBRAL_COMPLETO) return "completo";
  if (pct >= UMBRAL_CASI) return "casi_completo";
  return "parcial";
}

const PEOR: Record<EstadoCobertura, number> = {
  vacio: 0, parcial: 1, casi_completo: 2, en_curso: 3, completo: 4,
};

export function evaluarCobertura(input: {
  month: string;
  /** Fecha de hoy en Lima (YYYY-MM-DD), para saber si el mes está en curso. */
  todayISO: string;
  sedes: {
    unitId: number;
    unitName: string;
    /**
     * Días con venta en CUALQUIERA de las fuentes (la unión, no el
     * máximo de una sola). Antes se tomaba el máximo, y eso perdía los
     * días que Jahnn había registrado a mano antes de que Kelly tomara
     * las finanzas: si él cubrió el 1 al 5 y el administrador del 6 en
     * adelante, el máximo contaba una de las dos rachas, nunca las dos.
     */
    diasConVenta: number;
    /** Los días sin dato en NINGUNA fuente, en ISO. */
    diasFaltantes?: string[];
    ultimoGasto: string | null;
  }[];
}): CoberturaMes {
  const { month, todayISO } = input;
  const total = diasDelMes(month);
  const enCurso = todayISO.slice(0, 7) === month;
  const cerrado = todayISO.slice(0, 7) > month;
  // En un mes en curso solo se pueden exigir los días ya transcurridos,
  // y ni siquiera el de hoy: el registro del día se llena al cerrarlo.
  const diasEsperados = enCurso ? Math.max(1, Number(todayISO.slice(8, 10)) - 1) : total;

  const sedes: CoberturaSede[] = input.sedes.map((s) => {
    const pct = Math.round((s.diasConVenta / diasEsperados) * 1000) / 10;
    const estado = estadoDe(pct, s.diasConVenta, enCurso);
    // Días del final del mes sin gasto: si el Excel no se subió, se nota acá.
    const diaUltimoGasto = s.ultimoGasto ? Number(s.ultimoGasto.slice(8, 10)) : 0;
    const diasSinGasto = Math.max(0, (cerrado ? total : diasEsperados) - diaUltimoGasto);

    const faltas: string[] = [];
    const faltanDias = Math.max(0, diasEsperados - s.diasConVenta);
    // Solo se reclama lo que el umbral considera un hueco de verdad. Si
    // se reclamara CUALQUIER día faltante, un mes con dos domingos
    // cerrados saldría "incompleto" — y un aviso que salta todos los
    // meses es un aviso que nadie lee.
    const faltantes = s.diasFaltantes ?? [];
    if (s.diasConVenta === 0) {
      faltas.push("no hay ni un día de venta registrado");
    } else if (faltanDias > 0 && !enCurso && pct < UMBRAL_COMPLETO) {
      // Dos puntos y no paréntesis: el titular ya envuelve esto entre
      // paréntesis, y anidarlos hace ilegible justo la parte que hay
      // que leer.
      const n = faltantes.length > 0 ? faltantes.length : faltanDias;
      faltas.push(
        faltantes.length > 0
          ? `falta${n === 1 ? "" : "n"} ${n} día${n === 1 ? "" : "s"} de venta: ${listaDeDias(faltantes)}`
          : `falta${n === 1 ? "" : "n"} ${n} día${n === 1 ? "" : "s"} de venta`,
      );
    }
    // 5 días es una semana laboral: por debajo puede ser el cierre
    // normal del mes; por encima, el Excel de gastos no se subió.
    if (!s.ultimoGasto) faltas.push("no hay gastos cargados");
    else if (diasSinGasto > 5) faltas.push(`los gastos se cortan el ${s.ultimoGasto.slice(8)}`);

    // Un hueco en los GASTOS también degrada el estado, y esto no es un
    // detalle: una sede con las ventas completas y el Excel de gastos a
    // medias muestra un resultado DEMASIADO BUENO. Es el error más
    // peligroso de los dos, porque nadie desconfía de una buena noticia.
    const huecoDeGastos = !s.ultimoGasto || diasSinGasto > 5;
    const estadoFinal: EstadoCobertura =
      estado === "en_curso" || estado === "vacio"
        ? estado
        : huecoDeGastos
          ? (!s.ultimoGasto ? "parcial" : "casi_completo")
          : estado;

    return {
      unitId: s.unitId, unitName: s.unitName,
      diasConVenta: s.diasConVenta, diasEsperados,
      pctVentas: Math.min(100, pct),
      ultimoGasto: s.ultimoGasto, diasSinGasto,
      diasFaltantes: faltantes,
      estado: estadoFinal,
      faltante: faltas.length > 0 ? faltas.join(" y ") : null,
    };
  });

  const estado = sedes.reduce<EstadoCobertura>(
    (peor, s) => (PEOR[s.estado] < PEOR[peor] ? s.estado : peor),
    "completo",
  );
  // "en curso" no es un defecto de carga, pero tampoco es un mes que se
  // pueda cerrar: el resultado es una foto a mitad de camino.
  //
  // La segunda condición es la que atrapó el test: sin ella, una sede
  // con 31/31 días de venta y los gastos cortados el día 12 salía
  // "completo" y confiable, que es el reporte falsamente bueno.
  const confiable = estado === "completo" && sedes.every((s) => s.faltante === null);

  const conProblema = sedes.filter((s) => s.faltante !== null);
  const titular =
    estado === "completo" && confiable
      ? `Datos completos de ${etiquetaMes(month)}: las ${sedes.length} sedes tienen el mes entero cargado. Las cifras de este reporte son definitivas.`
      : estado === "en_curso"
        ? `${etiquetaMes(month)} todavía está en curso (datos al día ${diasEsperados}). Las cifras son un avance, no el cierre del mes.`
        : estado === "vacio"
          ? `No hay datos suficientes de ${etiquetaMes(month)} para hacer el reporte.`
          : `Faltan datos de ${etiquetaMes(month)}: ${conProblema.map((s) => `${s.unitName} (${s.faltante})`).join("; ")}. ` +
            `Con ventas a medias y gastos completos, el resultado sale peor de lo real — súbelos antes de tomar decisiones con estas cifras.`;

  return { month, cerrado, sedes, estado, confiable, titular };
}

/**
 * "sáb 1, dom 2, dom 9, dom 16, dom 23, dom 30".
 *
 * El día de la semana va a propósito: cinco domingos seguidos se leen de
 * un vistazo como "la sede no abrió", mientras que "faltan 6 días" haría
 * pensar en un problema de carga. El dato tiene que dejar ver el patrón.
 */
export function listaDeDias(isos: string[]): string {
  const DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MAX = 8;
  const nombres = isos.map((d) => {
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    return `${DIA[dow]} ${Number(d.slice(8, 10))}`;
  });
  return nombres.length <= MAX
    ? nombres.join(", ")
    : `${nombres.slice(0, MAX).join(", ")} y ${nombres.length - MAX} más`;
}

function etiquetaMes(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const l = new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return l.charAt(0).toUpperCase() + l.slice(1);
}
