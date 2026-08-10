/**
 * Búsqueda de documentos por cobrar — pedido de Luis (10-ago-2026):
 * con decenas de documentos, encontrar el de un cliente a ojo es lento.
 *
 * Vive acá y no dentro del componente para poder probarlo (convención
 * del repo: la lógica en `src/lib/**` como función pura, la pantalla
 * solo pinta).
 *
 * Busca en los cuatro campos con los que Luis identifica un documento:
 * nombre del cliente, RUC/DNI, la serie que ve en Byte ("FB02-001207")
 * y la llave interna ("FB02-1207") — así encuentra igual si teclea el
 * número con ceros o sin ellos.
 */

/** Sin tildes ni mayúsculas: "SOFIA" tiene que encontrar a "SOFÍA". */
export function normalizarBusqueda(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export type DocumentoBuscable = {
  cliente: string;
  documento: string | null;
  serie: string | null;
  docKey: string;
};

/**
 * Filtra por texto libre. Cada palabra debe aparecer en ALGÚN campo:
 * así "kaphiy 1204" encuentra la factura 1204 de KAPHIY, aunque el
 * nombre y el número vivan en columnas distintas.
 */
export function filtrarDocumentos<T extends DocumentoBuscable>(
  docs: T[],
  busqueda: string,
): T[] {
  const q = normalizarBusqueda(busqueda);
  if (!q) return docs;

  const palabras = q.split(/\s+/).filter(Boolean);
  return docs.filter((d) => {
    const campos = [d.cliente, d.documento, d.serie, d.docKey]
      .filter((c): c is string => Boolean(c))
      .map(normalizarBusqueda);
    return palabras.every((p) => campos.some((campo) => campo.includes(p)));
  });
}
