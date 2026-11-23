"use client";

/**
 * Caja de comentario con menciones (23-nov-2026), como en Slack: al escribir «@» sale la lista del equipo;
 * se elige con clic, Enter o Tab y queda «@[Nombre]» en el texto. Al publicarse, la persona recibe
 * «Te mencionaron». Reglas puras: src/lib/acuerdos.ts → buscandoMencion, sugerirMencion, partesComentario.
 */

import { useRef, useState } from "react";
import { getPersonasMencion } from "@/app/actions/acuerdos";
import { buscandoMencion, partesComentario, sugerirMencion, type Persona } from "@/lib/acuerdos";
import { Avatar } from "./ui";

const BTN_PRIM = "px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-primary hover:bg-primary-light disabled:opacity-50";

export function CajaComentario({ ocupado, onEnviar }: { ocupado: boolean; onEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState("");
  const [gente, setGente] = useState<Persona[] | null>(null);
  const [busqueda, setBusqueda] = useState<{ desde: number; busca: string } | null>(null);
  const [marcado, setMarcado] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const opciones = busqueda && gente ? sugerirMencion(gente, busqueda.busca) : [];
  const abierta = !!busqueda && opciones.length > 0;

  function cambiar(v: string, cursor: number) {
    setTexto(v);
    const b = buscandoMencion(v.slice(0, cursor));
    setBusqueda(b);
    setMarcado(0);
    if (b && !gente) void getPersonasMencion().then((r) => setGente(r.ok ? r.personas : []));
  }

  function elegir(p: Persona) {
    if (!busqueda) return;
    const fin = busqueda.desde + 1 + busqueda.busca.length;
    const nuevo = `${texto.slice(0, busqueda.desde)}@[${p.nombre}] ${texto.slice(fin)}`;
    const cursor = busqueda.desde + p.nombre.length + 4;
    setTexto(nuevo);
    setBusqueda(null);
    requestAnimationFrame(() => { campo.current?.focus(); campo.current?.setSelectionRange(cursor, cursor); });
  }

  async function enviar() {
    if (!texto.trim() || ocupado) return;
    if (await onEnviar(texto)) { setTexto(""); setBusqueda(null); }
  }

  return (
    <div className="relative border-t border-gray-100 px-5 py-3">
      {abierta && (
        <ul role="listbox" aria-label="Mencionar a" className="absolute bottom-full left-5 right-5 mb-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {opciones.map((p, i) => (
            <li key={p.clave} role="option" aria-selected={i === marcado}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(p); }} onMouseEnter={() => setMarcado(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === marcado ? "bg-gray-100" : ""}`}>
                <Avatar nombre={p.nombre} clave={p.clave} />
                <span className="text-gray-900">{p.nombre}</span>
                <span className="text-xs text-gray-400 truncate">{p.detalle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea ref={campo} value={texto} rows={1} placeholder="Escribe un comentario… usa @ para mencionar"
          onChange={(e) => cambiar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            if (abierta) {
              if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((m) => (m + 1) % opciones.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setMarcado((m) => (m - 1 + opciones.length) % opciones.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); elegir(opciones[marcado]); return; }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setBusqueda(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); }
          }}
          className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm max-h-32" aria-label="Comentario" />
        <button type="button" className={BTN_PRIM} disabled={ocupado || !texto.trim()} onClick={() => void enviar()}>Comentar</button>
      </div>
    </div>
  );
}

/** El texto de un comentario con las menciones resaltadas. */
export function TextoComentario({ texto }: { texto: string }) {
  return (
    <>
      {partesComentario(texto).map((p, i) => "mencion" in p
        ? <span key={i} className="rounded bg-sky-50 px-0.5 font-medium text-sky-700">@{p.mencion}</span>
        : <span key={i}>{p.texto}</span>)}
    </>
  );
}
