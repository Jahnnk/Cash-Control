"use client";

/**
 * Sparkline — la tendencia sin ejes ni ruido. Una sola serie, así que
 * no lleva leyenda: el título de la tarjeta la nombra.
 *
 * Datos REALES siempre (venta diaria de los últimos días). Si no hay
 * al menos 2 puntos no se dibuja nada: una línea inventada es peor que
 * ningún gráfico.
 */
export function Sparkline({
  points,
  tone = "neutral",
  height = 40,
  showDot = true,
  className = "",
}: {
  points: number[];
  tone?: "positive" | "negative" | "neutral";
  height?: number;
  showDot?: boolean;
  className?: string;
}) {
  if (points.length < 2) return null;

  const w = 200;
  const h = height;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  const stroke =
    tone === "positive" ? "#059669" : tone === "negative" ? "#DC2626" : "#64748B";
  const fill =
    tone === "positive" ? "#05966914" : tone === "negative" ? "#DC262614" : "#64748B14";
  const lastX = (points.length - 1) * step;
  const lastY = y(points[points.length - 1]);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`w-full ${className}`}
      style={{ height }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={area} fill={fill} stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {showDot && (
        <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/**
 * Barra de progreso sobria: el relleno cuenta la historia, el riel casi
 * no se ve. `pct` se recorta a 0-100 para que un 140% no se desborde.
 */
export function ProgressBar({
  pct,
  tone = "neutral",
  className = "",
}: {
  pct: number;
  tone?: "positive" | "warning" | "negative" | "neutral";
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, pct));
  const bg =
    tone === "positive" ? "bg-emerald-500"
    : tone === "warning" ? "bg-amber-500"
    : tone === "negative" ? "bg-red-500"
    : "bg-slate-400";
  return (
    <div className={`h-1.5 w-full rounded-full bg-gray-100 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${bg} transition-[width] duration-700 ease-out`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
