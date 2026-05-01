// Renderiza gráficos a PNG dataURL usando Chart.js sobre canvas oculto
import type { ChartConfiguration } from "chart.js";

let registered = false;

async function getChart() {
  const chart = await import("chart.js");
  if (!registered) {
    chart.Chart.register(...chart.registerables);
    registered = true;
  }
  return chart.Chart;
}

export async function renderChartToPng(
  config: ChartConfiguration,
  width = 700,
  height = 320
): Promise<string> {
  const Chart = await getChart();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // Para que Chart.js no muestre la cosa flickeante en pantalla, lo dejamos fuera del flow
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  const chart = new Chart(ctx, {
    ...config,
    options: {
      ...config.options,
      animation: false,
      responsive: false,
      plugins: { ...(config.options?.plugins ?? {}), legend: { ...(config.options?.plugins?.legend ?? {}), display: true } },
    },
  });

  // Forzar render síncrono
  chart.update("none");
  const dataUrl = canvas.toDataURL("image/png");
  chart.destroy();
  document.body.removeChild(canvas);
  return dataUrl;
}
