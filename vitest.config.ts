import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig ("@/*" → "./src/*") para poder testear
    // módulos que importan con "@/..." (ej. server actions con mocks).
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    // Tests unitarios de lógica pura — entorno node, sin DOM ni BD.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Aísla de cualquier setup de red/BD: estos tests no tocan Neon.
    globals: false,
  },
});
