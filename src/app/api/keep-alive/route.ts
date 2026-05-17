/**
 * Keep-alive endpoint para mantener Neon despierta durante horario
 * laboral en Perú (8 AM - 8 PM). Fuera de ese rango devuelve OK sin
 * tocar la BD para conservar las ~100 horas de compute/mes del plan
 * Free de Neon.
 *
 * Lo invoca un cron externo (cron-job.org) cada 4 minutos. Ver
 * AGENTS.md sección "Keep-Alive Cron".
 *
 * Requiere header `x-keep-alive-token` o querystring `?token=...`
 * que matchee `process.env.KEEP_ALIVE_TOKEN`.
 */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const KEEP_ALIVE_TOKEN = process.env.KEEP_ALIVE_TOKEN;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ?? request.headers.get("x-keep-alive-token");

  if (!KEEP_ALIVE_TOKEN || token !== KEEP_ALIVE_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Hora actual en Lima (UTC-5). Usamos formatToParts para parsear
  // de manera estable independiente del locale del runtime.
  const peruHourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(peruHourStr, 10);

  if (hour < 8 || hour >= 20) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Outside working hours (Peru 8AM-8PM)",
      hour,
    });
  }

  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1 as alive`);
    const ms = Date.now() - start;
    return NextResponse.json({
      ok: true,
      alive: true,
      latency_ms: ms,
      hour_peru: hour,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
