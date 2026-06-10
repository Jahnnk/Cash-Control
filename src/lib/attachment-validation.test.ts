import { describe, it, expect } from "vitest";
import { validateAttachment, sanitizeFilename, ATTACHMENT_MAX_BYTES, isImageType } from "./attachment-validation";

describe("validateAttachment", () => {
  it("acepta JPG, PNG, WebP y PDF dentro del límite", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(validateAttachment(t, 500_000)).toBeNull();
    }
  });

  it("rechaza tipos no permitidos con mensaje claro", () => {
    for (const t of ["image/gif", "video/mp4", "application/zip", "text/html", ""]) {
      expect(validateAttachment(t, 1000)).toMatch(/Solo se permiten/);
    }
  });

  it("rechaza archivos de más de 5 MB", () => {
    expect(validateAttachment("image/jpeg", ATTACHMENT_MAX_BYTES + 1)).toMatch(/más de 5 MB/);
    expect(validateAttachment("image/jpeg", ATTACHMENT_MAX_BYTES)).toBeNull(); // exacto OK
  });

  it("rechaza archivos vacíos", () => {
    expect(validateAttachment("image/png", 0)).toMatch(/vacío/);
  });
});

describe("sanitizeFilename", () => {
  it("elimina rutas y caracteres peligrosos", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\fotos\\pago banco.jpg")).toBe("pago_banco.jpg");
    expect(sanitizeFilename("constancia BCP #123 (final).pdf")).toBe("constancia_BCP_123_final_.pdf");
  });
  it("quita tildes y acota el largo", () => {
    expect(sanitizeFilename("constancia-débito-junio.png")).toBe("constancia-debito-junio.png");
    expect(sanitizeFilename("x".repeat(200) + ".jpg").length).toBeLessThanOrEqual(80);
  });
  it("nunca devuelve vacío", () => {
    expect(sanitizeFilename("////")).toBe("archivo");
  });
});

describe("isImageType", () => {
  it("distingue imagen de PDF", () => {
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("application/pdf")).toBe(false);
  });
});
