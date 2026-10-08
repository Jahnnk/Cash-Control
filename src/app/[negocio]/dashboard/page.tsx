import { notFound } from "next/navigation";
import { getCommandCenter, type CommandCenterData } from "@/app/actions/command-center";
import { getGroupVentasComparison } from "@/app/actions/group-ventas";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { getLiquidezGrupo } from "@/app/actions/liquidez";
import { getSeisCifras } from "@/app/actions/seis-cifras";
import { getResumenExtra } from "@/app/actions/resumen-grupo";
import { getVerificacionKelly } from "@/app/actions/verificacion-kelly";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { construirAtencion } from "@/lib/grupo/atencion";
import { proyeccionSede, textoEquilibrio, textoGanancia } from "@/lib/grupo/estado-mes";
import { CommandCenter } from "./command-center";
import { SedeDashboard } from "./sede-dashboard";

export const dynamic = "force-dynamic";

const SEDES: Record<string, { id: number; nombre: string }> = {
  atelier: { id: 1, nombre: "Yayi's Atelier" },
  fonavi: { id: 2, nombre: "Yayi's Fonavi" },
  centro: { id: 3, nombre: "Yayi's Centro" },
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Días sin el Excel de la sede a partir de los cuales se avisa (llega cada viernes). */
const DIAS_EXCEL = 8;

/**
 * Dashboard de una sede (rediseño UX, 8-oct-2026): las mismas fuentes que el Resumen de Grupo,
 * filtradas a esta sede, para que las dos pantallas digan lo mismo. ?mes=YYYY-MM para un mes cerrado.
 */
export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ negocio: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ negocio }, sp] = await Promise.all([params, searchParams]);
  const sede = SEDES[negocio];
  if (!sede) notFound();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const mesActual = hoy.slice(0, 7);
  const pedido = typeof sp.mes === "string" ? sp.mes : undefined;
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) && pedido <= mesActual ? pedido : mesActual;
  const enCurso = mes === mesActual;

  const [ventas, be, liquidez, cifras, extra, cuadre, frescura, command] = await Promise.all([
    getGroupVentasComparison(mes), getGroupBreakeven(mes), getLiquidezGrupo(), getSeisCifras(mes), getResumenExtra(mes),
    getVerificacionKelly(), getFrescuraGrupo(),
    enCurso ? getCommandCenter().catch((): CommandCenterData | null => null) : Promise.resolve(null),
  ]);

  const [y, m] = mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const v = ventas.ok ? ventas.sedes.find((x) => x.businessId === sede.id && x.hasta?.startsWith(mes)) ?? null : null;
  const r = be.ok ? be.data.sedes.find((x) => x.businessId === sede.id)?.result ?? null : null;
  const liq = liquidez?.sedes.find((x) => x.businessId === sede.id) ?? null;
  const c = cifras.ok ? cifras.data.sedes.find((x) => x.businessId === sede.id) ?? null : null;
  const nombreCorto = sede.nombre.replace("Yayi's ", "");
  const proyeccion = enCurso && v ? Math.round(proyeccionSede(v, diasDelMes)) : null;

  // ¿Qué necesita atención en ESTA sede? (las mismas reglas que el Resumen de Grupo)
  const diasSinRegistrar = v?.hasta
    ? Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${v.hasta}T12:00:00Z`)) / 86_400_000) - 1) : null;
  const fr = frescura?.sedes.find((x) => x.businessId === sede.id);
  const mesAnterior = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const atencion = enCurso ? construirAtencion({
    hoy,
    sedes: [{
      nombre: nombreCorto, code: negocio, deltaPct: v?.mesCmp?.sameDay.pct ?? null, diasComparados: v?.mesCmp?.sameDay.daysCompared ?? 0,
      coberturaBaja: v?.mesCmp?.lowCoverage ?? false, diasSinRegistrar, equilibrioEnRiesgo: r?.estado === "en_riesgo",
      equilibrioPct: r?.avancePct ?? null, diasConDatos: v?.hasta ? Number(v.hasta.slice(8, 10)) : 0,
    }],
    cuadres: (cuadre.ok ? cuadre.items : []).filter((x) => x.businessId === sede.id && x.month >= mesAnterior)
      .map((x) => ({ sede: nombreCorto, mes: x.month, alertas: x.alertas.length })),
    excelPendiente: fr && (fr.diasAtraso ?? 0) >= DIAS_EXCEL
      ? `El Excel de ${nombreCorto} llega hasta el ${fr.lastDate ? `${Number(fr.lastDate.slice(8, 10))}/${fr.lastDate.slice(5, 7)}` : "—"} (hace ${fr.diasAtraso} días).` : null,
    revisionSemanal: null,
    cobrosAtelier: sede.id === 1 ? extra.cobrosAtelier : null,
  }).map((a) => ({
    ...a,
    // En la propia sede, «Ver» el registro lleva al Panel (donde el administrador lo llena) y el Excel al Grupo.
    href: a.href === `/${negocio}/dashboard` ? `/${negocio}/panel` : a.href === "#excel" ? "/grupo/dashboard?pestana=kelly" : a.href,
  })) : [];

  return (
    <SedeDashboard
      sede={sede.nombre} code={negocio} mes={mes} mesActual={mesActual}
      estado={{
        periodo: `${MESES[m - 1]} ${y}`, enCurso, dia: enCurso ? Number(hoy.slice(8, 10)) : diasDelMes, diasDelMes,
        ventas: v?.mes ?? 0, deltaPct: v?.mesCmp?.sameDay.pct ?? null, meta: extra.metas[sede.id] ?? null,
        proyeccion,
        liquidez: liq ? liq.total : null,
        equilibrio: textoEquilibrio(r, enCurso, v && proyeccion ? { ventas: v.mes, proyeccion, diasDelMes } : undefined),
        ganancia: textoGanancia(c),
        flujo: c?.caja.flujo ?? null, liquidezHref: "/grupo/direccion",
        etiquetaVentas: `vendido en ${nombreCorto}`,
        detalleLiquidez: liq?.fecha ? `Banco + caja según el Excel al ${Number(liq.fecha.slice(8, 10))}/${liq.fecha.slice(5, 7)}` : "Banco + caja",
      }}
      atencion={atencion}
      cifras={c}
      diagnostico={command ? <CommandCenter data={command} negocio={negocio} /> : null}
    />
  );
}
