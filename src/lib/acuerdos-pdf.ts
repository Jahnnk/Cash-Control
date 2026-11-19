/**
 * Resumen ejecutivo semanal de acuerdos → PDF (fase 4, 19-nov-2026). Una o dos hojas A4 para llevar a la
 * reunión de los lunes o mandar por WhatsApp. Mismos datos que la pantalla (lib/acuerdos.ts → resumenSemanal):
 * el PDF nunca contradice a la pantalla. Se genera en el navegador con jsPDF.
 */

import { jsPDF } from "jspdf";
import { AREA_LABEL, type ResumenSemanal } from "./acuerdos";

const VERDE: [number, number, number] = [0, 76, 64];
const GRIS: [number, number, number] = [107, 114, 128];
const ROJO: [number, number, number] = [185, 28, 28];
const TINTA: [number, number, number] = [17, 24, 39];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const dia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
export const rangoSemana = (r: ResumenSemanal) => `${dia(r.semana.desde)} al ${dia(r.semana.hasta)} ${r.semana.hasta.slice(0, 4)}`;

export function pdfResumenSemanal(r: ResumenSemanal): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const X = 16, ANCHO = 178, FIN = 282;
  let y = 0;

  const salto = (alto: number) => {
    if (y + alto > FIN) { doc.addPage(); y = 18; }
  };
  const texto = (t: string, o: { tam?: number; color?: [number, number, number]; negrita?: boolean; x?: number; ancho?: number } = {}) => {
    const tam = o.tam ?? 10;
    doc.setFont("helvetica", o.negrita ? "bold" : "normal").setFontSize(tam).setTextColor(...(o.color ?? TINTA));
    const lineas = doc.splitTextToSize(t, o.ancho ?? ANCHO - ((o.x ?? X) - X)) as string[];
    const alto = lineas.length * tam * 0.42;
    salto(alto);
    doc.text(lineas, o.x ?? X, y + tam * 0.35);
    y += alto + 1.2;
  };
  const titulo = (t: string) => {
    y += 4;
    salto(14);
    texto(t, { tam: 12, negrita: true, color: VERDE });
    doc.setDrawColor(220, 224, 220).line(X, y, X + ANCHO, y);
    y += 2.5;
  };
  const vineta = (t: string, color: [number, number, number] = TINTA) => texto(`·  ${t}`, { x: X + 2, ancho: ANCHO - 4, color });

  // Cabecera
  doc.setFillColor(...VERDE).rect(0, 0, 210, 22, "F");
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(255, 255, 255).text("Acuerdos y tareas · Resumen semanal", X, 11);
  doc.setFont("helvetica", "normal").setFontSize(10).text(`Yayi's · semana del ${rangoSemana(r)}`, X, 17);
  y = 30;

  // Cifras
  const c = r.cumplimiento;
  const comp = c.pctATiempo !== null && r.pctAnterior !== null ? ` (semana anterior: ${r.pctAnterior}%)` : "";
  texto(c.juzgados
    ? `Se cumplió a tiempo el ${c.pctATiempo}% de lo que vencía${comp}: ${c.aTiempo} a tiempo, ${c.tarde} tarde y ${c.vencidos} sin cumplir.`
    : "La semana no tenía acuerdos con fecha límite.", { tam: 11, negrita: true });
  texto(`Hoy siguen vencidos: ${r.arrastrados.length}. Vencen esta semana: ${r.proximos.length}. Reuniones registradas: ${r.reuniones.length}. Tareas nuevas: ${r.nuevos}.`, { color: GRIS });

  titulo("Qué recomendamos");
  r.recomendaciones.forEach((t, i) => texto(`${i + 1}.  ${t}`, { x: X + 2, ancho: ANCHO - 4 }));

  titulo(`Vencidos que arrastramos (${r.arrastrados.length})`);
  if (!r.arrastrados.length) texto("Ninguno.", { color: GRIS });
  r.arrastrados.forEach((a) => vineta(`${a.que} · ${a.responsableNombre} · venció el ${dia(a.fechaLimite)} (hace ${a.diasAtraso} ${a.diasAtraso === 1 ? "día" : "días"})`, ROJO));

  titulo(`Vencen esta semana (${r.proximos.length})`);
  if (!r.proximos.length) texto("Ninguno.", { color: GRIS });
  r.proximos.forEach((a) => vineta(`${dia(a.fechaLimite)} · ${a.que} · ${a.responsableNombre}`));

  if (r.porResponsable.length) {
    titulo("Por responsable (lo que vencía en la semana)");
    r.porResponsable.forEach((p) => vineta(`${p.nombre}: ${p.pctATiempo === null ? "aún en plazo" : `${p.pctATiempo}% a tiempo`} · ${p.aTiempo} a tiempo, ${p.tarde} tarde, ${p.vencidos} ${p.vencidos === 1 ? "vencido" : "vencidos"}`));
  }

  if (r.reuniones.length) {
    titulo("Reuniones de la semana");
    r.reuniones.forEach((x) => vineta(`${dia(x.fecha)} · ${x.titulo} (${AREA_LABEL[x.area]})`));
  }

  return { blob: doc.output("blob"), filename: `Acuerdos_Yayis_${r.semana.desde}_${r.semana.hasta}.pdf` };
}
