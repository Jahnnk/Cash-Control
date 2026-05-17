/**
 * Loading skeleton para /[negocio]/registro (Registro Diario).
 * Next.js App Router lo renderiza automáticamente mientras carga
 * page.tsx + Server Components. Estructura visual replica el
 * layout real para que la transición se sienta instantánea.
 *
 * Colores adaptados al brand kit: el sidebar y los cards de KPI
 * usan los tonos primarios verdes Yayi's; el skeleton mantiene
 * grays neutros para no comprometer el contraste mientras carga.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header del Registro Diario: fecha + tabs */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-10 w-40 rounded bg-gray-200" />
      </div>

      {/* Cards de saldos (Saldo BCP HOY, Efectivo, etc.) — 3 cards */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
            <div className="mb-3 h-4 w-32 rounded bg-gray-200" />
            <div className="h-7 w-40 rounded bg-gray-300" />
            <div className="mt-2 h-3 w-24 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Tabs Byte / Movimientos */}
      <div className="flex gap-2 border-b border-gray-200">
        <div className="h-10 w-32 rounded-t bg-gray-200" />
        <div className="h-10 w-32 rounded-t bg-gray-100" />
      </div>

      {/* Form de captura + 5 movimientos */}
      <div className="rounded-xl bg-white border border-gray-200 p-5 space-y-3">
        <div className="h-10 w-full rounded bg-gray-100" />
        <div className="h-10 w-full rounded bg-gray-100" />
        <div className="h-10 w-full rounded bg-gray-100" />
        <div className="border-t border-gray-100 pt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 last:border-0">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-2/3 rounded bg-gray-200" />
                <div className="h-3 w-1/3 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-24 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
