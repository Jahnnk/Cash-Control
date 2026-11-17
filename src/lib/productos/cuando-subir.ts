/**
 * ¿Cuándo subir los precios? · fase 3 de «¿Qué precios subir?» (MOTOR, puro).
 *
 * Pedido de Jahnn (17-nov-2026): no solo qué y cuánto, también CUÁNDO subir. Tres señales por sede,
 * todas con datos que el sistema ya tiene:
 *
 *   1. TIEMPO   meses desde la última subida (la detecta «Prueba de precios»; sin ninguna, desde el
 *               primer mes con reportes de productos, abril 2026). Revisar cada MESES_REVISION meses.
 *   2. COSTO    los costos (cifra «Costos» de las seis cifras: insumos, productos de Atelier, empaques…)
 *               como % de la venta: los últimos 3 meses cerrados contra los 3 primeros. Si subió
 *               PUNTOS_ALZA puntos o más, la inflación ya se está comiendo el margen.
 *   3. CARTA    % de los productos (con costo conocido) cuyo costo de insumos pasa el 35% del precio.
 *               Desde PCT_CARTA_ALTA% la carta entera se quedó corta.
 *
 *   0 señales → Todavía no · 1 → Prepárala · 2 o 3 → Ya toca.
 *
 * Fecha sugerida: un DOMINGO, porque las semanas del reporte de Byte van de domingo a sábado: así la
 * semana del cambio no queda a medio camino y la prueba se mide limpia. Al menos DIAS_PREPARACION días
 * después de hoy (imprimir la carta, cambiar Byte, avisar al equipo).
 */

export const MESES_REVISION = 6;
export const PUNTOS_ALZA = 2;
export const PCT_CARTA_ALTA = 15;
export const DIAS_PREPARACION = 14;

export type MesCostos = { mes: string; ventas: number; costos: number };
export type Estado = "todavia-no" | "preparala" | "ya-toca";

export type Senal = { activa: boolean; texto: string };

export type CuandoSede = {
  businessId: number;
  sede: string;
  /** Meses desde la última subida; `desdeInicio` = no hubo ninguna desde que hay datos (es «al menos»). */
  meses: number;
  desdeInicio: boolean;
  /** Costo como % de la venta: promedio de los 3 primeros y de los 3 últimos meses cerrados. */
  costoAntesPct: number | null;
  costoAhoraPct: number | null;
  mesesCosto: { desde: string; hasta: string } | null;
  /** Productos sobre el 35% de costo, del total con costo conocido. */
  sobreTope: number;
  conCosto: number;
  senales: { tiempo: Senal; costo: Senal; carta: Senal };
  estado: Estado;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Meses enteros entre dos fechas ISO (aaaa-mm-dd o aaaa-mm). */
export function mesesEntre(desde: string, hasta: string): number {
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1));
}

/** El primer domingo que cae al menos `dias` días después de hoy. */
export function domingoSugerido(hoy: string, dias = DIAS_PREPARACION): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function sumarMeses(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function promedioPct(meses: MesCostos[]): number | null {
  const ventas = meses.reduce((t, m) => t + m.ventas, 0);
  return ventas > 0 ? r1((meses.reduce((t, m) => t + m.costos, 0) / ventas) * 100) : null;
}

export function cuandoSubir(input: {
  businessId: number;
  sede: string;
  hoy: string;
  /** Desde cuándo hay datos de productos (sin subida detectada, se cuenta desde aquí). */
  inicioDatos: string;
  /** Fecha de la última subida detectada en esta sede; null = ninguna. */
  ultimaSubida: string | null;
  /** Meses CERRADOS con ventas y costos, en orden. */
  meses: MesCostos[];
  sobreTope: number;
  conCosto: number;
}): CuandoSede {
  const desdeInicio = input.ultimaSubida === null;
  const meses = mesesEntre(input.ultimaSubida ?? input.inicioDatos, input.hoy);
  const tiempo: Senal = {
    activa: meses >= MESES_REVISION,
    texto: desdeInicio
      ? `Sin subidas en al menos ${meses} meses (desde que hay datos).`
      : `${meses} ${meses === 1 ? "mes" : "meses"} desde la última subida.`,
  };

  const validos = input.meses.filter((m) => m.ventas > 0);
  let costoAntesPct: number | null = null, costoAhoraPct: number | null = null, mesesCosto: CuandoSede["mesesCosto"] = null;
  let costo: Senal = { activa: false, texto: "Faltan meses cerrados para comparar el costo." };
  if (validos.length >= 4) {
    const n = Math.min(3, Math.floor(validos.length / 2));
    costoAntesPct = promedioPct(validos.slice(0, n));
    costoAhoraPct = promedioPct(validos.slice(-n));
    mesesCosto = { desde: validos[0].mes, hasta: validos[validos.length - 1].mes };
    if (costoAntesPct !== null && costoAhoraPct !== null) {
      const dif = r1(costoAhoraPct - costoAntesPct);
      costo = {
        activa: dif >= PUNTOS_ALZA,
        texto: dif >= PUNTOS_ALZA
          ? `Los costos pasaron de ${costoAntesPct}% a ${costoAhoraPct}% de la venta (+${dif} puntos).`
          : dif > 0
            ? `Los costos subieron poco: de ${costoAntesPct}% a ${costoAhoraPct}% de la venta.`
            : `Los costos no subieron: de ${costoAntesPct}% a ${costoAhoraPct}% de la venta.`,
      };
    }
  }

  const pctCarta = input.conCosto > 0 ? (input.sobreTope / input.conCosto) * 100 : 0;
  const carta: Senal = {
    activa: pctCarta >= PCT_CARTA_ALTA,
    texto: `${input.sobreTope} de ${input.conCosto} productos tienen un costo de insumos de más del 35% del precio.`,
  };

  const activas = [tiempo, costo, carta].filter((s) => s.activa).length;
  return {
    businessId: input.businessId, sede: input.sede, meses, desdeInicio,
    costoAntesPct, costoAhoraPct, mesesCosto, sobreTope: input.sobreTope, conCosto: input.conCosto,
    senales: { tiempo, costo, carta },
    estado: activas >= 2 ? "ya-toca" : activas === 1 ? "preparala" : "todavia-no",
  };
}
