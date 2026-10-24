/**
 * Saca la FOTO de setiembre 2026 (Fonavi y Centro) para la prueba de regresión · SOLO LECTURA.
 *
 *   npm run regresion:foto
 *   npm run regresion:foto -- --excel "<ruta al Excel vigente de Fonavi>" --excel "<ruta al de Centro>"
 *
 * Guarda en scripts/regresion/fixtures/ lo que necesitan cifrasDelMes y controlesDeSede (los movimientos del mes,
 * las ventas, los saldos, las cargas). Esa carpeta está en .gitignore y NO se sube a GitHub: el repositorio es
 * público y la foto tiene montos, sueldos y nombres.
 *
 * Por qué una foto y no la base viva (ajuste de Jahnn, 24-oct-2026): cuando Kelly corrija setiembre y vuelva a subir
 * el Excel —que es justo lo que queremos— la base cambia y la prueba fallaría sin que haya un error de cálculo. La
 * foto se regenera solo a propósito.
 *
 * --excel: las cargas anteriores al 24-oct-2026 no guardaron la pestaña CONTROL EFECTIVO. Si se pasa el archivo
 * VIGENTE de una sede (el mismo nombre que la carga que manda), su fila TOTAL se toma del archivo. Nada se escribe en
 * la base.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, join } from "path";
import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";
import { leerDatosControles } from "../../src/lib/controles-fiabilidad-sql";
import { hojaControlEfectivoDelMes, parseControlEfectivo } from "../../src/lib/control-efectivo-parser";
import type { DatosControles } from "../../src/lib/controles-fiabilidad";

const MES = "2026-09";
const SEDES: [number, "Fonavi" | "Centro"][] = [[2, "Fonavi"], [3, "Centro"]];
export const RUTA_FOTO = join(__dirname, "fixtures", "2026-09-fonavi-centro.json");

export type FotoRegresion = {
  generada: string;
  mes: string;
  aviso: string;
  /** De dónde salió la fila TOTAL de CONTROL EFECTIVO de cada sede. */
  efectivoDesde: Record<string, "carga" | "archivo" | "no-hay">;
  sedes: Record<"Fonavi" | "Centro", DatosControles>;
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const excels = process.argv.flatMap((a, i, xs) => (a === "--excel" && xs[i + 1] ? [xs[i + 1]] : []));
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const sedes = {} as FotoRegresion["sedes"];
  const efectivoDesde: FotoRegresion["efectivoDesde"] = {};
  for (const [bId, nombre] of SEDES) {
    const d = await leerDatosControles(sql as never, bId, MES, hoy);
    efectivoDesde[nombre] = d.efectivo ? "carga" : "no-hay";
    const vigente = d.lotes.filter((l) => l.vigente).at(-1);
    const archivo = vigente ? excels.find((e) => basename(e) === vigente.archivo) : undefined;
    if (!d.efectivo && archivo) {
      const wb = XLSX.read(readFileSync(archivo), { type: "buffer" });
      const hoja = hojaControlEfectivoDelMes(wb.SheetNames, MES);
      const ce = hoja ? parseControlEfectivo(XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null }) as unknown[][], hoja) : null;
      if (ce) { d.efectivo = { ventas: ce.ventas, depositos: ce.depositos }; efectivoDesde[nombre] = "archivo"; }
    } else if (!d.efectivo && excels.length) {
      console.warn(`${nombre}: ningún --excel se llama como la carga vigente (${vigente?.archivo ?? "—"}); CONTROL EFECTIVO queda sin dato.`);
    }
    sedes[nombre] = d;
    console.log(`${nombre}: ${d.datos.gastos.length + d.datos.ingresos.length} movimientos · CONTROL EFECTIVO: ${efectivoDesde[nombre]}${d.efectivo ? ` (${d.efectivo.ventas} vs ${d.efectivo.depositos})` : ""}`);
  }
  const foto: FotoRegresion = {
    generada: new Date().toISOString(), mes: MES,
    aviso: "Datos financieros reales de Yayi's. NO subir a GitHub (scripts/regresion/fixtures/ está en .gitignore).",
    efectivoDesde, sedes,
  };
  mkdirSync(join(__dirname, "fixtures"), { recursive: true });
  writeFileSync(RUTA_FOTO, JSON.stringify(foto, null, 1));
  console.log(`Foto guardada en ${RUTA_FOTO}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
