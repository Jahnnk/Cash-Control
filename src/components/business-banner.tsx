import { getBusinessTheme, type ScopeCode } from "@/lib/business-theme";

/**
 * Banner permanente de 48px arriba del contenido de cada página.
 * Color de fondo = color oficial del negocio. Garantiza que en
 * 0.1 segundos el usuario sepa en qué scope está, sin depender
 * de leer el sidebar.
 */
export function BusinessBanner({ scope }: { scope: ScopeCode }) {
  const theme = getBusinessTheme(scope);
  if (!theme) return null;
  const Icon = theme.icon;

  return (
    <div
      className="h-12 flex items-center px-4 lg:px-8 gap-3"
      style={{ backgroundColor: theme.color, color: theme.contrast }}
      role="banner"
    >
      <Icon className="w-5 h-5 shrink-0" />
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm font-semibold truncate">{theme.label}</span>
        <span className="text-xs text-white/80 hidden sm:inline truncate">· {theme.description}</span>
      </div>
    </div>
  );
}
