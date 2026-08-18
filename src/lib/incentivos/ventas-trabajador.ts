/**
 * Ventas por Trabajador: resolver los períodos que se pisan, al LEER.
 *
 * Encontrado el 18-ago-2026 revisando la rutina de los administradores.
 *
 * ─── Qué estaba mal ───
 *
 * Al importar, solo se borraba el rango IDÉNTICO. Como los admins suben
 * el acumulado del 1 a hoy cada sábado, la tabla se llenó de períodos
 * que se pisan entre sí:
 *
 *   Centro julio: 01→12, 01→18, 01→25, 01→31, 01→ago-01   (cinco)
 *
 * Las tres pantallas que lo leen se defendían tomando solo las filas de
 * la ÚLTIMA carga. Eso evita el doble conteo, pero la regla es "la
 * última gana", no "la más completa", y solo acierta si la última carga
 * resulta ser además la mayor.
 *
 * En Fonavi julio acertó de casualidad: las semanas se subieron ANTES
 * que el mes completo. Al revés, el ranking del mes habría mostrado
 * S/9,069 en lugar de S/35,611 — 3.9x menos, sin avisar. Y bastaba con
 * que alguien recargara una semana vieja para corregir algo.
 *
 * ─── Por qué se resuelve al leer y no borrando ───
 *
 * Jahnn: "esto es muy delicado y la administradora de Centro hace este
 * seguimiento diario, no podemos de un momento a otro cambiar datos,
 * tickets, métricas o rankings". Tiene razón: lo de arriba es un
 * problema latente, no un número malo hoy.
 *
 * Resolviendo al leer no se borra ni una fila, los números de hoy salen
 * IGUALES (verificado trabajador por trabajador en las 4 combinaciones
 * de sede y mes), y el día que alguien recargue una semana vieja el
 * ranking ya no se cae. La tabla puede quedar desordenada sin peligro.
 */

export type FilaPeriodo = {
  nombre: string;
  mesas: number;
  total: number;
  periodStart: string;
  periodEnd: string;
  /** Cuándo se cargó. Decide quién gana cuando dos rangos se pisan. */
  importedAt: string;
};

export type VentasTrabajador = {
  nombre: string;
  mesas: number;
  total: number;
  /** Tramo real que se sumó, para saber qué se está mirando. */
  periodStart: string | null;
  periodEnd: string | null;
};

const seSolapan = (a: { periodStart: string; periodEnd: string },
                   b: { periodStart: string; periodEnd: string }) =>
  a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;

/**
 * Deja vivos solo los períodos que no pisa ninguno MÁS NUEVO.
 *
 * Se recorre en orden de carga aplicando la misma regla que el import:
 * el que llega reemplaza a los que pisa. Reconstruye lo que habría en
 * la tabla si el import hubiera borrado por solape desde el principio.
 */
export function periodosVigentes(filas: FilaPeriodo[]): FilaPeriodo[] {
  const rangos = new Map<string, { periodStart: string; periodEnd: string; importedAt: string }>();
  for (const f of filas) {
    const k = `${f.periodStart}|${f.periodEnd}`;
    const previo = rangos.get(k);
    // Un mismo rango puede tener varias filas (una por trabajador); se
    // queda con la carga más reciente de ese rango.
    if (!previo || f.importedAt > previo.importedAt) {
      rangos.set(k, { periodStart: f.periodStart, periodEnd: f.periodEnd, importedAt: f.importedAt });
    }
  }

  let vivos: typeof rangos extends Map<string, infer V> ? V[] : never = [];
  for (const r of [...rangos.values()].sort((a, b) => a.importedAt.localeCompare(b.importedAt))) {
    vivos = vivos.filter((v) => !seSolapan(v, r));
    vivos.push(r);
  }

  const ok = new Set(vivos.map((v) => `${v.periodStart}|${v.periodEnd}`));
  return filas.filter(
    (f) => ok.has(`${f.periodStart}|${f.periodEnd}`) &&
      // De ese rango, solo la carga que quedó vigente.
      f.importedAt === rangos.get(`${f.periodStart}|${f.periodEnd}`)!.importedAt,
  );
}

/** Suma por trabajador los períodos vigentes, de mayor a menor venta. */
export function ventasPorTrabajador(filas: FilaPeriodo[]): VentasTrabajador[] {
  const vigentes = periodosVigentes(filas);
  const acc = new Map<string, VentasTrabajador>();
  for (const f of vigentes) {
    const k = f.nombre.trim().toUpperCase();
    const a = acc.get(k);
    if (!a) {
      acc.set(k, {
        nombre: f.nombre, mesas: f.mesas, total: f.total,
        periodStart: f.periodStart, periodEnd: f.periodEnd,
      });
      continue;
    }
    a.mesas += f.mesas;
    a.total = Math.round((a.total + f.total) * 100) / 100;
    if (f.periodStart < (a.periodStart ?? "9999")) a.periodStart = f.periodStart;
    if (f.periodEnd > (a.periodEnd ?? "")) a.periodEnd = f.periodEnd;
  }
  return [...acc.values()].sort((x, y) => y.total - x.total);
}
