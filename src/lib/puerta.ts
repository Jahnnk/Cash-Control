/**
 * Puerta única (Etapa 2 del mapa de sistemas, decisión de Jahnn, 21-nov-2026): qué botones ve cada persona en
 * /inicio. Una sola entrada para las 5 apps de Yayi's; cada uno ve solo lo que usa. Lógica pura (sin sesión ni BD):
 * quien llama traduce la sesión a un `PerfilPuerta`.
 *
 * Quién usa qué (respuesta de Jahnn, 21-nov): Cash Control todos; Control de Caja, Envíos y Planilla los
 * administradores y finanzas; Producción solo el administrador de Atelier; la dirección ve todo.
 */

export type ClaveApp = "cash" | "caja" | "envios" | "planilla" | "produccion";
export type Sede = "atelier" | "fonavi" | "centro";

export type PerfilPuerta =
  | { tipo: "direccion" }
  // Gerencia de finanzas (22-nov-2026): lo de dirección menos Producción (no la usa).
  | { tipo: "finanzas" }
  | { tipo: "admin"; sede: Sede }
  | { tipo: "verif"; sede: Sede }
  | { tipo: "highlight" }
  | { tipo: "equipo" }
  | { tipo: "lector" };

export type BotonPuerta = {
  clave: string;
  app: ClaveApp;
  titulo: string;
  detalle: string;
  /** Ruta dentro de Cash Control, o dirección completa de otra app. */
  href: string;
  externa: boolean;
};

/** Direcciones de las otras apps (se pueden cambiar con variables de entorno). */
export const URL_APPS: Record<Exclude<ClaveApp, "cash">, string> = {
  caja: process.env.CAJA_APP_URL ?? "https://yayis-control-caja.vercel.app",
  envios: process.env.ENVIOS_URL ?? "https://yayis-envios.vercel.app",
  planilla: process.env.PLANILLA_URL ?? "https://yayis-planilla.vercel.app",
  produccion: process.env.PRODUCCION_URL ?? "https://yayis-produccion.vercel.app",
};

export const NOMBRE_APP: Record<ClaveApp, string> = {
  cash: "Cash Control", caja: "Control de Caja", envios: "Envíos", planilla: "Planilla", produccion: "Producción",
};

const NOMBRE_SEDE: Record<Sede, string> = { atelier: "Atelier", fonavi: "Fonavi", centro: "Centro" };

const externo = (app: Exclude<ClaveApp, "cash">, titulo: string, detalle: string): BotonPuerta =>
  ({ clave: app, app, titulo, detalle, href: URL_APPS[app], externa: true });
const interno = (clave: string, titulo: string, detalle: string, href: string): BotonPuerta =>
  ({ clave, app: "cash", titulo, detalle, href, externa: false });

const CAJA = externo("caja", "Compras y rendición", "Listas, compras, boletas y reposición semanal");
const ENVIOS = externo("envios", "Envíos", "Pedidos y despachos de Atelier, clientes B2B y cuentas entre sedes");
const PLANILLA = externo("planilla", "Planilla", "Horarios, horas, descuentos y pagos del personal");
const PRODUCCION = externo("produccion", "Producción", "Hoja de producción, recetas e insumos de Atelier");

/** Los botones de una persona, en el orden en que los usa. */
export function botonesPara(p: PerfilPuerta): BotonPuerta[] {
  switch (p.tipo) {
    case "direccion":
      return [
        interno("dashboard", "Dashboard de Grupo", "Ventas, dinero, egresos y EBITDA de las 3 sedes", "/grupo/dashboard"),
        interno("acuerdos", "Acuerdos y tareas", "Lo acordado en las reuniones, con responsable y fecha", "/grupo/acuerdos"),
        interno("precios", "Precios de compra", "Dónde se paga de más y qué precios suben", "/grupo/precios-compra"),
        CAJA, ENVIOS, PLANILLA, PRODUCCION,
      ];
    case "finanzas":
      return [
        interno("dashboard", "Dashboard de Grupo", "Ventas, dinero, egresos y EBITDA de las 3 sedes", "/grupo/dashboard"),
        interno("acuerdos", "Acuerdos y tareas", "Lo acordado en las reuniones, con responsable y fecha", "/grupo/acuerdos"),
        interno("precios", "Precios de compra", "Dónde se paga de más y qué precios suben", "/grupo/precios-compra"),
        CAJA, ENVIOS, PLANILLA,
      ];
    case "admin": {
      const panel = interno("panel", `Mi panel · ${NOMBRE_SEDE[p.sede]}`, "KPIs del día, ventas, tareas y bono del mes", `/${p.sede}/panel`);
      return p.sede === "atelier" ? [panel, CAJA, ENVIOS, PLANILLA, PRODUCCION] : [panel, CAJA, ENVIOS, PLANILLA];
    }
    case "verif":
      return [interno("verificacion", `Verificación · ${NOMBRE_SEDE[p.sede]}`, "Tiempos de atención y segunda firma del conteo", `/${p.sede}/verificacion`)];
    case "highlight":
      return [
        interno("supervisiones", "Supervisiones", "Visitas a las sedes y sus observaciones", "/grupo/supervisiones"),
        interno("acuerdos", "Acuerdos y tareas", "Lo acordado en las reuniones, con responsable y fecha", "/grupo/acuerdos"),
        interno("highlight", "Highlight", "La tarea de la semana de cada sede", "/grupo/highlight"),
      ];
    case "equipo":
      return [interno("acuerdos", "Acuerdos y tareas", "Lo acordado en las reuniones, con responsable y fecha", "/grupo/acuerdos")];
    case "lector":
      return [
        interno("dashboard", "Dashboard de Grupo", "Ventas, dinero, egresos y EBITDA de las 3 sedes", "/grupo/dashboard"),
        interno("reportes", "Reportes", "Los reportes del mes", "/grupo/reportes"),
      ];
  }
}

/** Traduce el scope de una sesión (v2/v3) a su perfil. null = sin puerta (no debería pasar). */
export function perfilDesdeScope(scope: string): PerfilPuerta | null {
  if (scope === "highlight" || scope === "equipo" || scope === "lector") return { tipo: scope };
  if (scope.startsWith("direccion-")) return { tipo: "direccion" };
  if (scope === "finanzas") return { tipo: "finanzas" };
  const [kind, sede] = scope.split("-");
  if ((kind === "admin" || kind === "verif") && (sede === "atelier" || sede === "fonavi" || sede === "centro")) return { tipo: kind, sede };
  return null;
}
