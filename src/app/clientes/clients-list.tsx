"use client";

import { useState } from "react";
import { createClient } from "@/app/actions/clients";
import { formatCurrency } from "@/lib/utils";
import { CLIENT_TYPES, PAYMENT_PATTERNS } from "@/lib/constants";
import { DataTable } from "@/components/ui/DataTable";
import { Plus, X, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ClientRow = Record<string, unknown>;

export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("b2b");
  const [pattern, setPattern] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    await createClient({ name: name.trim(), type, paymentPattern: pattern || undefined });
    setName("");
    setType("b2b");
    setPattern("");
    setShowForm(false);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nuevo cliente"}
        </button>
      </div>

      {/* New client form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Nuevo cliente</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {CLIENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Patrón de pago</label>
              <select
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Sin definir</option>
                {PAYMENT_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {saving ? "Guardando..." : "Crear cliente"}
            </button>
          </div>
        </div>
      )}

      {/* Clients table */}
      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          No hay clientes registrados
        </div>
      ) : (
        <DataTable
          rowKey={(c) => c.id as string}
          data={clients}
          columns={[
            {
              key: "name",
              header: "Nombre",
              cellClassName: "px-6",
              headerClassName: "px-6",
              render: (c) => (
                <Link
                  href={`/clientes/${c.id}`}
                  className="font-medium text-primary-light hover:underline"
                >
                  {c.name as string}
                </Link>
              ),
            },
            {
              key: "type",
              header: "Tipo",
              cellClassName: "px-6",
              headerClassName: "px-6",
              render: (c) => (
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    c.type === "familia"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {c.type as string}
                </span>
              ),
            },
            {
              key: "payment_pattern",
              header: "Patrón de pago",
              cellClassName: "px-6 text-gray-600",
              headerClassName: "px-6",
              render: (c) => (c.payment_pattern as string) || "—",
            },
            {
              key: "pending_amount",
              header: "Saldo pendiente",
              align: "right",
              cellClassName: "px-6 font-semibold",
              headerClassName: "px-6",
              render: (c) =>
                parseFloat(c.pending_amount as string) > 0 ? (
                  <span className="text-amber-600">
                    {formatCurrency(c.pending_amount as string)}
                  </span>
                ) : (
                  <span className="text-gray-400">S/0.00</span>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
