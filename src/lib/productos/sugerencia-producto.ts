/**
 * Ingeniería de menú por producto (pedido de Jahnn, 24-oct-2026): al buscar un producto, además de cómo se vendió, el sistema
 * dice QUÉ HACER con él — potenciar, mantener (y mejorar su margen), promocionar, preparar su reemplazo o sacarlo — y por qué,
 * con los números a la vista. Lógica pura y auditable.
 *
 * La base es la matriz de la carta de Fonavi y Centro (lib/productos/matriz-carta.ts): cuánto se vende (unidades por semana)
 * contra cuánto deja cada venta (precio − costo), con la mediana de la carta como corte:
 *   · Estrella      vende mucho y deja mucho  → POTENCIAR
 *   · Vaca          vende mucho y deja poco   → MANTENER y mejorarle el margen
 *   · Interrogante  vende poco y deja mucho   → PROMOCIONAR
 *   · Perro         vende poco y deja poco    → SACAR (o reemplazar)
 * Encima manda el modelo de candidatos a reemplazo (lib/productos/candidatos.ts), que mira 3 meses, las dos sedes y lo que
 * cuesta mantenerlo: si dice «sacar» o «preparar reemplazo», eso es lo que se sugiere. La tendencia matiza la sugerencia.
 */

import { CUADRANTES, type FichaProducto } from "./matriz-carta";
import type { Candidato } from "./candidatos";

export type AccionProducto = "potenciar" | "mantener" | "promocionar" | "preparar" | "sacar" | "revisar" | "esperar" | "sin-costo" | "sin-datos";

export type Sugerencia = {
  accion: AccionProducto;
  /** El verbo, para el titular. */
  titulo: string;
  /** Cómo se llama su caja en la matriz (null si no está ubicado). */
  caja: string | null;
  /** Por qué, con números. */
  porque: string[];
  /** Qué hacer, en concreto. */
  ideas: string[];
  /** Un matiz importante (tendencia que contradice la caja, etc.). */
  ojo: string | null;
};

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n1 = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1));

export function sugerirProducto(ficha: FichaProducto | null, candidato: Candidato | null): Sugerencia {
  if (!ficha) {
    return { accion: "sin-datos", titulo: "Sin ingeniería de menú", caja: null, porque: ["No está en la carta de Fonavi y Centro de los últimos meses."], ideas: [], ojo: null };
  }
  if (ficha.situacion === "prueba" && ficha.prueba) {
    return {
      accion: "esperar", titulo: "Esperar: es nuevo", caja: null,
      porque: [`Está en su período de prueba (los primeros meses no se juzgan).`],
      ideas: ["Que el equipo lo ofrezca y lo muestre", "Volver a mirarlo cuando cumpla 3 meses"], ojo: null,
    };
  }
  if (ficha.situacion === "sin-costo") {
    return {
      accion: "sin-costo", titulo: "Falta su costo", caja: null,
      porque: [`Vende ${n1(ficha.unidadesSemana)} por semana, pero no tiene costo cargado: no se sabe cuánto deja.`],
      ideas: ["Cargar su receta y costo en el Excel de pricing (o vincularlo en Candidatos a reemplazo)"], ojo: null,
    };
  }
  if (!ficha.punto) {
    return { accion: "sin-datos", titulo: "Sin ingeniería de menú", caja: null, porque: [ficha.motivoFuera ?? "No tiene ventas en los meses analizados."], ideas: [], ojo: null };
  }

  const p = ficha.punto;
  const c = ficha.cortes;
  const pu = ficha.puestos;
  const porque = [
    `Vende ${n1(p.unidadesSemana)} por semana: ${p.unidadesSemana >= c.unidadesSemana ? "más" : "menos"} que la mediana de la carta (${n1(c.unidadesSemana)}).`,
    `Deja ${soles(p.margenUnidad)} por venta${p.margenPct !== null ? ` (${Math.round(p.margenPct)}% del precio)` : ""}: ${p.margenUnidad >= c.margenUnidad ? "más" : "menos"} que la mediana (${soles(c.margenUnidad)}).`,
  ];
  if (pu) porque.push(`Deja ${soles(p.gananciaMes)} al mes: el ${pu.pctGanancia}% de la ganancia de la carta, n.º ${pu.ganancia.n} de ${pu.ganancia.de}.`);

  // El mismo nombre de caja que la matriz de Grupo → Productos (un solo vocabulario).
  const caja = CUADRANTES[p.cuadrante].nombre;
  const tendencia = p.tendencia;
  const cae = tendencia.clase === "cayendo";
  const sube = tendencia.clase === "subiendo";
  const cambio = tendencia.cambioPct !== null ? `${tendencia.cambioPct > 0 ? "+" : ""}${Math.round(tendencia.cambioPct)}%` : "";

  // El modelo de candidatos (3 meses, las dos sedes, lo que cuesta mantenerlo) manda cuando dice sacar o preparar.
  if (candidato && (candidato.veredicto === "sacar" || candidato.veredicto === "preparar")) {
    const ref = candidato.referencia ? `El que mejor le va en su familia: ${candidato.referencia.nombre}.` : null;
    return {
      accion: candidato.veredicto, titulo: candidato.veredicto === "sacar" ? "Sacar de la carta" : "Preparar su reemplazo", caja,
      porque: [...porque, candidato.razon.split(";")[0].trim() + "."],
      ideas: candidato.veredicto === "sacar"
        ? ["Sacarlo de la carta y de Byte", "Terminar lo que queda de insumos exclusivos antes", ...(ref ? [ref] : [])]
        : ["Pensar con qué reemplazarlo antes de sacarlo", "Darle un último empujón en la sede donde aún se vende", ...(ref ? [ref] : [])],
      ojo: null,
    };
  }
  if (candidato && candidato.veredicto === "revisar" && candidato.sedeRevisar) {
    return {
      accion: "revisar", titulo: `Revisar en ${candidato.sedeRevisar}`, caja, porque: [...porque, candidato.razon.split(";")[0].trim() + "."],
      ideas: ["Va bien en una sede y mal en la otra: ver vitrina, precio y cómo se ofrece en la sede floja"], ojo: null,
    };
  }

  switch (p.cuadrante) {
    case "estrella":
      return {
        accion: "potenciar", titulo: "Potenciar", caja, porque,
        ideas: ["Que nunca falte (producción y vitrina)", "Ponerlo a la vista y que el equipo lo recomiende", "No bajarle el precio; si sube el costo, se puede subir con cuidado"],
        ojo: cae ? `Viene cayendo (${cambio}): averiguar qué cambió antes de que deje de ser estrella.` : null,
      };
    case "vaca":
      return {
        accion: "mantener", titulo: "Mantener y mejorar su margen", caja, porque,
        ideas: ["Revisar el precio: se vende igual, un alza chica suma", "Revisar la porción y el costo de la receta", "Ofrecerlo junto con algo que deje más (bebida, postre)"],
        ojo: cae ? `Viene cayendo (${cambio}): ojo antes de subirle el precio.` : null,
      };
    case "interrogante":
      return {
        accion: "promocionar", titulo: "Promocionar", caja, porque,
        ideas: ["Que el equipo lo ofrezca en cada mesa", "Mejor lugar en la carta o en la vitrina, con foto", "Combo o degustación para que lo prueben"],
        ojo: cae ? `Viene cayendo (${cambio}): si no reacciona en un mes, pensar en reemplazarlo.` : sube ? `Viene subiendo (${cambio}): la promoción puede convertirlo en estrella.` : null,
      };
    case "perro":
    default:
      return {
        accion: "sacar", titulo: "Sacar o reemplazar", caja, porque,
        ideas: ["Sacarlo de la carta o cambiarlo por algo que deje más", "Si tiene un motivo para quedarse (lo piden clientes fieles, acompaña a otro), dejarlo con precio revisado"],
        ojo: sube ? `Viene subiendo (${cambio}): se le puede dar un mes más antes de decidir.`
          // Al borde de la mediana en ventas o en margen: un perro «por poco» no se saca a la primera.
          : p.unidadesSemana >= c.unidadesSemana * 0.9 || p.margenUnidad >= c.margenUnidad * 0.9 ? "Está muy cerca de la mediana de la carta: decidir con un mes más de datos." : null,
      };
  }
}
