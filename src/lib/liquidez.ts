/**
 * La liquidez del grupo · UNA sola definición.
 *
 * ─── Por qué existe este archivo ───
 *
 * El 10-sep-2026 el dashboard mostraba DOS cifras de liquidez en la
 * misma pantalla: el panel de gastos decía S/2,472.11 y la tarjeta
 * principal S/16,747.46. Jahnn preguntó cuál era, con razón.
 *
 * Eran dos métodos distintos para el mismo número, y ninguno servía:
 *
 *  · El panel tomaba el último saldo de banco REGISTRADO y le sumaba la
 *    caja. Para Atelier eso era el saldo del 10 de agosto, ignorando un
 *    mes entero de movimientos; para Fonavi y Centro, que nunca
 *    registraron uno, era cero.
 *
 *  · La tarjeta tomaba un ANCLA (un saldo conocido en una fecha) y lo
 *    arrastraba sumando entradas y restando salidas hasta hoy. Mejor,
 *    pero el ancla de Centro era S/0 del 28 de febrero y venía arrastrada
 *    por S/214,068 de entradas y S/215,180 de salidas: siete meses de
 *    movimientos. Da −S/1,111, y un banco no puede estar en negativo.
 *
 *  · Y su etiqueta decía "Banco + caja de las tres sedes" mostrando solo
 *    el banco. La caja eran otros S/7,816.
 *
 * ─── La regla ───
 *
 * Lo DECLARADO manda sobre lo DERIVADO. Si Jahnn registró el saldo del
 * banco esta semana, ese es el número: lo vio en la app del BCP. Solo
 * cuando no hay saldo declarado se arrastra desde el ancla, y entonces
 * se dice que es una estimación y desde cuándo viene arrastrándose.
 *
 * Un saldo arrastrado siete meses no es un dato: es la acumulación de
 * todos los errores de registro de siete meses. Por eso el arrastre
 * avisa su antigüedad en vez de presentarse como un hecho.
 */

export type OrigenSaldo = "declarado" | "derivado" | "ninguno";

/** Quién puso el saldo declarado. Los dos son exactos: salen del banco. */
export type Fuente = "excel-kelly" | "dirección" | null;

export type LiquidezSede = {
  businessId: number;
  nombre: string;
  banco: number;
  caja: number;
  /** banco + caja. */
  total: number;
  origen: OrigenSaldo;
  /** De dónde salió el saldo declarado. */
  fuente: Fuente;
  /** Lo que Kelly no logró cuadrar contra su banco, si viene de su Excel. */
  descuadreKelly: number | null;
  /** Fecha del saldo declarado, o del ancla si es derivado. */
  fecha: string | null;
  /** Días desde esa fecha. */
  antiguedadDias: number | null;
  /** Problemas que impiden confiar en la cifra. */
  avisos: string[];
};

export type LiquidezGrupo = {
  sedes: LiquidezSede[];
  banco: number;
  caja: number;
  total: number;
  /** true si TODAS las sedes tienen saldo declarado y fresco. */
  confiable: boolean;
  /** Una línea que dice de qué está hecho el número. */
  procedencia: string;
};

/** A partir de cuántos días un saldo declarado deja de ser de fiar. */
export const DIAS_SALDO_FRESCO = 7;
/** A partir de cuántos días de arrastre la estimación es sospechosa. */
export const DIAS_ARRASTRE_SOSPECHOSO = 30;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Atelier, Fonavi y Centro" — no "Atelier y Fonavi y Centro". */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

const diasEntre = (desde: string, hasta: string): number =>
  Math.max(0, Math.round(
    (new Date(hasta + "T00:00:00Z").getTime() - new Date(desde + "T00:00:00Z").getTime()) / 86400000,
  ));

export type EntradaSede = {
  businessId: number;
  nombre: string;
  /**
   * Saldo verificado contra el banco: manda sobre todo. Puede venir del
   * Excel de Kelly (ella copia la lectura del BCP para cuadrar su libro)
   * o de que Jahnn lo registre a mano. null = no hay.
   */
  declarado: {
    banco: number | null; caja: number; fecha: string;
    fuente?: Fuente; descuadreKelly?: number | null;
  } | null;
  /** Estimación por arrastre desde el ancla. */
  derivado: { banco: number; caja: number; fechaAncla: string } | null;
};

export function calcularLiquidez(input: {
  todayISO: string;
  sedes: EntradaSede[];
}): LiquidezGrupo {
  const { todayISO } = input;

  const sedes: LiquidezSede[] = input.sedes.map((s) => {
    const avisos: string[] = [];
    let banco = 0, caja = 0, fecha: string | null = null;
    let origen: OrigenSaldo = "ninguno";
    let fuente: Fuente = null;
    let descuadreKelly: number | null = null;

    if (s.declarado) {
      origen = "declarado";
      banco = s.declarado.banco ?? 0;
      caja = s.declarado.caja;
      fecha = s.declarado.fecha;
      fuente = s.declarado.fuente ?? null;
      descuadreKelly = s.declarado.descuadreKelly ?? null;
      // El descuadre de Kelly NO se tapa: si su libro no cuaja con su
      // banco, quien decida sobre este saldo tiene derecho a saberlo.
      if (descuadreKelly !== null && Math.abs(descuadreKelly) >= 0.01) {
        avisos.push(`a Kelly le falta cuadrar ${r2(Math.abs(descuadreKelly))} entre su libro y el banco`);
      }
      const dias = diasEntre(fecha, todayISO);
      if (dias > DIAS_SALDO_FRESCO) {
        avisos.push(`el saldo que registraste es del ${fecha.slice(8)}/${fecha.slice(5, 7)}, hace ${dias} días`);
      }
    } else if (s.derivado) {
      origen = "derivado";
      banco = s.derivado.banco;
      caja = s.derivado.caja;
      fecha = s.derivado.fechaAncla;
      const dias = diasEntre(fecha, todayISO);
      avisos.push(
        dias > DIAS_ARRASTRE_SOSPECHOSO
          ? `estimado arrastrando ${dias} días de movimientos desde el ${fecha.slice(8)}/${fecha.slice(5, 7)} — no está verificado contra el banco`
          : `estimado desde el último saldo conocido (${fecha.slice(8)}/${fecha.slice(5, 7)})`,
      );
    } else {
      avisos.push("no hay saldo registrado ni forma de estimarlo");
    }

    // Un banco o una caja en negativo son imposibles: si salen así, falta
    // registrar entradas. Decirlo evita decidir sobre un número que no
    // puede existir.
    if (banco < 0) avisos.push(`el banco sale en negativo (${r2(banco)}): faltan ingresos por registrar`);
    if (caja < 0) avisos.push(`la caja sale en negativo (${r2(caja)}): faltan ingresos en efectivo por registrar`);

    return {
      businessId: s.businessId, nombre: s.nombre,
      banco: r2(banco), caja: r2(caja), total: r2(banco + caja),
      origen, fuente, descuadreKelly, fecha,
      antiguedadDias: fecha ? diasEntre(fecha, todayISO) : null,
      avisos,
    };
  });

  const banco = r2(sedes.reduce((t, s) => t + s.banco, 0));
  const caja = r2(sedes.reduce((t, s) => t + s.caja, 0));
  // Confiable = las tres vienen del banco y ninguna tiene pero. El
  // descuadre de Kelly cuenta como pero: si su libro no cuaja, el saldo
  // sirve para mirar pero no para decidir al céntimo.
  const declaradas = sedes.filter((s) => s.origen === "declarado" && s.avisos.length === 0).length;
  const confiable = declaradas === sedes.length && sedes.length > 0;

  const derivadas = sedes.filter((s) => s.origen === "derivado").map((s) => s.nombre);
  const sinNada = sedes.filter((s) => s.origen === "ninguno").map((s) => s.nombre);
  const deKelly = sedes.filter((s) => s.fuente === "excel-kelly").length;
  const procedencia = confiable
    ? deKelly === sedes.length
      ? "Saldos leídos del banco en el Excel de Kelly."
      : deKelly > 0
        ? "Saldos verificados contra el banco (parte del Excel de Kelly, parte registrados por ti)."
        : "Saldos verificados contra el banco esta semana."
    : sinNada.length > 0
      ? `Sin saldo ni estimación en ${enumerar(sinNada)}: el total está incompleto.`
      : derivadas.length > 0
        ? `Estimado en ${enumerar(derivadas)} arrastrando movimientos — registra los saldos para tener la cifra real.`
        : "Algún saldo registrado está viejo: verifícalo contra el banco.";

  return { sedes, banco, caja, total: r2(banco + caja), confiable, procedencia };
}
