/**
 * El cuadre entre el Excel de Kelly y el sistema, ANTES de importar.
 *
 * Pedido de Jahnn (26-ago-2026): "quisiera saldar todo para que el Excel
 * concuerde exactamente con el sistema y, de aquí en adelante, reconozca
 * bien los Excels de Kelly".
 *
 * ─── El trabajo que esto reemplaza ───
 *
 * Cada semana Jahnn abría el Excel de una sede, miraba los totales de la
 * pantalla de Reportes y, cuando no coincidían, había que rastrear
 * movimiento por movimiento de dónde salía la diferencia. En Atelier de
 * agosto la respuesta fue: un alquiler compartido de S/1,800 que está en
 * el sistema y no en el Excel, y tres filas del Excel con fecha de otro
 * mes. Ninguna de las dos cosas se veía sin escarbar.
 *
 * ─── Qué responde ───
 *
 * Una sola pregunta: "si importo esto, ¿el total del sistema va a ser el
 * mismo del Excel, y si no, por qué exactamente?".
 *
 * La diferencia casi nunca es un error: son los movimientos que el
 * sistema tiene y el Excel no. Gastos compartidos, préstamos del socio,
 * cobros de clientes B2B — cosas que Jahnn registra y que Kelly no lleva
 * en su archivo. Lo que hacía falta no era eliminarlos, era VERLOS: una
 * diferencia explicada deja de ser un problema.
 *
 * ─── Por qué se calcula antes y no después ───
 *
 * Después de importar, si el número no cuadra, ya no se sabe si fue el
 * Excel, el import o algo que había de antes. Antes, con el archivo
 * todavía en la mano, la pregunta tiene una respuesta y una acción.
 */

export type MovimientoSoloSistema = {
  tipo: "ingreso" | "egreso";
  fecha: string;
  detalle: string;
  /** Lo que suma al total de la sede (la parte propia si es compartido). */
  monto: number;
  /** Por qué está en el sistema y no en el Excel. */
  motivo: string;
};

export type CuadreExcel = {
  /** Lo que trae el archivo, del mes de la pestaña. */
  excel: { ingresos: number; egresos: number };
  /** Lo que el sistema tiene y el Excel no trae. */
  soloSistema: { ingresos: number; egresos: number };
  /** Lo que va a mostrar la pantalla de Reportes después de importar. */
  esperado: { ingresos: number; egresos: number };
  movimientos: MovimientoSoloSistema[];
  /** true = el Excel y el sistema van a mostrar lo mismo. */
  cuadra: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Por qué un movimiento vive solo en el sistema. El motivo importa tanto
 * como el monto: "gasto compartido" se entiende y se acepta; una
 * diferencia sin nombre obliga a investigar cada semana.
 */
export function motivoSoloSistema(m: {
  isShared?: boolean;
  isSpecialLoan?: boolean;
  isInternalTransfer?: boolean;
  paymentMethod?: string | null;
  clientId?: string | null;
  nonOperativeCategory?: string | null;
  isFonaviReimbursement?: boolean;
}): string {
  if (m.isShared) return "Gasto compartido entre sedes";
  if (m.isSpecialLoan) return "Préstamo del socio";
  if (m.isInternalTransfer) return "Transferencia entre sedes";
  if (m.paymentMethod === "pendiente_atelier") return "Espejo de gasto compartido";
  if (m.paymentMethod === "socio") return "Pagado por el socio";
  if (m.clientId) return "Cobro a cliente B2B";
  if (m.isFonaviReimbursement) return "Reembolso de Fonavi";
  if (m.nonOperativeCategory) return "No operativo";
  return "Registrado a mano";
}

export function construirCuadre(input: {
  excelIngresos: number;
  excelEgresos: number;
  movimientos: MovimientoSoloSistema[];
}): CuadreExcel {
  const ingSolo = r2(
    input.movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0),
  );
  const egrSolo = r2(
    input.movimientos.filter((m) => m.tipo === "egreso").reduce((s, m) => s + m.monto, 0),
  );
  const excel = { ingresos: r2(input.excelIngresos), egresos: r2(input.excelEgresos) };

  return {
    excel,
    soloSistema: { ingresos: ingSolo, egresos: egrSolo },
    esperado: {
      ingresos: r2(excel.ingresos + ingSolo),
      egresos: r2(excel.egresos + egrSolo),
    },
    movimientos: [...input.movimientos].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || b.monto - a.monto,
    ),
    cuadra: ingSolo === 0 && egrSolo === 0,
  };
}

/** La frase de arriba del cuadre: el veredicto en una línea. */
export function resumenCuadre(c: CuadreExcel): string {
  if (c.cuadra) {
    return "El Excel y el sistema van a mostrar exactamente lo mismo.";
  }
  const partes: string[] = [];
  if (c.soloSistema.ingresos !== 0) {
    partes.push(`S/${c.soloSistema.ingresos.toFixed(2)} de ingresos`);
  }
  if (c.soloSistema.egresos !== 0) {
    partes.push(`S/${c.soloSistema.egresos.toFixed(2)} de egresos`);
  }
  const n = c.movimientos.length;
  return (
    `El sistema va a mostrar ${partes.join(" y ")} más que el Excel: ` +
    `${n} movimiento${n === 1 ? "" : "s"} que ${n === 1 ? "está" : "están"} ` +
    `registrado${n === 1 ? "" : "s"} en el sistema y no en el archivo de Kelly. ` +
    `No es un error — es lo que ella no lleva en su Excel.`
  );
}
