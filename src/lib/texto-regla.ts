/**
 * Reglas "todos los pagos que dicen X" de la bandeja Por definir (separar
 * gastos de un grupo). Sin dependencias pesadas: la usa también la pantalla.
 */

import { normGrupoPE } from "./norm-texto";

/**
 * El concepto tal como se compara en las reglas: sin la fecha que agrega el
 * lector del Excel ("[Tue Sep 01 2026 00:00:00 GMT+0000 (…)]", que cambia
 * con la zona horaria de quien importa), sin tildes, en MAYÚSCULAS y con
 * espacios simples. Es lo mismo que norm_grupo(concepto_norm(x)) en SQL.
 */
export function textoDeRegla(texto: string | null | undefined): string {
  return normGrupoPE(
    String(texto ?? "").replace(/\s*\[[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{4} \d{2}:\d{2}:\d{2} GMT[^\]]*\]/g, ""),
  );
}

/** Texto que se propone para la regla: el concepto sin lo que va entre paréntesis o corchetes. */
export function textoSugeridoParaRegla(concepto: string | null | undefined): string {
  return textoDeRegla(String(concepto ?? "").replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\([^)]*\)/g, ""));
}

export function coincideRegla(concepto: string | null | undefined, texto: string): boolean {
  const t = textoDeRegla(texto);
  return t.length > 0 && textoDeRegla(concepto).includes(t);
}

/** Clave de una regla por concepto: dentro de la categoría de origen. */
export function claveConcepto(categoria: string, texto: string): string {
  return `${categoria}|${textoDeRegla(texto)}`;
}

