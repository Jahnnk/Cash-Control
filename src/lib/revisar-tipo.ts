/**
 * Filas con el tipo y la columna cruzados · «REVISAR TIPO» (lógica pura).
 *
 * Auditoría de setiembre 2026 (24-oct-2026): Centro, fila 114, 11/09, «DEPÓSITO POR VENTAS EN EFECTIVO» S/63.19 vino
 * con tipo «I» (ingreso) pero el monto en la columna de GASTOS de la cuenta. El importador lo autocorregía a «G» y la
 * fila terminaba como gasto. Adivinar es peor que preguntar: no se sabe si el error es el tipo o la columna.
 *
 * Desde ahora (decisión de Jahnn): la fila se importa TAL CUAL está en las columnas del Excel (así el total de
 * ingresos y de egresos sigue igual al del Excel), marcada con «[REVISAR TIPO]» y la categoría REVISAR TIPO; queda
 * FUERA de las seis cifras y del saldo calculado, y el control C6 pone el mes en rojo hasta que se corrija en el
 * Excel y se vuelva a subir.
 *
 * Las cargas viejas (antes de este cambio) no traen la marca, pero el lote guardó el aviso del importador
 * («type_mismatch», I→G, autocorrected): con él se reconoce la fila (misma fecha, monto y concepto).
 *
 * La «G» con monto en la columna de INGRESOS sigue siendo una devolución ([DEVOLUCION]): es como Kelly anota la
 * plata que vuelve de un gasto, validado desde abril 2026. No es un cruce dudoso.
 */

export const MARCA_REVISAR_TIPO = "[REVISAR TIPO]";
export const CATEGORIA_REVISAR_TIPO = "REVISAR TIPO";

export function tieneMarcaRevisarTipo(texto: string | null | undefined): boolean {
  return String(texto ?? "").trimStart().toUpperCase().startsWith(MARCA_REVISAR_TIPO);
}

/** El aviso que dejó el importador en el lote (warnings_json). */
export type AvisoImportador = {
  rowNumber?: number; date?: string; amount?: number; column?: string; reason?: string; severity?: string;
  originalType?: string; correctedType?: string; description?: string;
};

export type FilaMovimiento = { id: string; fecha: string; monto: number; texto: string | null; categoria?: string | null };
export type FilaRevisarTipo = { id: string; tipo: "gasto" | "ingreso"; fecha: string; monto: number; texto: string; fila: number | null };

const norm = (t: string | null | undefined) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** ¿Este aviso es un cruce de tipo y columna? (los nuevos «revisar» y los viejos autocorregidos I→G). */
export function esAvisoDeTipoCruzado(w: AvisoImportador): boolean {
  if (w.reason !== "type_mismatch") return false;
  if (w.severity === "revisar") return true;
  return w.severity === "autocorrected" && w.originalType === "I" && w.correctedType === "G";
}

/**
 * Las filas guardadas que hay que revisar: las marcadas al importar y las que reconoce un aviso viejo.
 * Cada aviso reconoce una sola fila.
 */
export function filasRevisarTipo(input: { gastos: FilaMovimiento[]; ingresos: FilaMovimiento[]; avisos: AvisoImportador[] }): FilaRevisarTipo[] {
  const out: FilaRevisarTipo[] = [];
  const vistas = new Set<string>();
  const add = (f: FilaMovimiento, tipo: "gasto" | "ingreso", fila: number | null) => {
    if (vistas.has(f.id)) return;
    vistas.add(f.id);
    out.push({ id: f.id, tipo, fecha: f.fecha, monto: f.monto, texto: String(f.texto ?? ""), fila });
  };
  for (const g of input.gastos) if (tieneMarcaRevisarTipo(g.texto) || g.categoria === CATEGORIA_REVISAR_TIPO) add(g, "gasto", null);
  for (const i of input.ingresos) if (tieneMarcaRevisarTipo(i.texto)) add(i, "ingreso", null);
  for (const w of input.avisos.filter(esAvisoDeTipoCruzado)) {
    const desc = norm(w.description);
    // I→G autocorregido: quedó guardada como gasto, con el monto de la columna de gastos.
    const lista = w.correctedType === "G" || w.column === "ge" || w.column === "gc" ? input.gastos : input.ingresos;
    const tipo = lista === input.gastos ? "gasto" : "ingreso";
    const f = lista.find((x) => !vistas.has(x.id) && x.fecha === w.date && Math.abs(x.monto - Number(w.amount ?? NaN)) < 0.005 && (!desc || norm(x.texto).startsWith(desc)));
    if (f) add(f, tipo, w.rowNumber ?? null);
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
