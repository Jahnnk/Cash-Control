/**
 * Empareja el nombre de Byte con una persona del equipo · lógica PURA.
 *
 * El reporte «Ventas por Trabajador» de Byte trae el nombre legal completo
 * («PIERO RENATO OBANDO ALVAREZ»); el equipo de bonos usa el nombre corto
 * con el que todos se conocen («Piero Renato»). El premio al mejor vendedor
 * se paga a una persona del equipo, así que hay que traducir de uno a otro.
 *
 * Regla: el nombre del equipo tiene que ser el COMIENZO del nombre de Byte,
 * palabra por palabra. Gana el más largo, porque Fonavi tiene dos Pieros:
 *
 *   «PIERO ANDRE MANOSALVA ALVAREZ» → solo «Piero» es su comienzo.
 *   «PIERO RENATO OBANDO ALVAREZ»   → «Piero» y «Piero Renato» lo son; gana
 *                                      el más largo, «Piero Renato».
 *
 * Si no hay ninguno, o si dos empatan, devuelve null: es preferible que
 * Kelly o Jahnn elijan a quién premiar a que el sistema le pague el premio
 * a la persona equivocada.
 */

const normalizar = (s: string) =>
  s.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function emparejarVendedor(nombreByte: string, equipo: string[]): string | null {
  const palabrasByte = normalizar(nombreByte).split(" ");
  let mejor: string | null = null;
  let largo = 0;
  let empate = false;
  for (const nombre of equipo) {
    const palabras = normalizar(nombre).split(" ");
    if (palabras.length === 0 || palabras[0] === "") continue;
    const esComienzo = palabras.length <= palabrasByte.length && palabras.every((p, i) => p === palabrasByte[i]);
    if (!esComienzo) continue;
    if (palabras.length > largo) {
      mejor = nombre;
      largo = palabras.length;
      empate = false;
    } else if (palabras.length === largo) {
      empate = true;
    }
  }
  return empate ? null : mejor;
}
