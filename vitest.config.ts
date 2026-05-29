import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests unitarios de lógica pura — entorno node, sin DOM ni BD.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Aísla de cualquier setup de red/BD: estos tests no tocan Neon.
    globals: false,
  },
});
