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
  RefreshCcw,
  LogOut,
  User,
  HandCoins,
  Banknote,
} from "lucide-react";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";
import { clearRole } from "@/app/actions/role";

type ScopeKey = ScopeCode;

type NavItem = {
  segment: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  scopes: ScopeKey[];
};

const NAV: NavItem[] = [
  { segment: "dashboard",     label: "Dashboard",       icon: LayoutDashboard, scopes: ["atelier", "fonavi", "centro", "grupo"] },
  { segment: "registro",      label: "Registro Diario", icon: PenLine,         scopes: ["atelier", "fonavi", "centro"] },
  { segment: "presupuesto",   label: "Presupuesto",     icon: PieChart,        scopes: ["atelier", "fonavi", "centro"] },
  { segment: "clientes",      label: "Clientes",        icon: Users,           scopes: ["atelier"] },
  { segment: "fonavi",        label: "Fonavi",          icon: Handshake,       scopes: ["atelier"] },
  { segment: "prestamos-socio", label: "Préstamos socio", icon: Banknote,      scopes: ["atelier"] },
  { segment: "propinas",      label: "Propinas",        icon: HandCoins,       scopes: ["atelier", "fonavi", "centro"] },
  { segment: "reportes",      label: "Reportes",        icon: BarChart3,       scopes: ["atelier", "fonavi", "centro", "grupo"] },
  { segment: "configuracion", label: "Configuración",   icon: Settings,        scopes: ["atelier", "fonavi", "centro"] },
];

function scopeFromPathname(pathname: string): ScopeKey | null {
  const seg = pathname.split("/")[1];
  if (seg === "atelier" || seg === "fonavi" || seg === "centro" || seg === "grupo") return seg;
  return null;
}

/**
 * Lee la cookie yayis_role del lado cliente. La cookie no es httpOnly
 * (decisión del prompt) para que esta lectura funcione.
 */
function readRoleCookie(): "admin" | "kelly" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)yayis_role=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "admin" || v === "kelly" ? v : null;
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const scope = scopeFromPathname(pathname);
  // useMemo SIEMPRE se llama en el mismo orden — no condicional.
  const items = useMemo(
    () => (scope ? NAV.filter((item) => item.scopes.includes(scope)) : []),
    [scope]
  );

  if (!scope) return null;

  const theme = BUSINESS_THEMES[scope];
  const ScopeIcon = theme.icon;
  const role = readRoleCookie();
  const isKelly = role === "kelly";

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
        className="fixed top-2 left-2 z-50 lg:hidden bg-white rounded-lg p-2 shadow-md"
        aria-label="Abrir menú"
        style={{ color: theme.color }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 text-white z-50 flex flex-col transition-all duration-200 ease-out lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: theme.color }}
      >
        {/* Header — switcher con dot del color del negocio */}
        <div className="relative border-b border-white/10">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <ScopeIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{theme.label}</div>
                <div className="text-[11px] text-white/70 truncate">{theme.description}</div>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-white/60 transition-transform shrink-0 ${switcherOpen ? "rotate-180" : ""}`} />
          </button>

          {switcherOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
              <div className="absolute z-50 left-3 right-3 mt-1 bg-white text-gray-900 rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {(["atelier", "fonavi", "centro"] as ScopeKey[])
                  .filter((s) => !(isKelly && s === "atelier"))
                  .map((s) => {
                    const m = BUSINESS_THEMES[s];
                    const Icon = m.icon;
                    const current = s === scope;
                    return (
                      <Link
                        key={s}
                        href={`/${s}/dashboard`}
                        onClick={() => { setSwitcherOpen(false); setOpen(false); }}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                        style={current ? { backgroundColor: m.colorSoft } : undefined}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <Icon className="w-4 h-4 text-gray-500" />
                        <span className={`text-sm ${current ? "font-semibold" : "text-gray-800"}`} style={current ? { color: m.color } : undefined}>
                          {m.label}
                        </span>
                      </Link>
                    );
                  })}
                <div className="border-t border-gray-100" />
                <Link
                  href="/grupo/dashboard"
                  onClick={() => { setSwitcherOpen(false); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  style={scope === "grupo" ? { backgroundColor: BUSINESS_THEMES.grupo.colorSoft } : undefined}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BUSINESS_THEMES.grupo.color }} />
                  <BarChart3 className="w-4 h-4 text-gray-500" />
                  <span className={`text-sm ${scope === "grupo" ? "font-semibold" : "text-gray-800"}`} style={scope === "grupo" ? { color: BUSINESS_THEMES.grupo.color } : undefined}>
                    Grupo Yayi&apos;s
                  </span>
                </Link>
                <div className="border-t border-gray-100" />
                <Link
                  href="/select-business"
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

        {/* Indicador de rol activo */}
        {role && (
          <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 text-[11px] text-white/60">
            <User className="w-3 h-3" />
            <span>Usuario: <span className="font-medium text-white/80">{role === "admin" ? "Jahnn" : "Kelly"}</span></span>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = isActive(item.segment);
            return (
              <Link
                key={item.segment}
                href={hrefFor(item.segment)}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "text-white bg-black/25 border-l-[3px] border-white/80"
                    : "text-white/75 hover:bg-white/10 hover:text-white border-l-[3px] border-transparent"
                }`}
                style={{ paddingLeft: "calc(1rem - 3px)" }}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer: cambiar usuario. "Cambiar negocio" vive en el switcher
            del header (siempre visible) — se quitó de aquí para evitar el
            doble acceso al mismo destino. */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <form action={clearRole}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Cambiar usuario
            </button>
          </form>
        </div>

        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-white/40">{theme.label}</p>
          <p className="text-xs text-white/40">Cajamarca, Perú</p>
        </div>
      </aside>
    </>
  );
}
