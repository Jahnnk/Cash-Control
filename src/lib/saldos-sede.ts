/**
 * "¿Podemos asumir este gasto?" · MOTOR (lógica pura).
 *
 * ─── El caso que lo obligó ───
 *
 * 9-sep-2026. Se malogra la refrigeradora grande de Atelier —la de las
 * masas y los panes— y el técnico cobra S/3,400 por cambiarle el motor.
 * Jahnn llama a Kelly, que reacciona molesta y después le pide cifras:
 * cuánto vendió Atelier en agosto y en julio, cuál es la proyección del
 * mes, cuánto gastó, cuánta utilidad dejó, cuánto vendieron Fonavi y
 * Centro, y si las cafeterías tienen liquidez para prestarle.
 *
 * Jahnn entró a Cash Control con el técnico esperando y no encontró
 * nada. Los datos estaban —repartidos en cuatro pantallas— salvo el
 * último, que no existía.
 *
 * ─── Lo que este módulo NO hace ───
 *
 * No decide por Jahnn. Kelly no preguntaba "¿alcanza?": preguntaba por
 * las cifras con las que ELLA iba a decidir. Así que el veredicto viene
 * siempre con los números que lo sostienen, para que él pueda
 * defenderlos en la llamada en vez de citar un semáforo.
 *
 * ─── Por qué el colchón se mide en DÍAS y no en soles ───
 *
 * "Quedan S/7,870" no dice si es mucho o poco. "Quedan 13 días de
 * costos fijos" sí, y se compara solo contra la siguiente quincena de
 * planilla.
 *
 * ─── Y por qué contra los costos FIJOS y no contra el gasto total ───
 *
 * Un primer intento midió el colchón contra el gasto operativo entero,
 * y salía que el grupo quema S/4,123 al día: con eso, S/21,300 duraban
 * cinco días y casi cualquier gasto quedaba "justo". Es un cálculo
 * pesimista y equivocado, porque la mayor parte de ese gasto es
 * mercadería: si dejas de vender tampoco compras, y si vendes también
 * cobras.
 *
 * Lo que hay que cubrir sí o sí —vendas o no— son alquiler, planilla y
 * servicios. Eso es el costo fijo, y es la vara honesta para preguntar
 * "¿cuánto aguanto?".
 */

export type SaldoSede = {
  businessId: number;
  nombre: string;
  /** Saldo de banco. null = la sede no maneja cuenta propia. */
  banco: number | null;
  caja: number;
  /** A qué día corresponde el saldo (YYYY-MM-DD). null = nunca se registró. */
  fecha: string | null;
  /**
   * Costo FIJO diario (alquiler, planilla, servicios ÷ días del mes).
   * No el gasto total: la mercadería no se compra si no se vende.
   */
  gastoFijoDiario: number;
};

export type SedeEvaluada = SaldoSede & {
  /** banco + caja. */
  disponible: number;
  /** Días de costos fijos que cubre lo disponible. null si no se conoce. */
  diasColchon: number | null;
  /** Días de antigüedad del saldo. null = nunca registrado. */
  antiguedadDias: number | null;
  /** Avisos de calidad del dato, dichos para que alguien los arregle. */
  avisos: string[];
};

export type Veredicto = "alcanza_holgado" | "alcanza_justo" | "no_alcanza" | "sin_datos";

export type EvaluacionGasto = {
  monto: number;
  sedes: SedeEvaluada[];
  disponibleTotal: number;
  /** Lo que queda en el grupo después del gasto. */
  quedaTotal: number;
  /** Sede que puede cubrirlo sola dejando más colchón. null = ninguna. */
  sedeSugerida: SedeEvaluada | null;
  veredicto: Veredicto;
  titular: string;
  /** true si algún saldo está viejo o falta: el veredicto no es firme. */
  datosDebiles: boolean;
};

/**
 * Días de COSTOS FIJOS que el grupo debería conservar después de un
 * gasto imprevisto. Dos semanas: cubre la siguiente quincena de planilla
 * completa, que es el compromiso que no se puede postergar.
 *
 * Es un supuesto, no una ley — se muestra en pantalla para que Jahnn lo
 * discuta si no le cuadra.
 */
export const DIAS_COLCHON_MINIMO = 14;

/** A partir de cuántos días un saldo deja de servir para decidir. */
export const DIAS_SALDO_VIEJO = 7;

const r2 = (n: number) => Math.round(n * 100) / 100;
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

const diasEntre = (desde: string, hasta: string): number =>
  Math.max(0, Math.round(
    (new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86400000,
  ));

export function evaluarSede(s: SaldoSede, todayISO: string): SedeEvaluada {
  const disponible = r2((s.banco ?? 0) + s.caja);
  const antiguedadDias = s.fecha ? diasEntre(s.fecha, todayISO) : null;
  const avisos: string[] = [];

  if (s.fecha === null) {
    avisos.push("nunca se ha registrado su saldo");
  } else if (antiguedadDias !== null && antiguedadDias > DIAS_SALDO_VIEJO) {
    avisos.push(`el saldo es del ${s.fecha.slice(8)}/${s.fecha.slice(5, 7)}, hace ${antiguedadDias} días`);
  }
  // Una caja no puede ser negativa: si sale así, faltan entradas por
  // registrar. Decirlo evita que alguien decida sobre un número imposible.
  if (s.caja < 0) {
    avisos.push(`su caja sale en ${soles(s.caja)} negativo — faltan ingresos en efectivo por registrar`);
  }

  return {
    ...s, disponible, antiguedadDias, avisos,
    diasColchon: s.gastoFijoDiario > 0 ? Math.round(disponible / s.gastoFijoDiario) : null,
  };
}

export function evaluarGasto(input: {
  monto: number;
  sedes: SaldoSede[];
  todayISO: string;
}): EvaluacionGasto {
  const { monto, todayISO } = input;
  const sedes = input.sedes.map((s) => evaluarSede(s, todayISO));
  const disponibleTotal = r2(sedes.reduce((t, s) => t + s.disponible, 0));
  const quedaTotal = r2(disponibleTotal - monto);
  const datosDebiles = sedes.some((s) => s.avisos.length > 0);

  // Qué sede lo cubre sola dejando MÁS colchón. Sacar todo de una sede
  // es más simple de ejecutar que repartirlo, y deja el rastro contable
  // limpio (un solo movimiento, una sola sede acreedora).
  const candidatas = sedes
    .filter((s) => s.disponible >= monto)
    .map((s) => ({
      sede: s,
      diasDespues: s.gastoFijoDiario > 0 ? (s.disponible - monto) / s.gastoFijoDiario : Infinity,
    }))
    .sort((a, b) => b.diasDespues - a.diasDespues);
  const sedeSugerida = candidatas.length > 0 ? candidatas[0].sede : null;

  const sinSaldo = sedes.filter((s) => s.fecha === null).length;
  const veredicto: Veredicto =
    sinSaldo === sedes.length ? "sin_datos"
    : quedaTotal < 0 ? "no_alcanza"
    : (() => {
        // El colchón se mide con el costo fijo del GRUPO: un imprevisto
        // lo absorbe el grupo, aunque salga de una sola caja.
        const fijoGrupo = sedes.reduce((t, s) => t + s.gastoFijoDiario, 0);
        if (fijoGrupo <= 0) return "alcanza_justo";
        const diasDespues = quedaTotal / fijoGrupo;
        return diasDespues >= DIAS_COLCHON_MINIMO ? "alcanza_holgado" : "alcanza_justo";
      })();

  const fijoGrupo = sedes.reduce((t, s) => t + s.gastoFijoDiario, 0);
  const diasDespues = fijoGrupo > 0 ? Math.round(quedaTotal / fijoGrupo) : null;

  // Cuando los saldos están viejos o faltan, el veredicto NO puede
  // encabezar la frase. "No alcanza" sobre un saldo de hace un mes hace
  // entrar en pánico por un problema de registro, no de plata — y el
  // pánico con un técnico esperando es justamente lo que este panel
  // existe para evitar. Primero se dice que el dato no da.
  const faltaRegistrar = sedes.filter((s) => s.fecha === null).map((s) => s.nombre);
  const viejos = sedes.filter((s) => s.antiguedadDias !== null && s.antiguedadDias > DIAS_SALDO_VIEJO);
  const prefijoDebil =
    faltaRegistrar.length > 0
      ? `Falta registrar el saldo de ${faltaRegistrar.join(" y ")}, así que esto NO es la plata real del grupo. `
      : viejos.length > 0
        ? `El saldo más reciente es de hace ${Math.max(...viejos.map((v) => v.antiguedadDias!))} días, así que esto puede no ser la plata real. `
        : "";

  const titular =
    veredicto === "sin_datos"
      ? "No hay saldos registrados: el sistema no puede decir si alcanza. Registra los saldos de las tres sedes."
      : veredicto === "no_alcanza"
        ? `No alcanza. Entre las tres sedes hay ${soles(disponibleTotal)} y el gasto es de ${soles(monto)}: faltan ${soles(quedaTotal)}.`
        : veredicto === "alcanza_justo"
          ? `Alcanza, pero justo. Quedarían ${soles(quedaTotal)}` +
            (diasDespues !== null ? ` — ${diasDespues} día(s) de costos fijos` : "") +
            `, por debajo del colchón de ${DIAS_COLCHON_MINIMO} días.`
          : `Sí alcanza. Quedarían ${soles(quedaTotal)}` +
            (diasDespues !== null ? ` — ${diasDespues} días de costos fijos` : "") +
            (sedeSugerida ? `. La sede con más holgura para cubrirlo es ${sedeSugerida.nombre}.` : ".");

  return {
    monto, sedes, disponibleTotal, quedaTotal, sedeSugerida, veredicto,
    // El prefijo va DELANTE del veredicto, no detrás: quien lee la
    // primera línea tiene que enterarse del problema de dato antes que
    // de la conclusión que ese dato sostiene.
    titular: prefijoDebil + titular,
    datosDebiles,
  };
}
