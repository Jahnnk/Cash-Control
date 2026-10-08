"use client";

/**
 * Sistema de Dirección · Matriz de decisión (pedido de Jahnn, 6-oct-2026, capítulo «Convierte
 * números en decisiones»). Reemplaza el tablero viejo (que no se usaba): cada pregunta del dueño
 * —¿puedo retirar?, ¿puedo contratar?, ¿ajusto precios?, ¿puedo reinvertir?, ¿compro
 * inventario?— respondida por sede con sus números, siempre en el orden del libro:
 * NÚMERO → INTERPRETACIÓN → ACCIÓN. Cálculo: lib/decisiones.ts · datos: actions/decision.ts.
 *
 * Rediseño UX (8-oct-2026): cada casilla dice la respuesta y el dato que la sostiene (sin repetir
 * la cifra que ya está en el veredicto); en el celular se elige la sede y se ven sus 5 respuestas
 * sin deslizar de lado; las reglas verde/precaución y las fuentes quedan a un toque.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { getMatrizDecision, guardarFondosMutuos, type SedeDecision } from "@/app/actions/decision";
import {
  matrizDeSede, puedoContratar, PREGUNTAS, ORDEN_PREGUNTAS,
  type Pregunta, type Respuesta, type Semaforo,
} from "@/lib/decisiones";
import { Pastilla, SeccionDesplegable, Segmentado } from "@/components/productos/ui";

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const fecha = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");

const TONO: Record<Semaforo, { punto: string; texto: string; celda: string; nombre: string }> = {
  verde: { punto: "bg-emerald-600", texto: "text-emerald-800", celda: "bg-emerald-50/70 hover:bg-emerald-50", nombre: "Verde" },
  ambar: { punto: "bg-amber-500", texto: "text-amber-900", celda: "bg-amber-50/70 hover:bg-amber-50", nombre: "Precaución" },
  rojo: { punto: "bg-red-600", texto: "text-red-800", celda: "bg-red-50/70 hover:bg-red-50", nombre: "Alto" },
  gris: { punto: "bg-gray-400", texto: "text-gray-600", celda: "bg-gray-50 hover:bg-gray-100", nombre: "Sin datos" },
};

function Punto({ s }: { s: Semaforo }) {
  return <span aria-label={TONO[s].nombre} className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${TONO[s].punto}`} />;
}

// ── La matriz: preguntas × sedes ─────────────────────────────────────────

/** Lo que aclara la pregunta en la fila (solo cuando hace falta). */
const ACLARA: Partial<Record<Pregunta, string>> = { contratar: "Con un sueldo de S/1,500" };

/** El dato que sostiene la respuesta, con su nombre; nada si el veredicto ya trae la cifra. */
function datoCorto(r: Respuesta): string | null {
  if (r.semaforo === "gris") return null;
  switch (r.pregunta) {
    case "retirar":
    case "inventario": return r.veredicto.includes("S/") ? null : `libre ${r.numero}`;
    case "contratar": return `nuevo equilibrio ${r.numero}`;
    case "precios": return `margen ${r.numero}`;
    case "reinvertir": return `${r.numero} de reserva`;
  }
}

function Celda({ r, activa, onClick }: { r: Respuesta | undefined; activa: boolean; onClick: () => void }) {
  const s: Semaforo = r?.semaforo ?? "gris";
  const dato = r ? datoCorto(r) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`w-full h-full text-left rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary ${TONO[s].celda} ${activa ? "ring-2 ring-primary" : "ring-1 ring-inset ring-black/5"}`}
    >
      <span className="flex items-center gap-2">
        <Punto s={s} />
        <span className={`font-semibold leading-tight ${TONO[s].texto}`}>{r?.veredicto ?? "Sin datos"}</span>
      </span>
      {dato && <span className="block text-xs text-gray-600 tabular-nums mt-1 pl-[18px]">{dato}</span>}
    </button>
  );
}

function Matriz({ sedes, matrices, sel, onSel }: {
  sedes: SedeDecision[];
  matrices: (Record<Pregunta, Respuesta> | null)[];
  sel: { p: Pregunta; i: number };
  onSel: (p: Pregunta, i: number) => void;
}) {
  return (
    <>
      {/* Computadora: las 3 sedes lado a lado. */}
      <table className="hidden sm:table w-full border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr>
            <th className="w-[34%]"><span className="sr-only">Pregunta</span></th>
            {sedes.map((s) => (
              <th key={s.businessId} className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-500 px-3 pb-1">{s.sede}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ORDEN_PREGUNTAS.map((p) => (
            <tr key={p}>
              <th scope="row" className="text-left align-top font-normal px-2 py-2.5">
                <div className="font-semibold text-gray-900 leading-snug">{PREGUNTAS[p].titulo}</div>
                {ACLARA[p] && <div className="text-[11px] text-gray-500 mt-0.5">{ACLARA[p]}</div>}
              </th>
              {matrices.map((m, i) => (
                <td key={i} className="align-top p-0">
                  <Celda r={m?.[p]} activa={sel.p === p && sel.i === i} onClick={() => onSel(p, i)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Celular: se elige la sede y se ven sus 5 respuestas, sin deslizar de lado. */}
      <div className="sm:hidden space-y-3">
        <Segmentado lleno tamano="sm" opciones={sedes.map((s, i) => ({ valor: i, etiqueta: s.sede }))} valor={sel.i} onChange={(i) => onSel(sel.p, i)} />
        <ul className="space-y-2">
          {ORDEN_PREGUNTAS.map((p) => (
            <li key={p} className="grid grid-cols-[1fr_minmax(0,46%)] items-center gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 leading-snug">{PREGUNTAS[p].titulo}</div>
                {ACLARA[p] && <div className="text-[11px] text-gray-500 mt-0.5">{ACLARA[p]}</div>}
              </div>
              <Celda r={matrices[sel.i]?.[p]} activa={sel.p === p} onClick={() => onSel(p, sel.i)} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ── La cuenta, paso a paso ───────────────────────────────────────────────
function Cuenta({ r }: { r: Respuesta }) {
  if (!r.pasos.length) return null;
  const esSemanas = r.pregunta === "reinvertir";
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <table className="w-full text-sm">
        <tbody>
          {r.pasos.map((p, k) => (
            <tr key={k} className={p.op === "=" ? "border-t border-gray-300" : ""}>
              <td className="w-5 py-1 text-gray-400 font-mono">{p.op}</td>
              <td className={`py-1 pr-3 ${p.op === "=" ? "font-semibold text-gray-900" : "text-gray-700"}`}>{p.etiqueta}</td>
              <td className={`py-1 text-right tabular-nums whitespace-nowrap ${p.op === "=" ? "font-semibold" : ""} ${p.op === "=" && p.valor < 0 ? "text-red-700" : "text-gray-900"}`}>
                {p.op === "=" && p.valor < 0 ? "−" : ""}{soles(p.valor)}
              </td>
            </tr>
          ))}
          {esSemanas && (
            <tr className="border-t border-gray-300">
              <td className="w-5 py-1 text-gray-400 font-mono">=</td>
              <td className="py-1 pr-3 font-semibold text-gray-900">Semanas de costos fijos guardadas</td>
              <td className="py-1 text-right tabular-nums font-semibold">{r.numero}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Detalle({ sede, r }: { sede: SedeDecision; r: Respuesta }) {
  const q = PREGUNTAS[r.pregunta];
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Punto s={r.semaforo} />
          <h3 className="text-base font-semibold text-gray-900">{q.titulo} · {sede.sede}</h3>
        </div>
        <div className={`text-2xl font-semibold ${TONO[r.semaforo].texto}`}>{r.veredicto}</div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1.5">1 · El número: {q.numeroClave.toLowerCase()}</div>
          <Cuenta r={r} />
        </div>
      </div>
      <div className="space-y-4 min-w-0">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1">2 · Qué significa</div>
          <p className="text-sm text-gray-800 leading-relaxed">{r.interpretacion}</p>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1">3 · Qué hacer</div>
          <p className="text-sm text-gray-900 font-medium leading-relaxed">{r.accion}</p>
        </div>
        <details className="group text-xs">
          <summary className="cursor-pointer list-none text-gray-500 hover:text-gray-800">
            ¿Cuándo sale en verde? <span className="group-open:hidden">Ver la regla</span>
          </summary>
          <div className="grid gap-2 sm:grid-cols-2 mt-2">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900"><b>Verde:</b> {q.verde.charAt(0).toLowerCase() + q.verde.slice(1)}.</div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><b>Precaución:</b> {q.precaucion.charAt(0).toLowerCase() + q.precaucion.slice(1)}.</div>
          </div>
        </details>
      </div>
    </div>
  );
}

// ── Calculadora: ¿y si sumo un gasto fijo? ────────────────────────────────
const PRESETS = [
  { etiqueta: "Sueldo completo", monto: 1500, que: "un sueldo completo" },
  { etiqueta: "Medio tiempo", monto: 565, que: "un medio tiempo" },
  { etiqueta: "Publicidad", monto: 300, que: "publicidad" },
  { etiqueta: "Software", monto: 80, que: "un software" },
];

function Calculadora({ sedes }: { sedes: SedeDecision[] }) {
  const conDatos = sedes.filter((s) => s.datos);
  const [bId, setBId] = useState<number>(conDatos[0]?.businessId ?? 2);
  const [monto, setMonto] = useState("1500");
  const [que, setQue] = useState("un sueldo completo");
  const sede = conDatos.find((s) => s.businessId === bId);
  const valor = Number(monto.replace(",", "."));
  const r = sede?.datos && valor > 0 ? puedoContratar(sede.datos, valor, que) : null;
  if (!conDatos.length) return <p className="text-sm text-gray-500">Ninguna sede tiene datos suficientes.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Segmentado tamano="sm" opciones={conDatos.map((s) => ({ valor: s.businessId, etiqueta: s.sede }))} valor={bId} onChange={setBId} />
        <label className="text-xs text-gray-600">
          <span className="block mb-1">Gasto nuevo al mes (S/)</span>
          <input
            inputMode="decimal" value={monto}
            onChange={(e) => { setMonto(e.target.value); setQue("el gasto nuevo"); }}
            className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm tabular-nums focus:outline-2 focus:outline-primary"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.etiqueta} type="button" onClick={() => { setMonto(String(p.monto)); setQue(p.que); }}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${Number(monto) === p.monto && que === p.que ? "bg-primary text-white ring-primary" : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50"}`}>
            {p.etiqueta} · {soles(p.monto)}
          </button>
        ))}
      </div>
      {r && sede && <Detalle sede={sede} r={r} />}
    </div>
  );
}

// ── Fondos mutuos y de dónde salen los números ─────────────────────────────
function FondoForm({ s, onGuardado }: { s: SedeDecision; onGuardado: () => void }) {
  const { showToast } = useToast();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [f, setF] = useState(hoy);
  const [saldo, setSaldo] = useState("");
  const [busy, setBusy] = useState(false);
  async function guardar() {
    const v = Number(saldo.replace(/,/g, ""));
    if (!saldo.trim() || !Number.isFinite(v)) { showToast("Escribe el saldo del estado de cuenta.", "error"); return; }
    setBusy(true);
    const r = await guardarFondosMutuos({ businessId: s.businessId, fecha: f, saldo: v });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`Fondos mutuos de ${s.sede} guardados.`, "success");
    setSaldo("");
    onGuardado();
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-gray-600"><span className="block mb-1">Fecha del estado de cuenta</span>
        <input type="date" value={f} max={hoy} onChange={(e) => setF(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-gray-600"><span className="block mb-1">Saldo (S/)</span>
        <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0.00" className="w-32 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm tabular-nums" />
      </label>
      <button type="button" onClick={guardar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
      </button>
    </div>
  );
}

function Fuentes({ sedes, onGuardado }: { sedes: SedeDecision[]; onGuardado: () => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {sedes.map((s) => {
        const d = s.datos;
        return (
          <div key={s.businessId} className="rounded-xl border border-gray-200/80 p-4 space-y-3">
            <div className="font-semibold text-gray-900">{s.sede}</div>
            {d ? (
              <dl className="text-xs grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                <dt className="text-gray-500">Banco (Excel, {fecha(d.bancoAl)})</dt><dd className="text-right">{d.banco === null ? "—" : soles(d.banco)}</dd>
                <dt className="text-gray-500">Efectivo</dt><dd className="text-right">{soles(d.efectivo)}</dd>
                <dt className="text-gray-500">Fondos mutuos{d.fondosAl ? ` (${fecha(d.fondosAl)})` : ""}</dt><dd className="text-right">{d.fondos === null ? "sin anotar" : soles(d.fondos)}</dd>
                <dt className="text-gray-500">Costos fijos de un mes</dt><dd className="text-right">{soles(d.fijosMes)}</dd>
                <dt className="text-gray-500">Ventas de un mes</dt><dd className="text-right">{soles(d.ventasMes)}</dd>
                <dt className="text-gray-500">Cuotas de préstamos al mes</dt><dd className="text-right">{soles(d.cuotasMes)}</dd>
                <dt className="text-gray-500">Reserva mínima ({d.reserva.como})</dt><dd className="text-right">{soles(d.reserva.monto)}</dd>
              </dl>
            ) : <p className="text-xs text-gray-500">Sin datos suficientes.</p>}
            {s.avisos.length > 0 && (
              <ul className="space-y-1">
                {s.avisos.map((a, k) => (
                  <li key={k} className="flex gap-1.5 text-[11px] text-amber-900 leading-snug"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{a}</li>
                ))}
              </ul>
            )}
            {s.businessId !== 1 && <FondoForm s={s} onGuardado={onGuardado} />}
          </div>
        );
      })}
    </div>
  );
}

// ── La matriz del libro ──────────────────────────────────────────────────
function MatrizLibro() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-3 font-medium">Decisión</th><th className="py-2 pr-3 font-medium">Número clave</th>
            <th className="py-2 pr-3 font-medium">Señal verde</th><th className="py-2 font-medium">Señal de precaución</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {ORDEN_PREGUNTAS.map((p) => (
            <tr key={p} className="align-top">
              <td className="py-2 pr-3 font-medium text-gray-900">{PREGUNTAS[p].titulo}</td>
              <td className="py-2 pr-3 text-gray-700">{PREGUNTAS[p].numeroClave}</td>
              <td className="py-2 pr-3 text-emerald-800">{PREGUNTAS[p].verde}</td>
              <td className="py-2 text-amber-900">{PREGUNTAS[p].precaucion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatrizDecisionClient() {
  const [res, setRes] = useState<Awaited<ReturnType<typeof getMatrizDecision>> | null>(null);
  const cargar = useCallback(async () => setRes(await getMatrizDecision()), []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (!res) return <div className="flex items-center gap-2 text-sm text-gray-500 py-10"><Loader2 className="w-4 h-4 animate-spin" /> Calculando las respuestas…</div>;
  if (!res.ok) return <p className="text-sm text-red-700 py-10">{res.error}</p>;
  return <VistaMatriz sedes={res.sedes} onRecargar={cargar} />;
}

/** La pantalla con los datos ya cargados (separada para poder probarla). */
export function VistaMatriz({ sedes, onRecargar }: { sedes: SedeDecision[]; onRecargar: () => void }) {
  const [sel, setSel] = useState<{ p: Pregunta; i: number }>({ p: "retirar", i: 0 });
  const matrices = useMemo(() => sedes.map((s) => (s.datos ? matrizDeSede(s.datos) : null)), [sedes]);
  const r = matrices[sel.i]?.[sel.p];
  const detalle = useRef<HTMLElement>(null);
  const avisos = sedes.reduce((t, s) => t + s.avisos.length, 0);

  function elegir(p: Pregunta, i: number) {
    const otraPregunta = p !== sel.p;
    setSel({ p, i });
    // En el celular el detalle queda debajo de la lista: se lleva la vista hasta él.
    if (otraPregunta && window.matchMedia("(max-width: 639px)").matches) {
      requestAnimationFrame(() => detalle.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <div className="space-y-5 max-w-6xl min-w-0">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Matriz de decisión</h1>
        <p className="text-sm text-gray-500 mt-1">Cinco preguntas de dueño, respondidas con tus números. Toca una respuesta para ver la cuenta.</p>
      </header>

      <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-5">
        <Matriz sedes={sedes} matrices={matrices} sel={sel} onSel={elegir} />
      </section>

      {r && (
        <section ref={detalle} className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6 scroll-mt-4">
          <Detalle sede={sedes[sel.i]} r={r} />
        </section>
      )}

      <SeccionDesplegable
        titulo="¿Y si sumo un gasto fijo?"
        subtitulo="Contratar, publicidad, un software: cuánto hay que vender de más."
      >
        <Calculadora sedes={sedes} />
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="De dónde salen los números"
        subtitulo="Banco del Excel, fondos mutuos y las reglas de cada respuesta."
        resumen={avisos ? <Pastilla tono="ambar">{avisos} {avisos === 1 ? "aviso" : "avisos"}</Pastilla> : undefined}
      >
        <div className="space-y-6">
          <Fuentes sedes={sedes} onGuardado={onRecargar} />
          <p className="text-[11px] text-gray-500">La reserva mínima de cada sede se cambia en Grupo → Configuración.</p>
          <div>
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1">Las reglas de la matriz</h4>
            <MatrizLibro />
          </div>
        </div>
      </SeccionDesplegable>
    </div>
  );
}
