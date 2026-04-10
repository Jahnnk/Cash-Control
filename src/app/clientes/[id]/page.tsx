import { getClientById, getClientHistory } from "@/app/actions/clients";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const history = await getClientHistory(id);

  const pendingSales = history.sales.filter((s) => !s.isCollected);
  const totalPending = pendingSales.reduce((s, r) => s + parseFloat(r.netAmount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/clientes"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-500">
            {client.type} · {client.paymentPattern || "Sin patrón definido"}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Saldo pendiente</div>
          <div className="text-2xl font-bold text-amber-600">
            {formatCurrency(totalPending)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {pendingSales.length} facturas pendientes
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Días promedio de pago</div>
          <div className="text-2xl font-bold text-gray-900">
            {history.avgPaymentDays > 0 ? (
              <span className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-400" />
                {history.avgPaymentDays} días
              </span>
            ) : (
              "—"
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">Calculado de últimos 20 pagos</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Total ventas (historial)</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(history.sales.reduce((s, r) => s + parseFloat(r.netAmount), 0))}
          </div>
          <div className="text-xs text-gray-500 mt-1">{history.sales.length} ventas registradas</div>
        </div>
      </div>

      {/* Pending sales */}
      {pendingSales.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Facturas pendientes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-6 py-3 font-medium">Fecha</th>
                  <th className="px-6 py-3 font-medium text-right">Monto neto</th>
                  <th className="px-6 py-3 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingSales.map((s) => (
                  <tr key={s.id}>
                    <td className="px-6 py-3">{formatDate(s.date)}</td>
                    <td className="px-6 py-3 text-right font-medium">
                      {formatCurrency(s.netAmount)}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{s.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent collections */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Últimos cobros</h2>
        </div>
        {history.collections.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">Sin cobros registrados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-6 py-3 font-medium">Fecha</th>
                  <th className="px-6 py-3 font-medium text-right">Monto</th>
                  <th className="px-6 py-3 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.collections.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-3">{formatDate(c.date)}</td>
                    <td className="px-6 py-3 text-right font-medium text-primary-light">
                      {formatCurrency(c.amount)}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{c.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent sales */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Últimas ventas</h2>
        </div>
        {history.sales.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">Sin ventas registradas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-6 py-3 font-medium">Fecha</th>
                  <th className="px-6 py-3 font-medium text-right">Monto</th>
                  <th className="px-6 py-3 font-medium text-right">Desc.</th>
                  <th className="px-6 py-3 font-medium text-right">Neto</th>
                  <th className="px-6 py-3 font-medium text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.sales.slice(0, 20).map((s) => (
                  <tr key={s.id}>
                    <td className="px-6 py-3">{formatDate(s.date)}</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(s.amount)}</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(s.discount)}</td>
                    <td className="px-6 py-3 text-right font-medium">
                      {formatCurrency(s.netAmount)}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          s.isCollected
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {s.isCollected ? "Cobrado" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
