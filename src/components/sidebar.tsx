"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo, useSyncExternalStore } from "react";
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
  Package,
  Trophy,
  Medal,
  Compass,
  Target,
  ClipboardCheck,
  ListChecks,
  ChefHat,
} from "lucide-react";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";
import { clearRole } from "@/app/actions/role";

type ScopeKey = ScopeCode;

export type NavItem = {
  segment: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type NavSeccion = {
  /** Título chico de la sección (null = sin título: lo principal, arriba). */
  titulo: string | null;
  items: NavItem[];
};

const I = {
  dashboard: { segment: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  reportes: { segment: "reportes", label: "Reportes", icon: BarChart3 },
  direccion: { segment: "direccion", label: "Sistema de Dirección", icon: Compass },
  productos: { segment: "productos", label: "Productos", icon: Package },
  presupuesto: { segment: "presupuesto", label: "Presupuesto", icon: PieChart },
  highlight: { segment: "highlight", label: "Highlight", icon: Target },
  supervisiones: { segment: "supervisiones", label: "Supervisiones", icon: ClipboardCheck },
  incentivos: { segment: "incentivos", label: "Bonos e Incentivos", icon: Medal },
  recetas: { segment: "recetas", label: "Recetas y costos", icon: ChefHat },
  porDefinir: { segment: "por-definir", label: "Por definir", icon: ListChecks },
  panel: { segment: "panel", label: "Panel de Sede", icon: Trophy },
  registro: { segment: "registro", label: "Registro manual", icon: PenLine },
  propinas: { segment: "propinas", label: "Propinas", icon: HandCoins },
  clientes: { segment: "clientes", label: "Clientes", icon: Users },
  porCobrar: { segment: "fonavi", label: "Por cobrar", icon: Handshake },
  prestamos: { segment: "prestamos-socio", label: "Préstamos socio", icon: Banknote },
} satisfies Record<string, NavItem>;

/** Configuración va aparte, abajo del todo: es de vez en cuando, no del día a día. */
export const CONFIGURACION: NavItem = { segment: "configuracion", label: "Configuración", icon: Settings };

/**
 * El menú por secciones, agrupado por PARA QUÉ se entra (rediseño UX, 8-oct-2026: once opciones
 * en una sola lista obligaban a leerlas todas). Órdenes pedidos por Jahnn que se respetan:
 * en Grupo, Reportes justo debajo de Dashboard y Productos justo debajo de Sistema de Dirección.
 */
const SEDE = (atelier: boolean): NavSeccion[] => [
  { titulo: null, items: [I.dashboard, I.panel] },
  { titulo: "Día a día", items: [I.propinas] },
  { titulo: "Análisis", items: [I.reportes, I.productos, I.presupuesto] },
  ...(atelier ? [{ titulo: "Clientes", items: [I.clientes, I.porCobrar, I.prestamos] }] : []),
  // Desde agosto todo entra con el Excel: el registro a mano queda abajo, para casos sueltos (8-oct-2026).
  { titulo: "Datos", items: [I.registro] },
];

export const MENU: Record<ScopeKey, NavSeccion[]> = {
  grupo: [
    { titulo: null, items: [I.dashboard, I.reportes] },
    { titulo: "Dirección", items: [I.direccion, I.productos, I.presupuesto] },
    { titulo: "Equipo", items: [I.highlight, I.supervisiones, I.incentivos] },
    { titulo: "Datos", items: [I.recetas, I.porDefinir] },
  ],
  atelier: SEDE(true),
  fonavi: SEDE(false),
  centro: SEDE(false),
};

/** Las entradas del menú de un alcance, en su orden (Configuración al final). */
export function navPara(scope: ScopeKey): NavItem[] {
  return [...MENU[scope].flatMap((s) => s.items), CONFIGURACION];
}

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

/**
 * Pista de sesión con alcance (admin de sede / verificador), seteada en
 * el login. SOLO afecta qué muestra el menú — la seguridad real vive en
 * el middleware y las server actions. Sin ella, un admin de sede ve el
 * menú completo y cada clic lo rebota a su panel (parece un bug).
 */
function readScopeHintCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)yayis_scope=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** La cookie solo cambia con un login (navegación completa) — no hay
 * nada a lo que suscribirse. */
function subscribeNever(): () => void {
  return () => {};
}

function ItemMenu({ item, href, activo, onClick }: { item: NavItem; href: string; activo: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={activo ? "page" : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        activo ? "bg-white/[0.18] text-white font-semibold" : "text-white/80 font-medium hover:bg-white/10 hover:text-white"
      }`}
    >
      <item.icon className="w-[18px] h-[18px] shrink-0" />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // La cookie es una fuente externa a React: useSyncExternalStore la lee
  // de forma segura para la hidratación (en el servidor devuelve null).
  const scopeHint = useSyncExternalStore(
    subscribeNever,
    readScopeHintCookie,
    () => null,
  );
  // Igual con el rol (Jahnn/Kelly): leerlo directo al dibujar daba «Usuario» en el servidor y
  // «Jahnn» en el navegador, y React rehacía la página entera al cargar.
  const role = useSyncExternalStore(subscribeNever, readRoleCookie, () => null);

  const scope = scopeFromPathname(pathname);
  const isScopedAdmin = scopeHint?.startsWith("admin-") ?? false;
  const isScopedVerif = scopeHint?.startsWith("verif-") ?? false;
  // Juani: el middleware solo le abre Highlight y Supervisiones.
  const isScopedHighlight = scopeHint === "highlight";
  // useMemo SIEMPRE se llama en el mismo orden — no condicional.
  const secciones = useMemo((): NavSeccion[] => {
    if (!scope) return [];
    // Admin de sede: solo su Panel — el resto del menú lo rebotaría. Juani: Highlight y Supervisiones.
    const permitido = isScopedAdmin ? ["panel"] : isScopedHighlight ? ["highlight", "supervisiones"] : null;
    if (!permitido) return MENU[scope];
    const items = MENU[scope].flatMap((s) => s.items).filter((i) => permitido.includes(i.segment));
    return [{ titulo: null, items }];
  }, [scope, isScopedAdmin, isScopedHighlight]);
  const conConfiguracion = !isScopedAdmin && !isScopedHighlight;

  // Verificador: su única pantalla (/[sede]/verificacion) no está en el
  // menú — un sidebar vacío solo estorba en el celular.
  if (!scope || isScopedVerif) return null;

  const theme = BUSINESS_THEMES[scope];
  const ScopeIcon = theme.icon;
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
            onClick={() => !isScopedAdmin && setSwitcherOpen((v) => !v)}
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
            {!isScopedAdmin && (
              <ChevronDown className={`w-4 h-4 text-white/60 transition-transform shrink-0 ${switcherOpen ? "rotate-180" : ""}`} />
            )}
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

        <nav className="flex-1 px-3 py-3 overflow-y-auto" aria-label="Menú">
          {secciones.map((sec, k) => (
            <div key={sec.titulo ?? k} className={k > 0 ? "mt-4" : ""}>
              {sec.titulo && (
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{sec.titulo}</div>
              )}
              <div className="space-y-0.5">
                {sec.items.map((item) => <ItemMenu key={item.segment} item={item} href={hrefFor(item.segment)} activo={isActive(item.segment)} onClick={() => setOpen(false)} />)}
              </div>
            </div>
          ))}
        </nav>

        {/* Abajo, lo de vez en cuando: Configuración y quién está usando el sistema. */}
        {conConfiguracion && (
          <div className="border-t border-white/10 px-3 py-2 space-y-0.5">
            <ItemMenu item={CONFIGURACION} href={hrefFor(CONFIGURACION.segment)} activo={isActive(CONFIGURACION.segment)} onClick={() => setOpen(false)} />
            <form action={clearRole}>
              <button
                type="submit"
                title="Cambiar usuario"
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-white/65 hover:bg-white/10 hover:text-white transition-colors text-left"
              >
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">{role ? (role === "admin" ? "Jahnn" : "Kelly") : "Usuario"}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/45"><LogOut className="w-3.5 h-3.5" />Cambiar</span>
              </button>
            </form>
          </div>
        )}
      </aside>
    </>
  );
}
