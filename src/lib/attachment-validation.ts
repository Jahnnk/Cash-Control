/**
 * Validación de adjuntos (constancias de pago): solo imágenes o PDF,
 * tamaño acotado. Mensajes en español listos para mostrar.
 */

/**
 * 4 MB, no 5.
 *
 * Vercel corta las peticiones a funciones serverless en ~4.5 MB de
 * cuerpo, ANTES de que lleguen a nuestro código. Con el tope en 5 MB,
 * una foto de 4.6 MB pasaba la validación del navegador y después
 * rebotaba en la plataforma con un 413 que ni siquiera es JSON — el
 * usuario veía un error de conexión sin sentido. 4 MB deja margen para
 * la envoltura del multipart y sigue siendo de sobra para una foto.
 */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024; // 4 MB

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
    return `El archivo pesa ${(sizeBytes / 1024 / 1024).toFixed(1)} MB y el máximo son 4 MB. Toma la foto con menos resolución o compártela comprimida.`;
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
