/**
 * ¿El reporte de productos de un mes es confiable? (22-oct-2026). Se compara lo que suma el reporte de rotación de Byte
 * con la venta diaria de Byte de los mismos días: deberían ser casi iguales (may–oct 2026, las tres sedes: −6% a +4%).
 * Si se pasa de 10% (Jahnn, 22-oct-2026; empezó en 15%), el reporte no sirve para comparar y ese mes NO entra a tendencias
 * ni comparaciones hasta que se vuelva a subir bien. Casos: Atelier mayo-2026 traía ~5 meses (S/201,761 contra S/38,343);
 * Atelier abril, productos P- a precio de lista (+42%); Fonavi y Centro abril, +12% (probables promociones contadas a
 * precio de lista). La regla es automática: al subir el archivo corregido, el mes vuelve solo.
 */

export const TOLERANCIA_REPORTE_PRODUCTOS = 0.1;

export type Confiabilidad = { confiable: boolean; productos: number; byte: number; difPct: number | null; motivo: string | null };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export function evaluarReporteProductos(input: { sede: string; mes: string; productos: number; byte: number }): Confiabilidad {
  const { productos, byte } = input;
  // Sin venta de Byte con qué comparar, no se puede decir que esté mal.
  if (!(byte > 0) || !(productos > 0)) return { confiable: true, productos, byte, difPct: null, motivo: null };
  const difPct = Math.round(((productos - byte) / byte) * 1000) / 10;
  if (Math.abs(productos - byte) <= TOLERANCIA_REPORTE_PRODUCTOS * byte) return { confiable: true, productos, byte, difPct, motivo: null };
  const mes = MESES[Number(input.mes.slice(5, 7)) - 1];
  return {
    confiable: false, productos, byte, difPct,
    motivo: `El reporte de productos de ${input.sede} de ${mes} suma ${soles(productos)} y Byte dice que se vendió ${soles(byte)} (${difPct > 0 ? "+" : ""}${difPct}%): no es confiable y no entra a las tendencias. Vuelve a exportarlo de Byte solo con ese mes y súbelo.`,
  };
}
