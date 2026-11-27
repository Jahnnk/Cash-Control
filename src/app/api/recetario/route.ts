import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { leerCatalogoCafeteria } from "@/lib/carta-sql";
import { armarRecetario } from "@/lib/recetario";
import { recetarioWord } from "@/lib/recetario-word";

const sql = neon(process.env.DATABASE_URL!);

export const runtime = "nodejs";

/**
 * GET /api/recetario?seccion=Bebidas — el recetario de cocina de una sección de las cafeterías, en Word
 * (27-nov-2026). Sale de las mismas recetas con que se costea. Solo dirección.
 */
export async function GET(req: Request) {
  const role = await getSessionRole();
  if (role?.kind !== "full") return NextResponse.json({ error: "Solo dirección." }, { status: 403 });
  const seccion = (new URL(req.url).searchParams.get("seccion") ?? "").trim().slice(0, 60);
  if (!seccion) return NextResponse.json({ error: "Elige una sección." }, { status: 400 });
  try {
    const [cat, arch] = await Promise.all([
      leerCatalogoCafeteria(sql),
      (sql`SELECT ref FROM recetas_archivadas WHERE business_id = 2` as unknown as Promise<{ ref: string }[]>).catch(() => []),
    ]);
    const r = armarRecetario(seccion, cat.recetas, new Set(arch.map((a) => a.ref)));
    if (r.productos.length === 0) return NextResponse.json({ error: "Esa sección no tiene recetas." }, { status: 404 });
    const fecha = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
    const buf = await recetarioWord(r, fecha);
    const archivo = `${fecha}_Recetario_${seccion.replace(/[^\p{L}\p{N}]+/gu, "_")}.docx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="recetario.docx"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[recetario] failed:", e);
    return NextResponse.json({ error: "No se pudo armar el recetario." }, { status: 500 });
  }
}
