/**
 * Normalización de textos del Excel de Kelly (grupos y conceptos): sin
 * tildes, MAYÚSCULAS y espacios simples — "DECORACIÒN" = "decoración".
 * Es lo mismo que norm_grupo() en SQL. Sin dependencias, para que la pueda
 * usar el navegador.
 */
export function normGrupoPE(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
