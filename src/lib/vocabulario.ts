/**
 * El vocabulario único de las pantallas de Grupo (Dashboard y Reportes), 19-oct-2026.
 *
 * Había unos 50 términos para pocos conceptos (Vendido / Ingresado / Ventas; Margen / Ganancia real / EBITDA;
 * Punto de equilibrio / Piso / Costos cubiertos; Liquidez / Saldo / Caja / Entró / Salió). Un dueño necesita seis
 * palabras, cada una con UN solo significado. Las demás (EBITDA, margen, conciliación…) viven en «Para el contador».
 */

export const GLOSARIO: { palabra: string; significa: string }[] = [
  { palabra: "Ventas", significa: "lo que se vendió, según Byte." },
  { palabra: "Costos y gastos", significa: "lo que cuesta operar: los costos suben con la venta (insumos, productos de Atelier, empaques) y los gastos son lo fijo (planilla, alquiler, servicios)." },
  { palabra: "Ganancia", significa: "lo que queda después de costos, gastos e impuestos." },
  { palabra: "Plata", significa: "lo que entró de verdad a la cuenta, lo que salió y lo que hay hoy." },
  { palabra: "Mínimo", significa: "lo mínimo que hay que vender para no perder; «mínimo cubierto» dice cuánto de eso ya se vendió." },
  { palabra: "Meta", significa: "lo que se quiere vender en el mes, según el presupuesto aprobado." },
];
