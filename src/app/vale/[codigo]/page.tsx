import type { Metadata } from "next";
import { normalizarCodigo, estadoEfectivo, ETIQUETA_ESTADO, type EstadoVale } from "@/lib/vales";
import { buscarVale, hoyLima } from "@/lib/vales-sql";
import { CanjeEnCaja } from "@/components/vales/canje-caja";

/**
 * El vale de consumo que ve el invitado (iniciativa «Primer cliente»).
 *
 * Página PÚBLICA a propósito (el middleware la deja pasar sin login): el
 * invitado no tiene cuenta. La página en sí es de LECTURA: muestra solo
 * sede, productos, vigencia y estado. Lo único que puede hacerse desde acá
 * es el canje EN CAJA, que exige el PIN de la sede (CanjeEnCaja →
 * actions/vales-caja.ts) — el invitado no lo conoce. Ver un vale ajeno
 * tampoco sirve de nada: el código tiene más de un billón de combinaciones.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Vale de consumo · Yayi's",
  robots: { index: false, follow: false },
};

const ESTILO: Record<EstadoVale, { caja: string; punto: string; ayuda: string }> = {
  emitido: { caja: "bg-emerald-50 text-emerald-800 border-emerald-200", punto: "bg-emerald-500", ayuda: "Muestra este código al encargado antes de pagar." },
  canjeado: { caja: "bg-gray-100 text-gray-700 border-gray-300", punto: "bg-gray-400", ayuda: "Este vale ya se usó y no se puede usar otra vez." },
  vencido: { caja: "bg-amber-50 text-amber-800 border-amber-200", punto: "bg-amber-500", ayuda: "Este vale ya venció." },
  anulado: { caja: "bg-red-50 text-red-800 border-red-200", punto: "bg-red-500", ayuda: "Este vale fue anulado." },
};

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default async function ValePublicoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: crudo } = await params;
  const codigo = normalizarCodigo(decodeURIComponent(crudo));
  const vale = codigo ? await buscarVale(codigo) : null;

  return (
    <main className="min-h-screen bg-[#F4FAF7] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg border border-emerald-100 overflow-hidden">
        {!vale || vale === "sin-tabla" ? (
          <div className="p-8 text-center space-y-2">
            <div className="text-lg font-bold text-[#004C40]">No encontramos este vale</div>
            <p className="text-sm text-gray-600">Revisa el link o pídele a quien te lo dio que lo confirme.</p>
          </div>
        ) : (
          <ValeTarjeta vale={vale} hoy={hoyLima()} />
        )}
      </div>
    </main>
  );
}

function ValeTarjeta({ vale, hoy }: { vale: Exclude<Awaited<ReturnType<typeof buscarVale>>, null | "sin-tabla">; hoy: string }) {
  const estado = estadoEfectivo(vale, hoy);
  const est = ESTILO[estado];
  const usable = estado === "emitido";
  return (
    <>
      <div className="px-6 pt-7 pb-4">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
          <span className="text-[#004C40]">¡Vale de</span>
          <br />
          <span className="text-[#E4472B]">consumo!</span>
        </h1>
        <p className="mt-2 text-sm font-semibold text-[#098B5F]">
          Gracias por ayudarnos a mejorar la experiencia Yayi&apos;s.
        </p>
      </div>

      <div className="mx-6 border-t border-[#004C40]/30" />

      <div className="px-6 py-4 space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Sede</div>
          <div className="text-base font-bold text-[#004C40]">Yayi&apos;s {vale.sede}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Este vale cubre</div>
          <ul className="mt-1 space-y-1">
            {vale.items.map((i) => (
              <li key={i.ref} className="text-base font-semibold text-gray-900">
                {i.cantidad} × {i.nombre}
              </li>
            ))}
          </ul>
        </div>
        {vale.para && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Para</div>
            <div className="text-sm text-gray-800">{vale.para}</div>
          </div>
        )}
      </div>

      <div className="mx-6 border-t border-[#004C40]/30" />

      <div className="px-6 py-5 text-center">
        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Tu código</div>
        <div
          className={`mt-1 font-mono text-4xl font-extrabold tracking-widest ${usable ? "text-[#004C40]" : "text-gray-400 line-through"}`}
        >
          {vale.codigo}
        </div>
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold ${est.caja}`}>
          <span className={`h-2 w-2 rounded-full ${est.punto}`} />
          {ETIQUETA_ESTADO[estado]}
          {estado === "emitido" && <span className="font-normal">· hasta el {fechaCorta(vale.venceEl)}</span>}
          {estado === "canjeado" && vale.canjeadoEn && <span className="font-normal">· {vale.canjeadoEn}</span>}
        </div>
        <p className="mt-3 text-xs text-gray-600">{est.ayuda}</p>
      </div>

      {usable && (
        <div className="px-6 pb-5">
          <CanjeEnCaja codigo={vale.codigo} />
        </div>
      )}

      <div className="bg-[#004C40] px-6 py-3 text-center text-xs text-emerald-50">
        Se usa una sola vez · No canjeable por dinero
      </div>
    </>
  );
}
