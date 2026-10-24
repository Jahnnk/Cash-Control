/**
 * Pruebas de REGRESIÓN contra la base real (solo lectura): `npm run test:regresion`.
 *
 * Corren el cálculo completo de la app (lectura + armado) sobre meses ya cerrados y verifican las cifras al
 * céntimo. No entran en `npm test` ni en el CI: necesitan DATABASE_URL (.env.local). Los datos no se copian al
 * repositorio (es público): se leen de la base en el momento.
 */
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: { alias: { "@": new URL("../../src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["scripts/regresion/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    globals: false,
  },
});
