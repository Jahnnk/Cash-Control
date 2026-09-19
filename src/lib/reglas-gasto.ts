/**
 * La lista única de categorías de gasto y las reglas que las reconocen.
 *
 * ─── De dónde sale ───
 *
 * Jahnn (19-sep-2026): "el principal punto débil de los Excel de Kelly es la
 * inconsistencia de las categorías de egresos… este desorden hace que el
 * punto de equilibrio no se calcule correctamente". En los Excels de marzo a
 * setiembre 2026 había 63 textos distintos en la columna Grupo para unas 20
 * categorías reales (PRESTAMO / PRESTAMOS / PRESTAMO DINERS / DEUDA…), grupos
 * que eran bolsones (FONDOS MUTUOS con azúcar y bases para torta) y dos
 * clasificaciones que se contradecían (la del Excel y la del sistema).
 *
 * Decisiones de Jahnn (19-sep-2026):
 *   · UNA lista, la misma en el Excel de Kelly y en el sistema (esta).
 *   · Préstamos y tarjetas van aparte (Financiamiento): el punto de
 *     equilibrio operativo no los incluye, y se muestra una segunda cifra
 *     "incluyendo deudas".
 *   · En el Excel la categoría se pone SOLA a partir del concepto (y el
 *     proveedor); Kelly solo corrige cuando no está de acuerdo.
 *
 * ─── Cómo deciden las reglas ───
 *
 * Igual que la fórmula del Excel (LOOKUP sobre la pestaña REGLAS): se busca
 * cada palabra clave dentro de " CONCEPTO PROVEEDOR " (en MAYÚSCULAS y sin
 * tildes) y, si varias coinciden, MANDA LA ÚLTIMA de la lista. Por eso la
 * lista va de lo general a lo específico: primero los proveedores ("METRO"
 * suele ser insumos), después las palabras del producto ("DETERGENTE" es
 * limpieza), y al final las excepciones ("BOLSA DE HIELO" es insumo aunque
 * diga BOLSA; "MANTENIMIENTO CTA" es del banco aunque diga MANTENIMIENTO).
 * Las palabras cortas llevan espacios alrededor (" IR ") para no encontrarse
 * dentro de otras ("GIRO").
 *
 * Si ninguna regla coincide, el gasto queda POR ACLARAR: no entra al punto de
 * equilibrio hasta que alguien diga qué es. Adivinar es peor que preguntar.
 */

export type TipoCategoria = "Fijo" | "Variable" | "Financiamiento" | "Inversión" | "No es gasto";

export type CategoriaGasto = {
  nombre: string;
  tipo: TipoCategoria;
  /** Qué va aquí, en una línea (se muestra en la pestaña CATÁLOGO). */
  descripcion: string;
  ejemplos: string;
};

export const POR_ACLARAR = "POR ACLARAR";

export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  // ─── FIJOS: se pagan igual vendas más o menos ───
  { nombre: "PLANILLA", tipo: "Fijo", descripcion: "Todo lo que se paga al equipo por su trabajo", ejemplos: "Sueldos, nómina, AFP, SIS, EsSalud, liquidaciones, bonos, débito del día 22 (sueldos de Jahnn y Juani)" },
  { nombre: "ALQUILER", tipo: "Fijo", descripcion: "Renta del local", ejemplos: "Alquiler del mes, % de alquiler compartido" },
  { nombre: "SERVICIOS", tipo: "Fijo", descripcion: "Servicios básicos del local", ejemplos: "Luz, agua, gas (balón), internet, teléfono, recarga de celular" },
  { nombre: "CONTABILIDAD Y ASESORÍAS", tipo: "Fijo", descripcion: "Profesionales externos", ejemplos: "Contador, declaraciones, consultorías, asesorías" },
  { nombre: "MARKETING", tipo: "Fijo", descripcion: "Todo lo que sirve para vender más", ejemplos: "Publicidad, videos, diseño, cartas y menús, auspicios, página web, decoración y ambientación (plantas, flores)" },
  { nombre: "MANTENIMIENTO", tipo: "Fijo", descripcion: "Mantener y reparar el local y los equipos", ejemplos: "Arreglos, gasfitería, electricidad, llaves, herramientas, extintores, repuestos" },
  { nombre: "LIMPIEZA", tipo: "Fijo", descripcion: "Productos y utensilios de limpieza", ejemplos: "Detergente, lejía, escobas, papel toalla, guantes, tachos, ambientadores" },
  { nombre: "OFICINA Y SISTEMAS", tipo: "Fijo", descripcion: "Administración y software", ejemplos: "Útiles, copias, impresiones, papel contómetro, sellos, Claude, Dropbox, Canva" },
  { nombre: "PERSONAL", tipo: "Fijo", descripcion: "Bienestar del equipo (no sueldos)", ejemplos: "Uniformes, mandiles, almuerzos, capacitaciones, regalos, botiquín, convocatorias" },
  { nombre: "MENAJE Y UTENSILIOS", tipo: "Fijo", descripcion: "Lo que se usa y se repone en cocina y salón", ejemplos: "Vajilla, vasos de vidrio, cubiertos, tápers, moldes, ollas, tablas, domos" },
  { nombre: "CAJA CHICA", tipo: "Fijo", descripcion: "Reposición de caja chica cuando no se detalla qué se compró", ejemplos: "Reposición caja chica #12, exceso de caja chica" },
  // ─── VARIABLES: suben y bajan con la venta ───
  { nombre: "INSUMOS", tipo: "Variable", descripcion: "Lo que se transforma o se vende: comida y bebida", ejemplos: "Frutas, verduras, pollo, carnes, lácteos, huevos, harina, café, infusiones, hielo, agua para preparar" },
  { nombre: "PRODUCTOS ATELIER", tipo: "Variable", descripcion: "Lo que las cafeterías le compran a Atelier", ejemplos: "Facturas del 01-03 junio, tickets del 25-26 agosto (Productos Saludables Yayis)" },
  { nombre: "PACKAGING", tipo: "Variable", descripcion: "Empaques que salen con el producto", ejemplos: "Bolsas, cajas, stickers, etiquetas, papel manteca, sorbetes, vasos descartables" },
  { nombre: "DELIVERY Y FLETES", tipo: "Variable", descripcion: "Traer compras y llevar pedidos", ejemplos: "Delivery Metro, delivery Akemy, carretilla, flete, traslado" },
  { nombre: "IMPUESTOS", tipo: "Variable", descripcion: "Pagos a SUNAT: el IR mensual de la MYPE es un % de las ventas", ejemplos: "IR del mes, regularización de IR" },
  { nombre: "SS BANCARIOS", tipo: "Variable", descripcion: "Lo que cobra el banco", ejemplos: "ITF, mantenimiento de cuenta, comisiones, estado de cuenta, desgravamen" },
  // ─── FINANCIAMIENTO: cómo se paga el negocio, no cuánto cuesta operarlo ───
  { nombre: "PRÉSTAMOS Y TARJETAS", tipo: "Financiamiento", descripcion: "Cuotas de préstamos y tarjetas de crédito", ejemplos: "Cuota Diners, préstamo de Kelly, cuotas bancarias" },
  // ─── INVERSIÓN: dura años, no es gasto del mes ───
  { nombre: "EQUIPOS", tipo: "Inversión", descripcion: "Equipos que duran años", ejemplos: "Congeladora, balanza, licuadora, horno, extractor, ventilador, computadora" },
  { nombre: "REMODELACIÓN", tipo: "Inversión", descripcion: "Obras y mejoras del local", ejemplos: "Pintura, letreros, instalaciones eléctricas nuevas, mano de obra de obra" },
  // ─── NO ES GASTO del negocio ───
  { nombre: "UTILIDADES A SOCIOS", tipo: "No es gasto", descripcion: "Reparto y adelantos de utilidades", ejemplos: "Pago de utilidades Jahnn y Juani" },
  { nombre: "AHORRO", tipo: "No es gasto", descripcion: "Plata que se guarda", ejemplos: "Fondos mutuos" },
  { nombre: "PRÉSTAMOS ENTRE SEDES", tipo: "No es gasto", descripcion: "Plata que una sede le presta o le devuelve a otra", ejemplos: "Préstamo a Atelier, devolución de cuota a Fonavi o Centro" },
  { nombre: "DEVOLUCIONES", tipo: "No es gasto", descripcion: "Plata que no era de Yayi's", ejemplos: "Devoluciones a clientes, pagos por error, pagos dobles, propinas entregadas al equipo" },
  { nombre: POR_ACLARAR, tipo: "No es gasto", descripcion: "Nadie sabe todavía qué es: no entra al punto de equilibrio hasta aclararlo", ejemplos: "Lo que ninguna regla reconoce" },
];

export type ReglaGasto = { clave: string; categoria: string };

const r = (categoria: string, ...claves: string[]): ReglaGasto[] => claves.map((clave) => ({ clave, categoria }));

/**
 * Las reglas, de lo general a lo específico (manda la ÚLTIMA que coincide).
 * Las claves van en MAYÚSCULAS y sin tildes.
 */
export const REGLAS_GASTO: ReglaGasto[] = [
  // ═══ 1 · PROVEEDORES (lo más general: dicen dónde se compró, no qué) ═══
  ...r("INSUMOS", " METRO ", "MAKRO", "PLAZA VEA", "TOTTUS", "MERCADO ", "ELENA CUEVA", "VICTOR ALIAGA", "DIEGO MENDOZA", "MARTHA VALENCIA",
    "NELIDA ROJAS", "DESPENSA PERUANA", "INFUSIONARTE", "EDGAR VARGAS", "EDGARD VARGAS", "MARCO FERNANDEZ", "ATILA VILLANUEVA",
    "ONDA ORGANICA", "KUSPIKUY", "KUSPICUY", "TRES PIOS", "TURPAUD", "TURPAO", "MANANTIAL", "CESAR MENDOZA", "MENDOZA MORENO",
    "BATRICORP", "FRUTADEN", "CHUNCHO", "KUTIVA", "INVERSIONES HYP", "DON QUESO", " KUSI ", " KUSY ", "MANJARES DEL IN", "ROSA TERAN",
    "CAFE PASADO", "LACTEOSCAJ", "LACTEOS CAJAMARCA", "SEBASTIAN ROJAS", "GLADIS SALAZAR", "PAMELA PENAFIEL", "ABUNDANCIA"),
  ...r("LIMPIEZA", "SODIMAC", "DOLLARCITY", "DOLLAR CITY", "DOLLARCIY", "EL CHINO"),
  ...r("PACKAGING", "AKEMY", "AKEMI", "PINATERIA", "CHINGUEL", "CHINGEL"),
  ...r("MENAJE Y UTENSILIOS", "VIRGEN DE LA PUERTA", "IMPORTACIONES PANDA", "HIPERASIA", "YCHICAWA", "CASA DIAS"),
  ...r("SERVICIOS", "HIDRANDINA", "SEDACAJ", "CAXAGAS", "CAXAMARCA GAS", "QUAVI", "QUIAVI", " CLARO ", "MOVISTAR", " ENTEL ", " BITEL ", " WOW ", "HERNAN CELI", "HERNAN CALI"),
  ...r("CONTABILIDAD Y ASESORÍAS", "EDUARDO ROBLES", "MANUEL ROBLES", "REST PRO", "RESTA PRO"),
  ...r("IMPUESTOS", "SUNAT"),
  ...r("DELIVERY Y FLETES", "JORMAR"),
  ...r("MANTENIMIENTO", "LUIS LINAN", "ROYAL SERVICES", "RIEGO TECNIFICADO"),
  ...r("OFICINA Y SISTEMAS", "LIBRERIA", "LA SOLUCION", "INV & NEG", "INVERSIONES & NEGOCIAC"),
  ...r("MARKETING", "KAREN RUJEL", "ANDY TERRONES", "SEBASTIAN TERRONES", "ANDY SEBASTIAN", "PATEPERRO"),
  ...r("PERSONAL", "MI FARMA", "INKAFARMA", "MEDILENY", "MEDILENU"),
  ...r("ALQUILER", "GINO PINASCO", "HUGO DIA"),
  ...r("EQUIPOS", "BALANZAS CENTER", "BALANZAS Y MAQUINARIA"),
  ...r("CAJA CHICA", "CAJA CHICA", "CAJA CHUCA", "CAJA CGICA", "REPOSICION CAJA"),
  // Atelier (Productos Saludables Yayis) vendiéndole a las cafeterías.
  ...r("PRODUCTOS ATELIER", "PRODUCTOS SALUDABLES"),

  // ═══ 2 · QUÉ SE COMPRÓ ═══
  ...r("INSUMOS", "INSUMO", "FRUTA", "VERDURA", "POLLO", "PECHUGA", "PECHGA", " PAVO ", "CARNE", "HAMBURGUESA", "HAMBURUESA", "HAMURGUESA", "JAMON",
    "JAMO ", "PANCETA", "QUESO", "LECHE", "LACTEO", "YOGUR", "MANTEQUILLA", "HUEVO", "HARINA", "AZUCAR", "PANELA", "MIEL", " CAFE ",
    "CAFE EN GRANO", "INFUSION", "INFUISON", "MATCHA", "CACAO", "CHOCOLATE", "FRESA", "ARANDANO", "PALTA", "LECHUGA", "TOMATE",
    "CEBOLLA", " PAPA ", "NARANJA", "LIMON", "MANJAR", "MAJAR BLANCO", "HUMITA", "HUMINTA", "KOMBUCHA", "HIELO", "ACEITE", "LEVADURA",
    "ALMENDRA", "FRUTOS SECOS", "SEMILLA", "VAINILLA", "MAICENA", "AGUAIMATO", "HIERBA BUENA", "MOSTAZA", "HELADO", "PAN ", "EMPANADA",
    "AGUA MINERAL", "BIDON", "BODONES", "AGUA SAN LUIS", "COMPRAS EN METRO", "COMPRAS METRO", "PISCO ", "ARROZ", "FIDEO", "CANELA", "COCO", "PLATANO", "MANGO", "PINA ", "MARACUYA"),
  ...r("PACKAGING", "PACKAGING", "PACKAGIN", "EMPAQUE", "BOLSA", "STICKER", "ETIQUETA", "PAPEL MANTECA", "SORBET", "CAJA PARA TORTA",
    "BASES PARA TORTA", "BASE PARA TORTA", "COMPRAS AKEMY", "PAPEL CON LOGO", "PAPEL A3", "DESCARTABLE", "SERVILLETA", "FECHADO", "TICKETS PARA FECHAS", "TAPAS "),
  ...r("DELIVERY Y FLETES", "DELIVERY", "DELIVEY", "DELYVERY", "DEVLIVERY", "DELIOVERY", "DELIVERS", "FLETE", "FELTE", "CARRETILLA", "TRASLADO",
    "MOVILIDAD", "TAXI", "MOTO PARA COMPRAS", "ENVIO "),
  ...r("LIMPIEZA", "LIMPIEZA", "LIMIPEZA", "DETERGENTE", "LEJIA", "JABON", "ESCOBA", "RECOGEDOR", "TRAPEADOR", "MOPA", "PAPEL TOALLA",
    "PAPEL HIGIENICO", "GUANTES", "MASCARILLA", "TACHO", "AMBIENTADOR", "DESINFECTANTE", "LAVAVAJILLA", "ESPONJA", "FELPUDO"),
  ...r("SERVICIOS", " LUZ ", "LUZ ", " AGUA ", " GAS ", "BALON", "INTERNET", "INETRNET", "TELEFONO", "CELULAR", "RECARGA", "POST PAGO"),
  ...r("PLANILLA", "SUELDO", "NOMINA", "PLANILLA", " AFP", " SIS ", "SIS:", "ESSALUD", "LIQUIDACION", "GRATIFICACION", " CTS ", " BONO ",
    "VACACIONES", "FALTANTE ", "TRABAJO EN ATELIER", "MANDO MEDIO", "PAGO ENERO", "PAGO FEBRERO", "PAGO MARZO", "PAGO ABRIL",
    "PAGO MAYO", "PAGO JUNIO", "PAGO JULIO", "PAGO AGOSTO", "PAGO SETIEMBRE", "PAGO SEPTIEMBRE", "PAGO OCTUBRE", "PAGO NOVIEMBRE", "PAGO DICIEMBRE"),
  ...r("ALQUILER", "ALQUILER"),
  ...r("CONTABILIDAD Y ASESORÍAS", "CONTABILIDAD", "CONTABLE", "CONTADOR", "DECLARACION", "CONSULTORIA", "ASESORIA", "NOTARIA", "LEGAL "),
  ...r("MARKETING", "PUBLICIDAD", "MARKETING", "MARKETINK", "VIDEO", "DISENO", "CARTAS", "NUEVA CARTA", " MENU", "AUSPICIO", "PAGINA WEB",
    " SPOT", "INFLUENCER", "FACEBOOK", "INSTAGRAM", "TIKTOK", "DECORACION", "CAMISETAS", "POLOS", "FOTOGRAF"),
  ...r("MANTENIMIENTO", "MANTENIMIENTO", "MANTENIMIETO", "MMTO", "MNTO", "REPARACION", "ARREGLO", "GASFITER", "ELECTRICISTA", "ELECTRICIDAD",
    "REVISION", "DIAGNOSTICO", "LLAVE", "HERRAMIENTA", "EXTINTOR", "FOCO", " LED", "ENCHUFE", "INTERRUPTOR", "EXTENSION", "PILAS",
    "REPUESTO", "CONEXION", "CUCHILLA", "CUCHILA", "GLOBO PARA BATIDORA", " DUCTO", "CANERIA", "BOMBA", "TANQUE", "DESMONTE"),
  ...r("OFICINA Y SISTEMAS", "UTILES", "OFICINA", "ESCRITORIO", "CONTOMETRO", "COPIAS", "IMPRESION", "SOBRES", "SELLO", "ARCHIVADOR",
    " GOMA", "TALONARIO", "SUSCRIPCION", "SOFTWARE", "CLAUDE", "DROPBOX", "CANVA", "LICENCIA", "ETIQUETADORA", "HUELLERO", "IA PARA"),
  ...r("PERSONAL", "UNIFORME", "MANDIL", "CAMISA", "ALMUERZO", "CAPACITACION", "CONVOCATORIA", "RECLUTAMIENTO", "REGALO", "DIA DE LA MADRE",
    "DIA DEL TRABAJO", "DIA DE LA MUJER", "LLAVERO", "LAVEROS", "SUBLIME", "BOTIQUIN", "MEDICAMENTO", "MEDICINA", "VENDITA", "CUMPLEANOS"),
  ...r("MENAJE Y UTENSILIOS", "VAJILLA", "VASOS", "TAPER", "MOLDE", " OLLA", "CACEROLA", "SARTEN", "CUCHILLO", "CUCHARA", "CHUCHARA", "CUCXHARA",
    "TENEDOR", "SALSERO", "PLATOS", "TABLA DE PICAR", "RAYADOR", "ESCURRIDOR", "DOMO", "PAJILLA", "UTENSILIO", "UTENCILIO", "MENAJE", "JARRA",
    " TAZA", "LAVAPLATOS"),
  ...r("IMPUESTOS", " IR ", "IMPUESTO", " RENTA", " IGV", "DETRACCION"),
  ...r("SS BANCARIOS", " ITF ", " ITS ", "COMISION", "ESTADO CTA", "ESTADO DE CUENTA", "ESTADO CUENTA", "ESTADO DE CTA", "EXTRACTO",
    "DESGRAVAMEN", "DESGRVAMEN", "OPER CAJ", "MANT TD"),
  ...r("PRÉSTAMOS Y TARJETAS", "PRESTAMO", "DINERS", "CUOTA", "TARJETA", "INTERES"),
  ...r("EQUIPOS", "CONGELADORA", "REFRIGERADORA", "CONSERVADORA", "BALANZA", "LICUADORA", "HORNO", "MICROONDAS", "BATIDORA", "EXTRACTOR",
    "CAFETERA", "VENTILADOR", "PANTALLA", "MOUSE", "TECLADO", "COMPUTADORA", "LAPTOP", "IMPRESORA", "SOPLETE", "FLAMEADOR", "SELLADORA",
    "DISPENSADOR", "ADAPTADOR", "CARGADOR", " EQUIPO"),
  ...r("REMODELACIÓN", "REMODELACION", "PINTURA", "LETRERO", "LETERO", "OBRA ", "INSTALACION", "TRIFASICO", "TRUFASICO", "MEDIDOR", "MANO DE OBRA",
    "CAJAS ELECTRICAS", "ALUMINIO PARA PARED", "DRYWALL", "LETRAS"),
  ...r("UTILIDADES A SOCIOS", "UTILIDADES", "UTILIDAD "),
  ...r("AHORRO", "AHORRO", "FONDOS MUTUOS", "FONDO MUTUO"),
  ...r("DEVOLUCIONES", "DEVOLUCION", "SOBRANTE", "PROPINA"),
  ...r("PRODUCTOS ATELIER", "FACTURAS DEL", "FACTURAS 0", "FACTURAS 1", "FACTURAS 2", "FACTURAS 3", "FACTUARS", "TICKETS DEL",
    "FACTURAS PENDIENTES", "PRODUCTOS PARA COCINA Y TIENDA", "VENTA INTERNA"),

  // ═══ 3 · EXCEPCIONES (frases que ganan a las palabras sueltas) ═══
  // "Delivery de pollo" es delivery, no pollo.
  ...r("DELIVERY Y FLETES", "DELIVERY", "DELIVEY", "DELYVERY", "DEVLIVERY", "DELIOVERY", "DELIEVRY", "FLETE", "FELTE", "CARRETILLA", "TRASLADO"),
  ...r("INSUMOS", "BOLSA DE HIELO", "AGUA MINERAL", "BIDON DE AGUA", "BIDONES DE AGUA", "BODONES DE AGUA", "BISDONES", "AGUA SAN LUIS", "AGUA MANANTIAL",
    "PAN DE ", "PANES"),
  ...r("LIMPIEZA", "BOLSA DE BASURA", "BOLSAS DE BASURA", "UTILES DE LIMPIE", "UTILES LIMPIEZA"),
  ...r("PACKAGING", "VASOS DESCARTABLES", "VASO DESCARTABLE", "PACKAGIN PARA DELIVERY", "PACKAGING PARA DELIVERY"),
  ...r("EQUIPOS", "1 BOMBA", "BOMBA DE AGUA"),
  ...r("MANTENIMIENTO", "GASFITER", "MMTO PREVENTIVO", "MNTO PREVENTIVO", "ARREGLO LICUADORA", "MANTENIMIENTO CAFETERA", "MMTO MAQUINA",
    "REVISION REFRIGERADORA", "DIAGNOSTICO CON", "MNTO CONGELADORA", "MANTENIMIETO CONGELADORA", "CAMBIO DE BOMBA", "ARREGLO BOMBA",
    "ARREGLO DE CELULAR", "CUCHILLA PARA LICUADORA", "CUCHILA LICUADORA", "CAMBIO INTERRUPTOR", "INSTALACION LUCES", "ISTALACION LUCES",
    "TRABAJOS DE", "TRABAJOS EN"),
  ...r("SS BANCARIOS", "MMTO CTA", "MNTO CTA", "MMNTO CTA", "MNTO CUENTA", "MANTENIMIENTO CTA", "COM MNTO", "COM MMTO", "COM MANTENIMIENTO",
    "ENVIO ESTADO", "ENVIO CTA", "PORTE EXTRACTO", "DESGRAVAMEN EXTRACTOR", "DESGRVAMEN EXTRACTOR", "DESGRAVAMEN LICUADORA"),
  ...r("OFICINA Y SISTEMAS", "SOBRES DE CARTA", "ARCHIVADOR PARA CONTADOR", "PAGO ANUAL DE CANVA", "PAGO ANUAL CANVA"),
  ...r("MARKETING", "IMPRESIONES CARTAS", "IMPRESIONES 50% CARTAS", "UTILES PARA CARTAS", "CARTA & AMBIENTADOR", "DISENO NUEVA CARTA",
    "DISENO CARTAS", "DISENO COMBO", "DISENO NUEVOS COMBOS", "MANICURE PARA SPOT", "ADAPTADOR MICRIFONO", "DECORACION FIESTA",
    "AUSPICIO", "ARREGLO FLORAL", "PLANTAS", "FLORERO", "PORTA RETRA", "PORTARRETRA", "FLORES –", "FLORES -"),
  ...r("IMPUESTOS", "1ER CUOTA IR", "CUOTA IR", "REGULARIZACION IR"),
  ...r("PLANILLA", "REGULARIZACION ESSALUD", "PRESTAMO VEHICULAR", "SALDO POR AFP", "BONO POR MANDO", "AFP LIQUIDACION", "HORAS EXTRAS"),
  ...r("PRÉSTAMOS Y TARJETAS", "1ERA CUOTA", "CUOTA CONGELADORA", "CUOTA SET", "CUOTA –"),
  ...r("PERSONAL", "PRESTAMO PARA UNIFORMES", "UNIFORMES DE COCINA", "ALMUERZO", "CAPACITACION A PERSONAL", "ASESORIA KERLY"),
  ...r("MENAJE Y UTENSILIOS", "MOLDES DE PAN", "TAPERS PARA", "ROLLOS ALUMINIO"),
  ...r("REMODELACIÓN", "INSTALACION TRIFASICO", "INSTALCION DE CAJAS", "MEDIDOR TRIFASICO", "PINTURA PARED", "LETRERO NUEVO", "LETERO INTERIOR",
    "LETRERO INTERIOR", "LETRERO DE HORARIOS"),
  ...r("PRÉSTAMOS ENTRE SEDES", "PRESTAMO A ATELIER", "PRESTAMO ATELIER", "PRESTAMO A FONAVI", "PRESTAMO A CENTRO",
    "1ER CUOTA PRESTAMO", "CUOTA PRESTAMO ATELIER", "DEVOLUCION DE PRESTAMO", "DEVOLUCION PRESTAMO"),
  ...r("CAJA CHICA", "EXCESO CAJA CHICA", "EXCESO GASTO CAJA CHICA", "GASTO EN EXCESO DE CAJA CHICA", "GASTO EN EXCESO CAJA CHICA",
    "GASTO EXCESO CAJA CHICA", "REPOSICION CAJA CHICA", "PRESTAMO CAJA CHICA", "FALTA RENDIR"),
  ...r("AHORRO", "AHORRO FONDOS MUTUOS", "DEPOSITO FM"),
  ...r("UTILIDADES A SOCIOS", "PAGO UTILIDADES", "ADELANTO DE UTILIDADES", "ADELANTO UTILIDADES"),
  // Plata que no era de Yayi's: gana a todo lo demás (un "pago mal
  // ejecutado de insumos" no es un insumo).
  ...r("DEVOLUCIONES", "MAL EJECUTADO", "MAL HECHO", "POR ERROR", "ERROR EN PAGO", "DELOCION", "PAGO DOBLE", "EXCESO DE PAGO", "PAGO EN EXCESO", "PAGO DUPLICADO",
    "COBRO EN EXCESO", "MAL COBRO", "NO ES DE LA EMPRESA", "NO CORRESPONDE", "PROPINA", "SOBRANTE CAJA", "SALDO RESTANTE CAJA",
    "DEVOLUCION A CLIENT", "VENTA TRANSFERIDA", "ENTREGA A KELLY PARA DEPOSITO", "DEVOLUCION A EFECTIVO"),
];

/** El texto como lo compara el Excel: " CONCEPTO PROVEEDOR ", MAYÚSCULAS, sin tildes, espacios simples. */
export function textoParaReglas(concepto: string | null | undefined, proveedor?: string | null): string {
  const t = `${concepto ?? ""} ${proveedor ?? ""}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
  return ` ${t} `;
}

/** La categoría que proponen las reglas (manda la última que coincide), o POR ACLARAR. */
export function clasificarGasto(concepto: string | null | undefined, proveedor?: string | null, reglas: ReglaGasto[] = REGLAS_GASTO): string {
  const texto = textoParaReglas(concepto, proveedor);
  let elegida: string | null = null;
  for (const regla of reglas) if (texto.includes(regla.clave)) elegida = regla.categoria;
  return elegida ?? POR_ACLARAR;
}

const PORNOMBRE = new Map(CATEGORIAS_GASTO.map((c) => [c.nombre, c]));

export function tipoDeCategoria(nombre: string): TipoCategoria | null {
  return PORNOMBRE.get(nombre)?.tipo ?? null;
}
