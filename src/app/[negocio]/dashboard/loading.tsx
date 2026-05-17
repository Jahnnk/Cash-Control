/**
 * Loading skeleton para /[negocio]/dashboard. Replica el layout real:
 * MonthSelector arriba, fila de 5-6 KPI cards (Saldo banco, Saldo
 * efectivo, Ingresos, Gastos, etc.), 2-3 gráficos abajo.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-48 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>

      {/* Top cards (auto-fit 180px) */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
            <div className="mb-2 h-4 w-28 rounded bg-gray-200" />
            <div className="h-7 w-32 rounded bg-gray-300" />
            <div className="mt-2 h-3 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Sección gráficos + listados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
          <div className="h-64 w-full rounded bg-gray-100" />
        </div>
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-1/2 rounded bg-gray-200" />
                <div className="h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
