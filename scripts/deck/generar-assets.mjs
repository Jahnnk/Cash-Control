/**
 * Genera src/lib/kpis/deck-assets.ts: el logo de Yayi's y los iconos del
 * deck como PNG en base64 (el deck se arma en el navegador con pptxgenjs y
 * no puede leer archivos; PNG y no SVG para que PowerPoint, Keynote y Google
 * Slides los muestren igual).
 *
 *   node scripts/deck/generar-assets.mjs "<carpeta assets del skill yayis-pptx-style>"
 *
 * Iconos: lucide (licencia ISC), trazo 2px, en los colores de la marca.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const ASSETS = process.argv[2];
const ICONOS = {
  tienda: "store", fabrica: "factory", barras: "chart-no-axes-column-increasing", carrito: "shopping-cart",
  estrella: "star", torta: "chart-pie", lectura: "notebook-text", calendario: "calendar-days",
  flechaArriba: "arrow-up", flechaAbajo: "arrow-down", check: "circle-check", tendencia: "trending-up",
  personas: "users", diana: "target", alerta: "circle-alert", grupo: "users",
};
const COLORES = { oscuro: "#004C40", verde: "#098B5F", blanco: "#FFFFFF", rojo: "#C0392B", ambar: "#D9A441", gris: "#8C8C8C" };

const attrs = (o) => Object.entries(o).filter(([k]) => k !== "key").map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}="${v}"`).join(" ");

const out = { iconos: {}, logo: {} };
for (const [nombre, archivo] of Object.entries(ICONOS)) {
  const mod = await import(path.resolve("node_modules/lucide-react/dist/esm/icons", `${archivo}.mjs`));
  const cuerpo = mod.__iconNode.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
  out.iconos[nombre] = {};
  for (const [c, hex] of Object.entries(COLORES)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;
    const png = await sharp(Buffer.from(svg), { density: 400 }).resize(96, 96).png().toBuffer();
    out.iconos[nombre][c] = `image/png;base64,${png.toString("base64")}`;
  }
}
for (const [c, archivo] of [["crema", "logo-crema.png"], ["verde", "logo-verde.png"]]) {
  const png = await sharp(readFileSync(path.join(ASSETS, archivo))).resize(420).png().toBuffer();
  out.logo[c] = `image/png;base64,${png.toString("base64")}`;
}

const ts = `/* Generado por scripts/deck/generar-assets.mjs — no editar a mano. */
/* Iconos: lucide (ISC). Logo: wordmark de Yayi's (842×285, relación 2.954:1). */

export type IconoDeck = ${Object.keys(ICONOS).map((k) => `"${k}"`).join(" | ")};
export type ColorIcono = ${Object.keys(COLORES).map((k) => `"${k}"`).join(" | ")};

export const ICONOS: Record<IconoDeck, Record<ColorIcono, string>> = ${JSON.stringify(out.iconos)};

export const LOGO: Record<"crema" | "verde", string> = ${JSON.stringify(out.logo)};
`;
writeFileSync("src/lib/kpis/deck-assets.ts", ts);
console.log("ok", Math.round(ts.length / 1024), "KB");
