"use client";

/**
 * «¿Cuándo subir y cómo comunicarlo?» (Grupo → Sistema de Dirección → Precios; antes en Productos), fase 3 de «¿Qué precios subir?»
 * (17-nov-2026). Por sede: tres señales (tiempo sin subir, costos sobre la venta, carta sobre la meta de la ruta de precios) y un
 * semáforo; la fecha sugerida (un domingo) con el calendario de la prueba; y la guía para comunicar la
 * subida sin perder la percepción de valor. Solo lectura. Motor: lib/productos/cuando-subir.ts.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { getCostosPorMes, getPruebaPrecios, getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { PRIMER_MES_PRODUCTOS } from "@/lib/productos/cobertura-datos";
import { MESES_REVISION, cuandoSubir, domingoSugerido, sumarMeses, type CuandoSede, type Estado } from "@/lib/productos/cuando-subir";
import { SEMANAS_IDEALES } from "@/lib/productos/prueba-precios";
import { subidaDePrecios } from "@/lib/productos/subida-precios";
import { ConPaso } from "./con-paso";
import { Pastilla, SeccionDesplegable } from "@/components/productos/ui";

const ESTADO: Record<Estado, { texto: string; tono: "rojo" | "ambar" | "verde" }> = {
  "ya-toca": { texto: "Ya toca subir", tono: "rojo" },
  preparala: { texto: "Prepara la subida", tono: "ambar" },
  "todavia-no": { texto: "Todavía no", tono: "verde" },
};

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** «Domingo, 6 de diciembre de 2026»: solo la primera letra en mayúscula. */
const fechaInicio = (iso: string) => { const f = fechaLarga(iso); return f.charAt(0).toUpperCase() + f.slice(1); };
const mesCorto = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-PE", { month: "short", year: "numeric", timeZone: "UTC" });

function Senal({ activa, texto }: { activa: boolean; texto: string }) {
  return (
    <li className="flex gap-2 text-[13px]">
      {activa ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" /> : <Circle className="w-4 h-4 shrink-0 mt-0.5 text-gray-300" />}
      <span className={activa ? "text-gray-900" : "text-gray-500"}>{texto}</span>
    </li>
  );
}

function TarjetaSede({ c }: { c: CuandoSede }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-gray-900">{c.sede}</div>
        <Pastilla tono={ESTADO[c.estado].tono}>{ESTADO[c.estado].texto}</Pastilla>
      </div>
      <ul className="mt-2 space-y-1.5">
        <Senal {...c.senales.tiempo} />
        <Senal {...c.senales.costo} />
        <Senal {...c.senales.carta} />
      </ul>
      {c.mesesCosto && <p className="mt-2 text-[10px] text-gray-400">Costos: los 3 primeros contra los 3 últimos meses cerrados ({mesCorto(c.mesesCosto.desde)} a {mesCorto(c.mesesCosto.hasta)}).</p>}
    </div>
  );
}

const GUIA: { titulo: string; puntos: string[] }[] = [
  {
    titulo: "En la carta",
    puntos: [
      "Sube con la carta nueva. No pongas etiquetas con el precio nuevo encima de la carta vieja.",
      "Escribe el precio sin «S/» ni decimales: «23», no «S/ 23.00». Tu carta ya lo hace así: mantenlo.",
      "No pongas los precios en una columna alineada. Si están en fila, el cliente compara precios en vez de elegir platos.",
      "En los productos que suben, mejora la descripción: masa madre, insumos de la región, gramaje, cómo se prepara. El cliente paga más por lo que entiende.",
      "Deja iguales los precios ancla (empanadas, americano, cookie de avena). Así la carta se sigue viendo accesible.",
      "No subas una sección entera a la vez. Reparte la subida entre secciones.",
    ],
  },
  {
    titulo: "Con el equipo",
    puntos: [
      "Antes del cambio, explica al equipo qué sube, cuánto y por qué.",
      "Dales una respuesta corta para el cliente que pregunte: «Subieron nuestros insumos y preferimos mantener la calidad: seguimos con masa madre y productos frescos».",
      "No bajes la porción ni cambies un insumo por otro más barato para no subir el precio. El cliente lo nota, y perder su confianza cuesta más que la subida.",
    ],
  },
  {
    titulo: "Hacia afuera",
    puntos: [
      "No anuncies la subida en redes. Anuncia lo nuevo de la carta: un producto nuevo o una mejora.",
      "El mes de la subida, cuida más la experiencia: tiempos de atención, presentación y trato. Es cuando el cliente mira con más atención.",
    ],
  },
];

type Datos = { sedes: CuandoSede[]; hoy: string };

export function CuandoSubir({ month, sede, paso }: { month: string; sede: number; /** Número del paso dentro de Sistema de Dirección → Precios. */ paso?: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: Datos | null; error: string | null } | null>(null);
  const clave = month;

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    Promise.all([getCostosPorMes(), getPruebaPrecios(month), getRentabilidadProductos(month, 2), getRentabilidadProductos(month, 3)]).then(([costos, prueba, r2, r3]) => {
      if (!vivo) return;
      if (!costos.ok) { setEstado({ clave, data: null, error: costos.error }); return; }
      const fase1 = new Map([r2, r3].flatMap((r) => (r.ok && r.data ? [[r.data.businessId, subidaDePrecios(r.data)] as const] : [])));
      const sedes = costos.sedes.map((s) => {
        const subidas = prueba.ok ? prueba.data.filas.filter((f) => f.sedeId === s.businessId).map((f) => f.desde).sort() : [];
        const f1 = fase1.get(s.businessId);
        return cuandoSubir({
          businessId: s.businessId, sede: s.sede, hoy: costos.hoy, inicioDatos: `${PRIMER_MES_PRODUCTOS}-01`,
          ultimaSubida: subidas.length ? subidas[subidas.length - 1] : null,
          meses: s.meses,
          sobreTope: f1 ? f1.filas.filter((f) => f.necesidad === "alta").length : 0,
          conCosto: f1 ? f1.filas.length : 0,
        });
      });
      setEstado({ clave, data: { sedes, hoy: costos.hoy }, error: null });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const d = listo?.data ?? null;
  const toca = d?.sedes.filter((s) => s.estado !== "todavia-no") ?? [];
  const domingo = d ? domingoSugerido(d.hoy) : null;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : d
      ? <p className="text-xs text-gray-600">
          {d.sedes.map((s, i) => (
            <span key={s.businessId}>{i > 0 && " · "}{s.sede}: <strong className={s.estado === "ya-toca" ? "text-red-700" : s.estado === "preparala" ? "text-amber-700" : "text-emerald-700"}>{ESTADO[s.estado].texto.toLowerCase()}</strong></span>
          ))}
          {toca.length > 0 && domingo && <> · fecha sugerida: <strong className="text-gray-800">{fechaLarga(domingo)}</strong></>}.
        </p>
      : null;

  return (
    <SeccionDesplegable
      titulo={<ConPaso paso={paso}>{"¿Cuándo subir y cómo comunicarlo?"}</ConPaso>}
      subtitulo="Tres señales por sede para saber si ya toca, la fecha sugerida y cómo avisar sin perder la percepción de valor."
      resumen={resumen}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !d || !domingo ? <p className="text-sm text-gray-400">Calculando…</p>
        : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {d.sedes.map((c) => <TarjetaSede key={c.businessId} c={c} />)}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">Calendario sugerido</h4>
              <ol className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 text-[13px]">
                <li className="px-4 py-2.5"><strong className="text-gray-900">{fechaInicio(domingo)}</strong> · Centro empieza la prueba con los precios nuevos. Las semanas del reporte de Byte van de domingo a sábado: cambiar el precio un domingo deja la prueba limpia.</li>
                <li className="px-4 py-2.5"><strong className="text-gray-900">{fechaInicio(sumarDias(domingo, SEMANAS_IDEALES * 7))}</strong> · Pasaron {SEMANAS_IDEALES} semanas. Revisa «Prueba de precios»: lo que funciona sube también en Fonavi; lo que no, vuelve a su precio.</li>
                <li className="px-4 py-2.5"><strong className="text-gray-900">{fechaInicio(sumarMeses(domingo, MESES_REVISION))}</strong> · Próxima revisión de precios ({MESES_REVISION} meses después).</li>
              </ol>
              <p className="mt-1.5 text-[11px] text-gray-500">La fecha es el primer domingo con al menos 2 semanas para preparar la carta, cambiar Byte y avisar al equipo. Si quieres otra fecha, que también sea un domingo.</p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">Cómo comunicarlo</h4>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {GUIA.map((g) => (
                  <div key={g.titulo} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{g.titulo}</div>
                    <ul className="mt-2 list-disc pl-4 space-y-1.5 text-[13px] text-gray-700">
                      {g.puntos.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
              <p><strong>Las tres señales.</strong> <strong>Tiempo</strong>: {MESES_REVISION} meses o más sin subir. <strong>Costos</strong>: la cifra «Costos» del Dashboard (insumos, productos de Atelier, empaques) subió 2 puntos o más como % de la venta. En las cafeterías incluye lo que compran a Atelier a su precio interno. <strong>Carta</strong>: 15% o más de los productos tienen un costo de insumos que pasa la meta de Recetas y costos (30% del precio en la cafetería, 22% en lo de Atelier). Con 2 o 3 señales, ya toca; con 1, prepárala.</p>
              <p>La última subida la detecta «Prueba de precios» en el reporte semanal de Byte. Sin ninguna, se cuenta desde abril 2026, cuando empiezan los reportes de productos.</p>
            </div>
          </div>
        )}
    </SeccionDesplegable>
  );
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
