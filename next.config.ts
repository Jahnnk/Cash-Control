import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Excel de Kelly viaja como archivo en una acción del servidor; el tope por defecto es 1 MB.
  // (Vercel acepta hasta 4.5 MB por petición.)
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
