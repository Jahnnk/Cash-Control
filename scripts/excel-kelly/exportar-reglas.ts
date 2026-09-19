/**
 * Exporta la lista única y las reglas (lib/reglas-gasto.ts) a JSON para
 * convertir-lista-unica.py, que agrega las pestañas CÓMO USAR, CATÁLOGO y
 * REGLAS, las columnas automáticas del mes y la PE nueva a un Excel de Kelly.
 *
 *   npx tsx scripts/excel-kelly/exportar-reglas.ts <salida.json>
 *
 * Si se cambian las reglas en el código, hay que volver a exportarlas y
 * reemplazar la pestaña REGLAS del Excel (o pegarlas a mano).
 */
import { writeFileSync } from "fs";
import { REGLAS_GASTO, CATEGORIAS_GASTO } from "../../src/lib/reglas-gasto";
writeFileSync(process.argv[2] ?? "reglas.json", JSON.stringify({ reglas: REGLAS_GASTO, categorias: CATEGORIAS_GASTO }));
