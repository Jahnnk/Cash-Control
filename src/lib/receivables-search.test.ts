/**
 * Tests del buscador de documentos por cobrar.
 *
 * Los datos replican documentos reales de Atelier (ago-2026), con sus
 * rarezas: nombres con tilde, boletas/tickets sin RUC, y la serie
 * escrita con ceros a la izquierda en la pantalla ("FB02-001204") pero
 * sin ellos en la llave interna ("FB02-1204").
 */
import { describe, it, expect } from "vitest";
import { filtrarDocumentos, normalizarBusqueda } from "./receivables-search";

const doc = (
  cliente: string,
  documento: string | null,
  serie: string | null,
  docKey: string,
) => ({ cliente, documento, serie, docKey });

const DOCS = [
  doc("KAPHIY PERU S.R.L.", "20611230932", "FB02-001204", "FB02-1204"),
  doc("KAPHIY PERU S.R.L.", "20611230932", "FB02-001210", "FB02-1210"),
  doc("G & V AGROANDINA S.A.C.", "20605241701", "FB02-001215", "FB02-1215"),
  doc("VALERA VILLANUEVA GABRIELA SOFÍA", "10718835050", "FB02-001212", "FB02-1212"),
  doc("URBINA YAP SAM XIMENA OLGA", null, "BB02-000053", "BB02-53"),
  doc("BITESCORP S.R.L.", null, null, "TICKET-1423"),
];

describe("normalizarBusqueda", () => {
  it("quita tildes y mayúsculas", () => {
    expect(normalizarBusqueda("  SOFÍA  ")).toBe("sofia");
    expect(normalizarBusqueda("Añejo")).toBe("anejo");
  });
});

describe("filtrarDocumentos", () => {
  it("sin búsqueda devuelve todo tal cual", () => {
    expect(filtrarDocumentos(DOCS, "")).toHaveLength(DOCS.length);
    expect(filtrarDocumentos(DOCS, "   ")).toHaveLength(DOCS.length);
  });

  it("busca por nombre del cliente, sin importar mayúsculas", () => {
    const r = filtrarDocumentos(DOCS, "kaphiy");
    expect(r).toHaveLength(2);
    expect(r.every((d) => d.cliente.startsWith("KAPHIY"))).toBe(true);
  });

  it("encuentra a la clienta con tilde escribiendo sin tilde", () => {
    // El caso que motivó normalizar: Luis nunca va a teclear "SOFÍA".
    const r = filtrarDocumentos(DOCS, "sofia");
    expect(r).toHaveLength(1);
    expect(r[0].docKey).toBe("FB02-1212");
  });

  it("busca por RUC completo o por un pedazo", () => {
    expect(filtrarDocumentos(DOCS, "20605241701")).toHaveLength(1);
    expect(filtrarDocumentos(DOCS, "2061123")).toHaveLength(2);
  });

  it("encuentra por número de documento, con ceros o sin ellos", () => {
    // "FB02-001204" es lo que Luis ve en pantalla y en Byte;
    // "FB02-1204" es la llave interna. Las dos tienen que funcionar.
    expect(filtrarDocumentos(DOCS, "001204")).toHaveLength(1);
    expect(filtrarDocumentos(DOCS, "FB02-1204")).toHaveLength(1);
    expect(filtrarDocumentos(DOCS, "1204")).toHaveLength(1);
  });

  it("combina palabras que viven en columnas distintas", () => {
    // "kaphiy 1210": el nombre está en una columna y el número en otra.
    const r = filtrarDocumentos(DOCS, "kaphiy 1210");
    expect(r).toHaveLength(1);
    expect(r[0].docKey).toBe("FB02-1210");
  });

  it("no rompe con documentos sin RUC ni serie (boletas y tickets)", () => {
    expect(filtrarDocumentos(DOCS, "urbina")).toHaveLength(1);
    expect(filtrarDocumentos(DOCS, "bitescorp")).toHaveLength(1);
    expect(filtrarDocumentos(DOCS, "1423")).toHaveLength(1);
  });

  it("devuelve vacío cuando no hay coincidencias", () => {
    expect(filtrarDocumentos(DOCS, "zzz-no-existe")).toEqual([]);
  });
});
