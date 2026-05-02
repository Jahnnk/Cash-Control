"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type KPIVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet";

export type KPISize = "default" | "compact";

export type SecondaryAction = {
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  label: string;
};

export type KPICardProps = {
  icon?: ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  variant?: KPIVariant;
  size?: KPISize;
  /** Si se pasa, toda la tarjeta es clickable (Link). */
  href?: string;
  /** Alternativa a href cuando se necesita callback. */
  onClick?: () => void;
  /** Botón sutil arriba derecha (acción secundaria). */
  secondaryAction?: SecondaryAction;
  /** Estado expandido (chevron + texto opcional). Útil en panels que abren detalle. */
  expanded?: boolean;
  expandedHint?: { open: string; closed: string };
  /** Atenuar el valor (gris) cuando es 0 o sin datos. */
  dim?: boolean;
  /** Override directo del color del valor cuando el variant no aplica. */
  valueClassName?: string;
  /** Forzar/desactivar el borde izquierdo coloreado (default: on en size default, off en compact). */
  withAccentBar?: boolean;
};

const VARIANT_BORDER: Record<KPIVariant, string> = {
  default: "border-l-primary-light",
  success: "border-l-primary-light",
  warning: "border-l-amber-500",
  danger: "border-l-red-500",
  info: "border-l-blue-500",
  violet: "border-l-violet-500",
};

const VARIANT_VALUE_COLOR: Record<KPIVariant, string> = {
  default: "text-gray-900",
  success: "text-primary-light",
  warning: "text-amber-700",
  danger: "text-red-700",
  info: "text-blue-700",
  violet: "text-violet-700",
};

export function KPICard({
  icon,
  title,
  value,
  subtitle,
  variant = "default",
  size = "default",
  href,
  onClick,
  secondaryAction,
  expanded,
  expandedHint,
  dim = false,
  valueClassName,
  withAccentBar,
}: KPICardProps) {
  const isInteractive = !!(href || onClick);
  const showAccent = withAccentBar ?? size === "default";
  const accentClass = showAccent ? `border-l-4 ${VARIANT_BORDER[variant]}` : "";

  const sizeClasses =
    size === "compact"
      ? "rounded-lg p-3"
      : "rounded-xl p-5";
  const titleClass =
    size === "compact"
      ? "text-xs text-gray-500"
      : "text-sm text-gray-600 truncate";
  const valueSize =
    size === "compact" ? "text-lg font-bold" : "text-2xl font-semibold";
  const subtitleClass =
    size === "compact"
      ? "text-[10px] text-gray-400 mt-0.5"
      : "text-xs text-gray-500 mt-1";

  const computedValueColor =
    valueClassName ?? (dim ? "text-gray-400" : VARIANT_VALUE_COLOR[variant]);

  const wrapperBase = `relative bg-white border border-gray-200 ${accentClass} ${sizeClasses} group transition-all duration-200`;
  const wrapperInteractive = isInteractive
    ? "hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
    : "";

  // Header: ícono + título + (chevron expanded) + (secondary action)
  const header = (
    <div className="relative z-20 flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className={titleClass}>{title}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {expanded !== undefined && (
          <span className={`text-[10px] ${expanded ? "text-primary-light" : "text-gray-400"}`}>
            {expanded ? "▴" : "▾"}
          </span>
        )}
        {secondaryAction && <SecondaryButton action={secondaryAction} />}
      </div>
    </div>
  );

  const body = (
    <div className="relative z-0 mt-2">
      <div className={`${valueSize} ${computedValueColor}`}>{value}</div>
      {subtitle && <div className={subtitleClass}>{subtitle}</div>}
      {expanded !== undefined && expandedHint && (
        <div className="text-[10px] text-primary-light mt-1">
          {expanded ? expandedHint.open : expandedHint.closed}
        </div>
      )}
    </div>
  );

  return (
    <div className={`${wrapperBase} ${wrapperInteractive}`}>
      {/* Overlay link para que no conflictúe con secondaryAction */}
      {href && (
        <Link
          href={href}
          aria-label={title}
          className="absolute inset-0 z-10 rounded-xl"
        >
          <span className="sr-only">{title}</span>
        </Link>
      )}
      {/* Si solo hay onClick (sin href), el wrapper completo dispara */}
      {!href && onClick && (
        <button
          type="button"
          onClick={onClick}
          aria-label={title}
          className="absolute inset-0 z-10 rounded-xl cursor-pointer"
        >
          <span className="sr-only">{title}</span>
        </button>
      )}
      {header}
      {body}
    </div>
  );
}

function SecondaryButton({ action }: { action: SecondaryAction }) {
  const className =
    "relative z-30 inline-flex items-center justify-center w-7 h-7 -mr-1 -mt-1 rounded-full text-gray-400/40 hover:text-primary hover:bg-primary/5 hover:scale-105 transition-all duration-150";
  if (action.href) {
    return (
      <Link href={action.href} title={action.label} aria-label={action.label} className={className}>
        {action.icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      title={action.label}
      aria-label={action.label}
      className={className}
    >
      {action.icon}
    </button>
  );
}
