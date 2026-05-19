"use client";

import { useEffect, useState, useCallback } from "react";
import { Landmark, RefreshCw, Check, CircleDot, Search, MoreHorizontal } from "lucide-react";
import { useParams } from "next/navigation";
import { useBankBalance } from "@/hooks/useBankBalance";
import { KPICard } from "@/components/ui/KPICard";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BankRealCheckModal } from "./BankRealCheckModal";
import { BankInvestigationModal } from "./BankInvestigationModal";
import {
  getLatestBankRealCheck,
  type BankRealCheck,
} from "@/app/actions/bank-real-checks";

export type BankBalanceCardProps = {
  /** Href primario al hacer click. Requerido — el caller debe pasar la
   *  ruta con prefijo de negocio (ej: `/atelier/registro`). */
  href: string;
  /** Tamaño de la tarjeta (compact para Conciliación). */
  size?: "default" | "compact";
};

/**
 * Tarjeta KPI estandarizada del Saldo BCP. Se monta en Dashboard, en
 * Conciliación y en cualquier futuro lugar que necesite mostrar el saldo
 * actual. Lee del hook `useBankBalance()` así que las 3 pantallas siempre
 * muestran el mismo número.
 *
 * Fase 1 de conciliación bancaria — solo Atelier:
 *   Cuando el negocio activo es Atelier, el card muestra una sección
 *   inferior con la conciliación contra `bank_real_checks` (4 estados
 *   A/B/C/D según el último check y la diferencia). En Centro/Fonavi
 *   el card mantiene su render legacy intacto.
 */
export function BankBalanceCard({ href, size = "default" }: BankBalanceCardProps) {
  const { current, anchorDate, hasAnchor, isLoading } = useBankBalance();
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? null;
  const isAtelier = negocio === "atelier";

  const [latestCheck, setLatestCheck] = useState<BankRealCheck | null>(null);
  const [checkLoading, setCheckLoading] = useState(isAtelier);
  const [modalOpen, setModalOpen] = useState(false);
  const [investigationOpen, setInvestigationOpen] = useState(false);

  const refreshCheck = useCallback(async () => {
    if (!isAtelier) return;
    const c = await getLatestBankRealCheck();
    setLatestCheck(c);
    setCheckLoading(false);
  }, [isAtelier]);

  useEffect(() => {
    if (!isAtelier) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch del último check al montar
    refreshCheck();
  }, [isAtelier, refreshCheck]);

  const subtitle = isLoading
    ? "Calculando..."
    : !hasAnchor
      ? "Sin registro"
      : anchorDate
        ? `al ${formatDate(anchorDate)}`
        : "—";

  // En Centro/Fonavi mantenemos el render legacy intacto.
  if (!isAtelier) {
    return (
      <KPICard
        icon={<Landmark className="w-5 h-5 text-primary-light" />}
        title="Saldo en banco"
        value={isLoading ? "—" : formatCurrency(current)}
        subtitle={subtitle}
        variant="default"
        size={size}
        href={href}
        dim={isLoading}
      />
    );
  }

  // Atelier — calcular estado de conciliación
  const conciliationFooter = (() => {
    if (checkLoading) return null;
    // Estado C — nunca registrado
    if (!latestCheck) {
      return (
        <ConciliationRow
          variant="empty"
          onAction={() => setModalOpen(true)}
        />
      );
    }
    const diff = Number(latestCheck.difference);
    const cuadrado = Math.abs(diff) < 0.01;
    const daysSince = daysBetween(latestCheck.checkDate, todayLima());
    const stale = daysSince >= 3;
    const status = latestCheck.status;
    if (cuadrado) {
      return (
        <ConciliationRow
          variant="ok"
          checkDate={latestCheck.checkDate}
          createdAt={latestCheck.createdAt}
          onAction={() => setModalOpen(true)}
        />
      );
    }
    // Estados Fase 2: diferencia + status
    if (status === "resolved") {
      return (
        <ConciliationRow
          variant="resolved"
          diff={diff}
          checkDate={latestCheck.checkDate}
          createdAt={latestCheck.createdAt}
          onUpdate={() => setModalOpen(true)}
        />
      );
    }
    if (status === "accepted") {
      return (
        <ConciliationRow
          variant="accepted"
          diff={diff}
          checkDate={latestCheck.checkDate}
          createdAt={latestCheck.createdAt}
          onUpdate={() => setModalOpen(true)}
        />
      );
    }
    // status === "pending" + diferencia != 0 → boton Investigar
    return (
      <ConciliationRow
        variant="diff"
        diff={diff}
        checkDate={latestCheck.checkDate}
        createdAt={latestCheck.createdAt}
        daysSince={daysSince}
        stale={stale}
        onInvestigate={() => setInvestigationOpen(true)}
        onUpdate={() => setModalOpen(true)}
      />
    );
  })();

  // BUG fix Prompt Fase 1 — KPICard renderiza un overlay <Link> con
  // position absolute z-10 cuando recibe href. El body del KPICard
  // tiene `relative z-0` que CREA un stacking context y atrapa los
  // z-index internos del footer, dejando los botones del footer por
  // debajo del overlay globalmente. Resultado: clicks en "Registrar"
  // / "Actualizar" caían en el Link overlay y navegaban a
  // /atelier/registro en lugar de abrir el modal.
  //
  // Fix: en Atelier NO pasamos href al KPICard. Sin overlay, los
  // botones del footer reciben los clicks normalmente. UX trade-off:
  // el card de Atelier ya no es clickeable como link directo a
  // /atelier/registro — para ir al Registro Diario se usa el
  // sidebar. Centro/Fonavi conservan href como antes (early return
  // arriba).
  return (
    <>
      <KPICard
        icon={<Landmark className="w-5 h-5 text-primary-light" />}
        title="Saldo en banco"
        value={isLoading ? "—" : formatCurrency(current)}
        subtitle={subtitle}
        variant="default"
        size={size}
        dim={isLoading}
        footer={conciliationFooter}
      />
      <BankRealCheckModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refreshCheck}
      />
      <BankInvestigationModal
        open={investigationOpen}
        onClose={() => setInvestigationOpen(false)}
        onResolved={refreshCheck}
      />
    </>
  );
}

// ─── Footer subcomponente con los 5 estados ────────────────────────
//   empty    -> nunca se registró saldo real
//   ok       -> diferencia ≈ 0 (cuadrado natural)
//   diff     -> diferencia != 0 + status='pending' → ofrece Investigar
//   resolved -> diferencia != 0 pero ya fue investigada y resuelta
//   accepted -> diferencia != 0 aceptada (no se investiga más)

type ConciliationRowProps =
  | { variant: "empty"; onAction: () => void }
  | { variant: "ok"; checkDate: string; createdAt: string; onAction: () => void }
  | {
      variant: "diff";
      diff: number;
      checkDate: string;
      createdAt: string;
      daysSince: number;
      stale: boolean;
      onInvestigate: () => void;
      onUpdate: () => void;
    }
  | {
      variant: "resolved";
      diff: number;
      checkDate: string;
      createdAt: string;
      onUpdate: () => void;
    }
  | {
      variant: "accepted";
      diff: number;
      checkDate: string;
      createdAt: string;
      onUpdate: () => void;
    };

function ConciliationRow(p: ConciliationRowProps) {
  // Wrap todo en un span para que el wrapper del KPICard (que es un
  // <button> overlay) no atrape los clicks del botón interno. Usamos
  // pointer-events sobre el botón con z-20 para que pase por encima.
  if (p.variant === "empty") {
    return (
      <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
        <span>Registrar saldo BCP real para conciliar</span>
        <ActionButton onClick={p.onAction} label="Registrar" />
      </div>
    );
  }
  if (p.variant === "ok") {
    const when = describeWhen(p.checkDate, p.createdAt);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); p.onAction(); }}
        className="relative z-20 w-full flex items-center justify-between gap-2 text-xs hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
      >
        <span className="flex items-center gap-1.5 text-emerald-700">
          <Check className="w-3.5 h-3.5" />
          <span>Cuadrado con BCP</span>
        </span>
        <span className="text-[11px] text-gray-500">{when}</span>
      </button>
    );
  }
  if (p.variant === "resolved") {
    const sign = p.diff >= 0 ? "+" : "";
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <Check className="w-3.5 h-3.5" />
            <span>Resuelto ({sign}{formatCurrency(p.diff)})</span>
          </span>
          <span className="text-[11px] text-gray-500">{describeWhen(p.checkDate, p.createdAt)}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <SecondaryActionButton onClick={p.onUpdate} label="Actualizar" icon="refresh" />
        </div>
      </div>
    );
  }
  if (p.variant === "accepted") {
    const sign = p.diff >= 0 ? "+" : "";
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
          <span>Diferencia aceptada ({sign}{formatCurrency(p.diff)})</span>
          <span className="text-[11px] text-gray-500">{describeWhen(p.checkDate, p.createdAt)}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <SecondaryActionButton onClick={p.onUpdate} label="Actualizar" icon="refresh" />
        </div>
      </div>
    );
  }
  // variant === "diff" — status='pending' con diferencia activa
  const sign = p.diff >= 0 ? "+" : "";
  const lastLabel = p.stale
    ? `Último check: ${formatDate(p.checkDate)} (${p.daysSince} días)`
    : `Último check: ${describeWhen(p.checkDate, p.createdAt)}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5" style={{ color: "#854F0B" }}>
          <CircleDot className="w-3.5 h-3.5" style={{ color: "#BA7517" }} />
          <span>vs BCP real</span>
        </span>
        <span style={{ color: "#854F0B" }} className="text-[13px] font-medium">
          {sign}{formatCurrency(p.diff)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] ${p.stale ? "text-amber-700" : "text-gray-500"}`}>
          {lastLabel}
        </span>
        <div className="flex items-center gap-1">
          <ActionButton onClick={p.onInvestigate} label="Investigar" icon="search" />
          <SecondaryActionButton onClick={p.onUpdate} label="Actualizar saldo" icon="more" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ onClick, label, icon = "refresh" }: { onClick: () => void; label: string; icon?: "refresh" | "search" }) {
  const Icon = icon === "search" ? Search : RefreshCw;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      className="relative z-20 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

/**
 * Botón terciario sutil para acciones secundarias (ej. "Actualizar
 * saldo" cuando el botón primario es "Investigar"). Mismo z-20 que
 * el primario para escapar del stacking context del KPICard.
 */
function SecondaryActionButton({ onClick, label, icon = "refresh" }: { onClick: () => void; label: string; icon?: "refresh" | "more" }) {
  const Icon = icon === "more" ? MoreHorizontal : RefreshCw;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      title={label}
      aria-label={label}
      className="relative z-20 inline-flex items-center justify-center w-6 h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Describe el momento del check de manera amigable.
 *  - Hoy: "hoy HH:mm"
 *  - Ayer: "ayer HH:mm"
 *  - Otros días: "DD/MM"
 * createdAt llega como ISO; usamos solo la hora si el día matchea
 * para evitar problemas de TZ con la fecha.
 */
function describeWhen(checkDate: string, createdAt: string): string {
  const today = todayLima();
  const yesterday = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  // Hora desde createdAt en Lima
  const hh = new Date(createdAt).toLocaleTimeString("es-PE", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima",
  });
  if (checkDate === today) return `hoy ${hh}`;
  if (checkDate === yesterday) return `ayer ${hh}`;
  return formatDate(checkDate);
}
