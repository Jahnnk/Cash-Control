import { ChefHat, Coffee, Building2, BarChart3, type LucideIcon } from "lucide-react";

export type ScopeCode = "atelier" | "fonavi" | "centro" | "grupo";

export type BusinessTheme = {
  /** Color hex principal del negocio. Se usa en banner, acentos, dot del switcher. */
  color: string;
  /** Variante semitransparente (mismo color con alpha bajo) para fondos sutiles. */
  colorSoft: string;
  /** Color de texto contrastante para usar sobre el fondo principal (blanco para todos). */
  contrast: string;
  /** Ícono Lucide del negocio. */
  icon: LucideIcon;
  /** Nombre canónico mostrado en UI. */
  label: string;
  /** Subtítulo/descripción breve. */
  description: string;
};

/**
 * Tema visual por negocio. Colores oficiales fijados por Jahnn:
 *   - Atelier: terracota / naranja oscuro
 *   - Fonavi:  verde
 *   - Centro:  verde oscuro Yayi's (mismo que primary actual)
 *   - Grupo:   slate-600 (gris azulado)
 *
 * `colorSoft` es el mismo color con alpha hex 1A (~10%); útil para
 * iconos/cards con fondo sutil sin perder identidad de marca.
 */
export const BUSINESS_THEMES: Record<ScopeCode, BusinessTheme> = {
  atelier: {
    color: "#C65A3A",
    colorSoft: "#C65A3A1A",
    contrast: "#FFFFFF",
    icon: ChefHat,
    label: "Yayi's Atelier",
    description: "Centro de producción · B2B",
  },
  fonavi: {
    color: "#037753",
    colorSoft: "#0377531A",
    contrast: "#FFFFFF",
    icon: Coffee,
    label: "Yayi's Fonavi",
    description: "Cafetería Fonavi",
  },
  centro: {
    color: "#004C40",
    colorSoft: "#004C401A",
    contrast: "#FFFFFF",
    icon: Building2,
    label: "Yayi's Centro",
    description: "Cafetería Centro",
  },
  grupo: {
    color: "#475569",
    colorSoft: "#4755691A",
    contrast: "#FFFFFF",
    icon: BarChart3,
    label: "Grupo Yayi's",
    description: "Vista consolidada",
  },
};

export function getBusinessTheme(code: string): BusinessTheme | null {
  if (code === "atelier" || code === "fonavi" || code === "centro" || code === "grupo") {
    return BUSINESS_THEMES[code];
  }
  return null;
}
