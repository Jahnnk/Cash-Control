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

export function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export function getToday(): string {
  return new Date().toISOString().split("T")[0];
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
