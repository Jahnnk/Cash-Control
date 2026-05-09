"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Pencil, Trash2, X, Check, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import {
  assignTipCollaborator,
  unassignTipCollaborator,
  deleteTip,
  type TipRow,
  type TipsSummary,
} from "@/app/actions/tips";

export function TipsClient({
  initialTips, initialSummary, collaborators,
}: {
  initialTips: TipRow[];
  initialSummary: TipsSummary;
  collaborators: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filterAssigned, setFilterAssigned] = useState<"all" | "assigned" | "unassigned">("all");
  const [assigning, setAssigning] = useState<TipRow | null>(null);
  const [collabName, setCollabName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<TipRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openAssign(t: TipRow) {
    setAssigning(t);
    setCollabName(t.collaborator_name ?? "");
    setError(null);
  }

  function handleAssign() {
    if (!assigning) return;
    setError(null);
    startTransition(async () => {
      const r = await assignTipCollaborator(assigning.id, collabName);
      if (!r.success) {
        setError(r.error);
        return;
      }
      setAssigning(null);
      setCollabName("");
      router.refresh();
    });
  }

  function handleUnassign() {
    if (!assigning) return;
    startTransition(async () => {
      const r = await unassignTipCollaborator(assigning.id);
      if (!r.success) { setError(r.error); return; }
      setAssigning(null);
      setCollabName("");
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const r = await deleteTip(confirmDelete.id);
      if (!r.success) return;
      setConfirmDelete(null);
      router.refresh();
    });
  }

  const filteredTips = initialTips.filter((t) => {
    if (filterAssigned === "assigned") return t.collaborator_name !== null;
    if (filterAssigned === "unassigned") return t.collaborator_name === null;
    return true;
  });

  const columns: DataTableColumn<TipRow>[] = [
    { key: "date", header: "Fecha", width: "w-28", render: (r) => formatDate(r.date) },
    {
      key: "amount", header: "Monto", align: "right", width: "w-28",
      render: (r) => <span className="font-medium text-amber-700">{formatCurrency(r.amount)}</span>,
    },
    {
      key: "source_concept", header: "Origen", width: "w-32",
      render: (r) => (
        <span className="inline-flex items-center text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
          {r.source_concept ?? "—"}
        </span>
      ),
    },
    {
      key: "note_text", header: "Nota Excel",
      render: (r) => <span className="text-xs text-gray-600">{r.note_text ?? "—"}</span>,
    },
    {
      key: "collaborator_name", header: "Colaborador", width: "w-40",
      render: (r) =>
        r.collaborator_name ? (
          <span className="text-sm font-medium text-emerald-700">{r.collaborator_name}</span>
        ) : (
          <span className="text-xs text-gray-400 italic">Sin asignar</span>
        ),
    },
    {
      key: "actions", header: "", align: "right", width: "w-20",
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            onClick={() => openAssign(r)}
            className="text-gray-400 hover:text-emerald-700 transition-colors p-1"
            title="Asignar colaborador"
            aria-label="Asignar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmDelete(r)}
            className="text-gray-400 hover:text-red-600 transition-colors p-1"
            aria-label="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HandCoins className="w-6 h-6 text-amber-600" /> Propinas Pendientes
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Propinas detectadas en Control de VTAS para asignar a colaboradores y pagar después.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total pendiente"
          value={formatCurrency(initialSummary.totalPendiente)}
          variant="warning"
          subtitle={`${initialSummary.cantidad} propinas`}
        />
        <KPICard
          title="Asignadas"
          value={formatCurrency(initialSummary.asignadasMonto)}
          variant="emerald"
          subtitle={`${initialSummary.asignadasCount} con colaborador`}
        />
        <KPICard
          title="Sin asignar"
          value={formatCurrency(initialSummary.sinAsignarMonto)}
          variant="default"
          subtitle={`${initialSummary.sinAsignarCount} por asignar`}
        />
        <KPICard
          title="Pagadas (histórico)"
          value={formatCurrency(initialSummary.pagadasMonto)}
          variant="success"
          subtitle={`${initialSummary.pagadasCount} cerradas`}
          dim={initialSummary.pagadasCount === 0}
        />
      </div>

      <div className="flex items-center gap-2">
        {(["all", "assigned", "unassigned"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterAssigned(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filterAssigned === f ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {f === "all" ? "Todas" : f === "assigned" ? "Asignadas" : "Sin asignar"}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredTips}
        rowKey={(r) => r.id}
        emptyMessage="No hay propinas pendientes con este filtro."
      />

      {/* Modal asignar */}
      {assigning && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !pending && setAssigning(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Asignar colaborador</h3>
              <button onClick={() => setAssigning(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-4">
              <div><span className="text-gray-500">Fecha: </span><span className="text-gray-900">{formatDate(assigning.date)}</span></div>
              <div><span className="text-gray-500">Monto: </span><span className="font-medium text-gray-900">{formatCurrency(assigning.amount)}</span></div>
              <div><span className="text-gray-500">Origen: </span><span className="text-gray-900">{assigning.source_concept ?? "—"}</span></div>
              <div><span className="text-gray-500">Nota: </span><span className="text-gray-700">{assigning.note_text ?? "—"}</span></div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del colaborador</label>
              <input
                list="collaborators-list"
                type="text"
                value={collabName}
                onChange={(e) => setCollabName(e.target.value)}
                placeholder="Ej: Noelia, Mathias..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
              <datalist id="collaborators-list">
                {collaborators.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                {error}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-4">
              {assigning.collaborator_name && (
                <button onClick={handleUnassign} disabled={pending} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">
                  Quitar asignación
                </button>
              )}
              <button onClick={() => setAssigning(null)} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={pending || !collabName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !pending && setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">¿Eliminar esta propina?</h3>
                <p className="text-sm text-gray-500 mt-1">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-5">
              <div><span className="text-gray-500">Fecha: </span>{formatDate(confirmDelete.date)}</div>
              <div><span className="text-gray-500">Monto: </span><span className="font-medium">{formatCurrency(confirmDelete.amount)}</span></div>
              <div><span className="text-gray-500">Colaborador: </span>{confirmDelete.collaborator_name ?? "Sin asignar"}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={pending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
