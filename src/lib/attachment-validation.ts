/**
 * Validación de adjuntos (constancias de pago): solo imágenes o PDF,
 * tamaño acotado. Mensajes en español listos para mostrar.
 */

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const ATTACHMENT_ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
};

export function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/** null = válido; string = mensaje de error para el usuario. */
export function validateAttachment(
  contentType: string,
  sizeBytes: number,
): string | null {
  if (!ATTACHMENT_ALLOWED_TYPES[contentType]) {
    return "Solo se permiten imágenes (JPG, PNG, WebP) o PDF";
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "El archivo está vacío o no se pudo leer";
  }
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return `El archivo pesa más de 5 MB (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Comprime la imagen o usa una captura más liviana.`;
  }
  return null;
}

/**
 * Nombre seguro para el pathname del blob: sin rutas, sin caracteres raros,
 * acotado. La extensión original se preserva si es razonable.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "archivo";
  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin tildes
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_");
  return cleaned.slice(-80) || "archivo";
}
