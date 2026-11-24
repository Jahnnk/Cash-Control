"use client";

import { useEffect, useMemo, useState } from "react";
import { Dices, Plus, X, Loader2, Gift, RotateCcw } from "lucide-react";
import { emitirVale, type ProductoVale, type ValeVista } from "@/app/actions/vales";
import {
  PARTICIPANTES_SORTEO, MAX_PREMIOS_SORTEO, DIAS_VIGENCIA_DEFECTO, sortear, sumarDias,
} from "@/lib/vales";
import { useToast } from "@/components/toast-provider";
import { SelectorProductos, itemsParaEmitir, resumenElegidos, type Elegido } from "./selector-productos";

/**
 * Sorteo de los martes entre socios y administradores. Reemplaza la página
 * web de sorteos: Jahnn arma los premios (cada uno, productos de la carta), se
 * sortea QUIÉN se lleva cada uno y se crean los vales con el nombre del
 * ganador, listos para que cada uno se lo dé a su cliente.
 *
 * El azar sale de crypto (no de Math.random) y está probado: cada persona
 * tiene exactamente la misma probabilidad (lib/vales.ts → sortear).
 */

type Premio = { id: number; elegidos: Elegido[] };
type Sede = "fonavi" | "centro";

const MS_POR_REVELACION = 1500;

function hoyLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function SorteoPanel({
  productos, onCreados,
}: {
  productos: ProductoVale[];
  onCreados: (v: ValeVista[]) => void;
}) {
  const { showToast } = useToast();

  const [participantes, setParticipantes] = useState<{ nombre: string; va: boolean }[]>(
    PARTICIPANTES_SORTEO.map((n) => ({ nombre: n, va: true })),
  );
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [premios, setPremios] = useState<Premio[]>(() => PARTICIPANTES_SORTEO.map((_, i) => ({ id: i + 1, elegidos: [] })));
  const [siguienteId, setSiguienteId] = useState(PARTICIPANTES_SORTEO.length + 1);
  const [venceEl, setVenceEl] = useState(() => sumarDias(hoyLima(), DIAS_VIGENCIA_DEFECTO));

  const [resultado, setResultado] = useState<{ persona: string; premio: Premio }[] | null>(null);
  const [sinPremio, setSinPremio] = useState<string[]>([]);
  const [reveladas, setReveladas] = useState(0);
  const [girando, setGirando] = useState("");
  // La sede de cada ganador NO se adivina: hay que elegirla (24-nov-2026: se crearon 6 vales y todos salieron de
  // Fonavi porque la sede venía puesta y nadie la miró).
  const [sedes, setSedes] = useState<Record<string, Sede | undefined>>({});
  const [creando, setCreando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Quiénes ya tienen su vale creado: si algo falla y se reintenta, esos se saltan (nunca se duplica un vale).
  const [hechos, setHechos] = useState<string[]>([]);
  const [listo, setListo] = useState(false);

  const nombresActivos = useMemo(() => participantes.filter((p) => p.va).map((p) => p.nombre), [participantes]);

  // Revelar de a uno, con suspenso: cada premio sale 1,5 s después del anterior.
  useEffect(() => {
    if (!resultado || reveladas >= resultado.length) return;
    const t = setTimeout(() => setReveladas((n) => n + 1), MS_POR_REVELACION);
    return () => clearTimeout(t);
  }, [resultado, reveladas]);

  // Mientras espera, el nombre «gira» entre los participantes (solo efecto visual).
  const sorteando = resultado !== null && reveladas < resultado.length;
  useEffect(() => {
    if (!sorteando) return;
    const nombres = nombresActivos;
    const t = setInterval(() => setGirando(nombres[Math.floor(Math.random() * nombres.length)] ?? ""), 90);
    return () => clearInterval(t);
  }, [sorteando, nombresActivos]);

  const terminado = resultado !== null && !sorteando;

  function agregarNombre() {
    const n = nuevoNombre.trim();
    if (!n) return;
    if (participantes.some((p) => p.nombre.toLowerCase() === n.toLowerCase())) { showToast("Ese nombre ya está en la lista.", "error"); return; }
    setParticipantes((l) => [...l, { nombre: n, va: true }]);
    setNuevoNombre("");
  }

  function agregarPremio() {
    if (premios.length >= MAX_PREMIOS_SORTEO) return;
    setPremios((l) => [...l, { id: siguienteId, elegidos: [] }]);
    setSiguienteId((n) => n + 1);
  }

  function iniciarSorteo() {
    const llenos = premios.filter((p) => p.elegidos.length > 0);
    if (llenos.length !== premios.length) {
      showToast(`Al premio ${premios.findIndex((p) => p.elegidos.length === 0) + 1} le faltan productos. Complétalo o quítalo.`, "error");
      return;
    }
    const r = sortear(nombresActivos, premios);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setResultado(r.ganadores);
    setSinPremio(r.sinPremio);
    setSedes({});
    setErrores({});
    setHechos([]);
    setReveladas(0);
    setListo(false);
  }

  function reiniciar() {
    setResultado(null); setSinPremio([]); setReveladas(0); setErrores({}); setHechos([]); setListo(false);
  }

  async function crearVales() {
    if (!resultado) return;
    setCreando(true);
    const creados: ValeVista[] = [];
    const fallos: Record<string, string> = {};
    for (const g of resultado) {
      if (hechos.includes(g.persona)) continue;
      const sede = sedes[g.persona];
      if (!sede) { fallos[g.persona] = "Elige en qué sede se canjea este vale."; continue; }
      const r = await emitirVale({
        sede,
        items: itemsParaEmitir(g.premio.elegidos),
        para: g.persona,
        venceEl,
      });
      if (r.ok) creados.push(r.vale); else fallos[g.persona] = r.error;
    }
    setCreando(false);
    setErrores(fallos);
    setHechos((h) => [...h, ...creados.map((v) => v.para ?? "")]);
    if (creados.length > 0) onCreados(creados);
    if (Object.keys(fallos).length === 0) {
      setListo(true);
      showToast(`${creados.length} vale${creados.length === 1 ? "" : "s"} creado${creados.length === 1 ? "" : "s"}`, "success");
    } else {
      showToast(`${creados.length} creados, ${Object.keys(fallos).length} con error. Revisa abajo.`, "error");
    }
  }

  const faltanSedes = resultado !== null && resultado.some((g) => !hechos.includes(g.persona) && !sedes[g.persona]);
  const puedeSortear = nombresActivos.length > 0 && premios.length > 0 && premios.length <= nombresActivos.length;

  // ───────── Con resultado: revelación, sede de cada ganador y crear los vales ─────────
  if (resultado) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Dices className="w-4 h-4 text-primary" />Resultado del sorteo</h2>
          {!listo && !creando && (
            <button onClick={reiniciar} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">
              <RotateCcw className="w-3.5 h-3.5" />Volver a armar
            </button>
          )}
        </div>

        <ul className="space-y-2">
          {resultado.map((g, i) => {
            const visible = i < reveladas;
            const enCurso = i === reveladas;
            return (
              <li key={g.premio.id} className={`rounded-lg border p-3 transition-all ${visible ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
                <div className="text-xs text-gray-500">Premio {i + 1}: {resumenElegidos(g.premio.elegidos)}</div>
                {visible ? (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xl font-extrabold text-[#004C40] flex items-center gap-2"><Gift className="w-5 h-5 text-[#E4472B]" />{g.persona}</div>
                    {terminado && !listo && !hechos.includes(g.persona) && (
                      <select
                        value={sedes[g.persona] ?? ""} onChange={(e) => setSedes((x) => ({ ...x, [g.persona]: (e.target.value || undefined) as Sede | undefined }))}
                        disabled={creando}
                        className={`rounded-lg px-2 py-1.5 text-xs bg-white border ${sedes[g.persona] ? "border-gray-300" : "border-amber-400 ring-1 ring-amber-300"}`}
                        aria-label={`Sede del vale de ${g.persona}`}
                      >
                        <option value="" disabled>Elige la sede…</option>
                        <option value="fonavi">Se canjea en Fonavi</option>
                        <option value="centro">Se canjea en Centro</option>
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-xl font-extrabold text-gray-400">{enCurso ? `🎲 ${girando || "…"}` : "…"}</div>
                )}
                {hechos.includes(g.persona) && <div className="mt-1 text-xs text-emerald-800">✓ Vale creado ({sedes[g.persona] === "centro" ? "Centro" : "Fonavi"})</div>}
                {errores[g.persona] && <div className="mt-1 text-xs text-red-700">{errores[g.persona]}</div>}
              </li>
            );
          })}
        </ul>

        {terminado && sinPremio.length > 0 && (
          <div className="text-xs text-gray-600">Sin premio esta vez: <strong>{sinPremio.join(", ")}</strong></div>
        )}

        {terminado && !listo && (
          <div className="space-y-2">
            <div className="text-xs text-gray-600">
              Cada vale se crea con el nombre del ganador y vale hasta el {venceEl.split("-").reverse().join("/")}. <strong>Elige en qué sede lo usará su cliente</strong> (un vale de Fonavi no se canjea en Centro).
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">Atajo:</span>
              {(["fonavi", "centro"] as const).map((sd) => (
                <button
                  key={sd} type="button" disabled={creando}
                  onClick={() => setSedes((x) => ({ ...x, ...Object.fromEntries(resultado.filter((g) => !hechos.includes(g.persona)).map((g) => [g.persona, sd])) }))}
                  className="px-2.5 py-1 font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Todos en {sd === "fonavi" ? "Fonavi" : "Centro"}
                </button>
              ))}
            </div>
            <button
              onClick={crearVales} disabled={creando || faltanSedes}
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:opacity-90 rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {creando && <Loader2 className="w-4 h-4 animate-spin" />}
              {Object.keys(errores).length > 0 ? "Reintentar los que fallaron" : `Crear los ${resultado.length} vales`}
            </button>
            {faltanSedes && <div className="text-xs text-amber-800">Falta elegir la sede de algún ganador.</div>}
          </div>
        )}
        {listo && <div className="text-sm font-semibold text-emerald-800">✓ Vales creados. Mándaselos a cada ganador desde la lista de abajo.</div>}
      </div>
    );
  }

  // ───────── Armando el sorteo ─────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-5">
      <div>
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Dices className="w-4 h-4 text-primary" />Sorteo de vales</h2>
        <p className="text-xs text-gray-500 mt-1">Arma los premios, marca quiénes participan y sortea. Cada ganador recibe su vale para dárselo a un cliente.</p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-700">¿Quiénes participan?</div>
        <div className="flex flex-wrap gap-2">
          {participantes.map((p) => (
            <label key={p.nombre} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm cursor-pointer ${p.va ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-white border-gray-300 text-gray-500"}`}>
              <input
                type="checkbox" checked={p.va} className="accent-emerald-700"
                onChange={() => setParticipantes((l) => l.map((x) => (x.nombre === p.nombre ? { ...x, va: !x.va } : x)))}
              />
              {p.nombre}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} maxLength={40}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarNombre(); } }}
            placeholder="Agregar a alguien más" className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <button type="button" onClick={agregarNombre} className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Agregar</button>
        </div>
        <div className="text-xs text-gray-500">{nombresActivos.length} participante{nombresActivos.length === 1 ? "" : "s"} · {premios.length} premio{premios.length === 1 ? "" : "s"}</div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-700">Premios (los productos de cada vale)</div>
        {premios.map((pr, i) => (
          <div key={pr.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Premio {i + 1}</div>
              {premios.length > 1 && (
                <button type="button" onClick={() => setPremios((l) => l.filter((x) => x.id !== pr.id))} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Quitar el premio ${i + 1}`}><X className="w-4 h-4" /></button>
              )}
            </div>
            <SelectorProductos
              productos={productos} compacto elegidos={pr.elegidos}
              onChange={(e) => setPremios((l) => l.map((x) => (x.id === pr.id ? { ...x, elegidos: e } : x)))}
            />
          </div>
        ))}
        {premios.length < MAX_PREMIOS_SORTEO && (
          <button type="button" onClick={agregarPremio} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus className="w-4 h-4" />Agregar otro premio</button>
        )}
      </div>

      <div className="max-w-xs">
        <label className="text-xs font-medium text-gray-700">Los vales valen hasta</label>
        <input type="date" value={venceEl} min={hoyLima()} max={sumarDias(hoyLima(), 180)} onChange={(e) => setVenceEl(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {premios.length > nombresActivos.length && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Hay más premios ({premios.length}) que participantes ({nombresActivos.length}). Quita premios o suma participantes.
        </div>
      )}

      <button
        onClick={iniciarSorteo} disabled={!puedeSortear}
        className="w-full px-4 py-3 text-sm font-bold text-white bg-[#E4472B] hover:opacity-90 rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <Dices className="w-5 h-5" />
        ¡Sortear!
      </button>
    </div>
  );
}
