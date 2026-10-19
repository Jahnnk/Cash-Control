import { getFrescuraGrupo } from "@/app/actions/frescura";
import { getSeisCifras } from "@/app/actions/seis-cifras";
import { getFlujoCaja } from "@/app/actions/flujo-caja";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { leerMotores } from "@/lib/motores-ebitda-sql";
import { GrupoReportesClient } from "./grupo-reportes-client";

export const dynamic = "force-dynamic";

export default async function GrupoReportesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  // ?mes=2026-09 → los reportes de ese mes (igual que el dashboard). Sin parámetro: el mes en curso, según Lima.
  const { mes: pedido } = await searchParams;
  const mesActual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) && pedido <= mesActual ? pedido : mesActual;
  // En paralelo: la frescura no debe retrasar el reporte, y si falla
  // la página sale igual (getFrescuraGrupo devuelve null, nunca lanza).
  const [frescura, cifras, flujo, be] = await Promise.all([getFrescuraGrupo(), getSeisCifras(mes), getFlujoCaja(mes), getGroupBreakeven(mes)]);
  // Los cuatro motores del EBITDA: parten de las seis cifras; si fallan, la página sale igual.
  const motores = cifras.ok ? await leerMotores(cifras.data).catch((e) => { console.error("[leerMotores] failed:", e); return null; }) : null;
  return (
    <GrupoReportesClient
      selectedMonth={mes}
      mesActual={mesActual}
      frescura={frescura}
      cifras={cifras.ok ? cifras.data : null}
      flujo={flujo.ok ? flujo.data : null}
      motores={motores}
      breakeven={be.ok ? be.data : null}
    />
  );
}
