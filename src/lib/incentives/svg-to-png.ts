/**
 * Convierte un dibujo SVG (bonos-charts.ts) en una imagen PNG para pegarla en
 * el PDF y en el Excel. Solo funciona en el navegador: usa el lienzo (canvas)
 * del propio navegador, así no hace falta ninguna librería.
 *
 * Se dibuja al doble de tamaño para que no se vea borroso al imprimir.
 */

import type { Dibujo } from "./bonos-charts";

export type ImagenPng = { dataUrl: string; width: number; height: number };

export async function svgAPng(d: Dibujo, escala = 2): Promise<ImagenPng> {
  const blob = new Blob([d.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, mal) => {
      img.onload = () => ok();
      img.onerror = () => mal(new Error("No se pudo dibujar el gráfico."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(d.width * escala);
    canvas.height = Math.round(d.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite dibujar gráficos.");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: d.width, height: d.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
