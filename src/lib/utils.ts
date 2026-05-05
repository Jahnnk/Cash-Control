export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `S/${num.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Lima",
  });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Lima",
  });
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Hoy en zona Lima (America/Lima, UTC−5) en formato YYYY-MM-DD.
 * `en-CA` produce el ISO sortable directo. NO uses toISOString() porque
 * devuelve UTC y entre 19:00–23:59 hora Lima ya es el día siguiente UTC,
 * causando bugs en selectores y subtitles "al fecha".
 */
export function getToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/**
 * Ayer en zona Lima — basado en getToday() para consistencia.
 */
export function getYesterday(): string {
  const today = getToday();
  const d = new Date(today + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function daysBetween(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function agingColor(days: number): string {
  if (days <= 7) return "bg-green-500";
  if (days <= 15) return "bg-yellow-400";
  if (days <= 30) return "bg-orange-500";
  return "bg-red-500";
}

export function agingTextColor(days: number): string {
  if (days <= 7) return "text-green-600";
  if (days <= 15) return "text-yellow-600";
  if (days <= 30) return "text-orange-600";
  return "text-red-600";
}
