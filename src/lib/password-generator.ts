/**
 * Generador de contraseñas del personal: `NNNN-palabra-palabra-palabra-palabra`.
 *
 * Diseño (decidido con Jahnn, jul-2026):
 *  - Empieza con NÚMERO a propósito: el teclado del celular pone
 *    mayúscula automática en la primera LETRA y la comparación es
 *    exacta — empezando con dígito ese problema no existe.
 *  - Palabras en minúscula sin tildes ni ñ: se dictan en voz alta sin
 *    deletrear y se teclean sin cambiar de teclado.
 *  - 4 palabras de una lista de 256 + número de 4 cifras ≈ 45 bits:
 *    siglos de fuerza bruta incluso atacando en paralelo (el login
 *    tiene pausa de 500ms pero es por conexión, no global).
 */

import { randomInt } from "node:crypto";

const WORDS = (
  "horno masa dulce trigo canela fresa nuez miel cacao vainilla almendra limon " +
  "bandeja molde batidor harina azucar levadura crema queso mantequilla huevo leche " +
  "sal agua aceite naranja manzana platano pera uva durazno higo coco mango pina " +
  "cereza mora arandano frambuesa ciruela datil pasa avena maiz arroz centeno quinua " +
  "cebada salvado germen semilla ajonjoli linaza chia amapola clavo anis jengibre " +
  "cardamomo pimienta romero tomillo albahaca menta hierba flor petalo hoja rama " +
  "tronco raiz brote tallo espiga grano polvo pasta migaja corteza miga borde capa " +
  "relleno cobertura glaseado betun merengue mousse trufa bombon caramelo turron " +
  "brownie galleta bizcocho panque tarta pastel torta flan budin gelatina helado " +
  "sorbete batido jugo cafe chocolate cocoa canasta charola rejilla espatula rodillo " +
  "cuchara tenedor cuchillo tijera pinza brocha colador tamiz balanza reloj " +
  "termometro guante mandil gorro toalla trapo esponja jabon cubeta jarra vaso taza " +
  "plato tazon fuente olla sarten cacerola caldero vapor fuego brasa carbon chispa " +
  "llama humo aroma sabor textura color brillo forma peso medida gramo kilo litro " +
  "pizca gota chorro punado manojo racimo docena par trio ronda turno jornada semana " +
  "quincena mes trimestre ciclo etapa fase paso ruta camino senda puente puerta " +
  "llave cerrojo candado cofre baul caja bolsa saco costal tarro frasco botella " +
  "lata envase tapa sello etiqueta marca firma nota apunte lista tabla ficha " +
  "carpeta libro pagina linea punto coma guion barra flecha circulo cuadro rombo " +
  "estrella luna sol nube lluvia viento brisa aire cielo tierra campo huerto jardin " +
  "patio terraza balcon ventana muro techo piso suelo mesa silla banco estante " +
  "repisa cajon closet perchero espejo lampara foco vela linterna faro timer plato " +
  "molino costra oblea crocante hojaldre brioche baguette ciabatta focaccia rosca " +
  "trenza empanada alfajor suspiro manjar lucuma chirimoya granadilla maracuya " +
  "aguaymanto camote yuca kiwicha cancha tostada rebanada porcion tajada mitad"
).split(/\s+/);

const POOL: string[] = [...new Set(WORDS)].slice(0, 256);

/** Genera una contraseña nueva. Azar criptográfico, nunca Math.random. */
export function generateStaffPassword(): string {
  if (POOL.length < 256) throw new Error("Lista de palabras incompleta");
  const words: string[] = [];
  while (words.length < 4) {
    const w = POOL[randomInt(256)];
    if (!words.includes(w)) words.push(w);
  }
  return `${randomInt(1000, 10000)}-${words.join("-")}`;
}
