"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import {
  LayoutDashboard,
  PenLine,
  Users,
  BarChart3,
  PieChart,
  Settings,
  Menu,
  X,
  Handshake,
  ChevronDown,
  ChefHat,
  Coffee,
  Building2,
  RefreshCcw,
} from "lucide-react";

type ScopeKey = "atelier" | "fonavi" | "centro" | "grupo";

type NavItem = {
  segment: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Solo se muestra cuando el negocio activo está incluido. */
  scopes: ScopeKey[];
};

const NAV: NavItem[] = [
  { segment: "dashboard",     label: "Dashboard",       icon: LayoutDashboard, scopes: ["atelier", "fonavi", "centro", "grupo"] },
  { segment: "registro",      label: "Registro Diario", icon: PenLine,         scopes: ["atelier", "fonavi", "centro"] },
  { segment: "presupuesto",   label: "Presupuesto",     icon: PieChart,        scopes: ["atelier", "fonavi", "centro"] },
  { segment: "clientes",      label: "Clientes",        icon: Users,           scopes: ["atelier"] },
  { segment: "fonavi",        label: "Fonavi",          icon: Handshake,       scopes: ["atelier"] },
  { segment: "reportes",      label: "Reportes",        icon: BarChart3,       scopes: ["atelier", "fonavi", "centro", "grupo"] },
  { segment: "configuracion", label: "Configuración",   icon: Settings,        scopes: ["atelier", "fonavi", "centro"] },
];

const SCOPE_META: Record<ScopeKey, { name: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
  atelier: { name: "Yayi's Atelier", subtitle: "Centro de producción · B2B", icon: ChefHat },
  fonavi:  { name: "Yayi's Fonavi",  subtitle: "Cafetería Fonavi",            icon: Coffee },
  centro:  { name: "Yayi's Centro",  subtitle: "Cafetería Centro",            icon: Building2 },
  grupo:   { name: "Grupo Yayi's",   subtitle: "Vista consolidada",           icon: BarChart3 },
};

function scopeFromPathname(pathname: string): ScopeKey | null {
  const seg = pathname.split("/")[1];
  if (seg === "atelier" || seg === "fonavi" || seg === "centro" || seg === "grupo") return seg;
  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const scope = scopeFromPathname(pathname);

  // Si la ruta no tiene scope (ej: la pantalla raíz), no renderizamos sidebar.
  // Esto evita que aparezca en /, /grupo no incluido o en 404.
  if (!scope) return null;

  const meta = SCOPE_META[scope];
  const ScopeIcon = meta.icon;
  const items = useMemo(() => NAV.filter((item) => item.scopes.includes(scope)), [scope]);

  function hrefFor(segment: string) {
    return `/${scope}/${segment}`;
  }

  function isActive(segment: string) {
    return pathname === hrefFor(segment) || pathname.startsWith(hrefFor(segment) + "/");
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white rounded-lg p-2 shadow-md"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5 text-primary" />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-primary text-white z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header — switcher de negocio */}
        <div className="relative border-b border-white/10">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <ScopeIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{meta.name}</div>
                <div className="text-[11px] text-white/60 truncate">{meta.subtitle}</div>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-white/60 transition-transform shrink-0 ${switcherOpen ? "rotate-180" : ""}`} />
          </button>

          {switcherOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
              <div className="absolute z-50 left-3 right-3 mt-1 bg-white text-gray-900 rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {(["atelier", "fonavi", "centro"] as ScopeKey[]).map((s) => {
                  const m = SCOPE_META[s];
                  const Icon = m.icon;
                  const current = s === scope;
                  return (
                    <Link
                      key={s}
                      href={`/${s}/dashboard`}
                      onClick={() => { setSwitcherOpen(false); setOpen(false); }}
                      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors ${current ? "bg-primary/5" : ""}`}
                    >
                      <Icon className={`w-4 h-4 ${current ? "text-primary" : "text-gray-500"}`} />
                      <span className={`text-sm ${current ? "font-semibold text-primary" : "text-gray-800"}`}>{m.name}</span>
                    </Link>
                  );
                })}
                <div className="border-t border-gray-100" />
                <Link
                  href="/grupo/dashboard"
                  onClick={() => { setSwitcherOpen(false); setOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors ${scope === "grupo" ? "bg-primary/5" : ""}`}
                >
                  <BarChart3 className={`w-4 h-4 ${scope === "grupo" ? "text-primary" : "text-gray-500"}`} />
                  <span className={`text-sm ${scope === "grupo" ? "font-semibold text-primary" : "text-gray-800"}`}>Grupo Yayi&apos;s</span>
                </Link>
                <div className="border-t border-gray-100" />
                <Link
                  href="/"
                  onClick={() => { setSwitcherOpen(false); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-gray-600"
                >
                  <RefreshCcw className="w-4 h-4" />
                  <span className="text-sm">Cambiar negocio</span>
                </Link>
              </div>
            </>
          )}

          <button
            onClick={() => setOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-1 hover:bg-white/10 rounded"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {items.map((item) => {
            const active = isActive(item.segment);
            return (
              <Link
                key={item.segment}
                href={hrefFor(item.segment)}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/15 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-white/40">{meta.name}</p>
          <p className="text-xs text-white/40">Cajamarca, Perú</p>
        </div>
      </aside>
    </>
  );
}
