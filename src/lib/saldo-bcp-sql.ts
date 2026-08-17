/**
 * Las consultas SQL del saldo BCP, en UN solo lugar.
 *
 * Por qué existe este archivo (incidente del 17-ago-2026):
 *
 * La cadena que recalcula `bank_balance_real` estaba COPIADA palabra por
 * palabra en dos archivos. En julio se le puso un candado a una de las
 * copias — la de `daily-records.ts` — y la otra, la de `record-edits.ts`,
 * se quedó sin él. El 5-ago alguien editó tres movimientos de Fonavi y
 * esa copia sin candado escribió saldos calculados arrancando de CERO:
 *
 *     28-jul:      0 + 802.44 −    54.79 =    747.65
 *     30-jul:      0 + 839.84 − 1,517.24 =   −677.40
 *     03-ago: −677.40 + 703.83 − 1,395.00 = −1,368.57
 *
 * Ese −1,368.57 quedó como "último saldo del banco" y el panel mostró
 * −S/455.61 cuando el banco real tenía S/15,594.02. Un saldo negativo en
 * una cuenta corriente es imposible: era basura calculada disfrazada de
 * lectura del banco.
 *
 * ─── La regla ───
 *
 * Una sede CON RESET (`system_start_date`) tiene saldo BCP virtual: parte
 * del saldo inicial del corte y le suma el flujo posterior. Ahí
 * `bank_balance_real` está reservado a LECTURAS REALES del banco y NADA
 * calculado puede escribirlo.
 *
 * ─── Y por qué el candado va DENTRO del SQL ───
 *
 * Antes el candado era un `if (!hasReset)` en el llamador. Eso funciona
 * hasta que aparece un llamador nuevo que no se entera — que es
 * exactamente lo que pasó. Metido en el `WHERE` de la propia consulta,
 * viaja con ella: da igual quién la invoque, ni desde cuántos sitios.
 */

/**
 * Las funciones reciben el `sql` de quien las llama.
 *
 * El repo usa DOS drivers: drizzle (`db.execute(sql\`…\`)`) en
 * daily-records.ts y el de neon (`sql.transaction([...])`) en
 * record-edits.ts. Los dos son plantillas etiquetadas con la misma
 * firma, así que pasando la etiqueta como parámetro el TEXTO de la
 * consulta queda escrito una sola vez y sirve para ambos. Era eso, o
 * volver a tener dos copias — que es justo lo que causó el incidente.
 */
export type EtiquetaSQL<T> = (s: TemplateStringsArray, ...v: unknown[]) => T;

/**
 * Recalcula la cadena de `bank_balance_real` desde `date` hacia adelante,
 * partiendo del último saldo anterior (o de 0 si no hay ninguno).
 *
 * OJO con ese 0: para una sede sin reset (Atelier antes de agosto, con
 * filas diarias densas y un saldo de arranque real) es correcto. Para una
 * sede con reset es justo lo que produjo la basura del incidente — de ahí
 * el candado.
 */
export function cadenaSaldoDesdeFecha<T>(sql: EtiquetaSQL<T>, bId: number, date: string): T {
  return sql`
    WITH RECURSIVE chain AS (
      SELECT
        (${date}::date - INTERVAL '1 day')::date AS date,
        COALESCE((
          SELECT bank_balance_real::numeric FROM daily_records
          WHERE business_id = ${bId} AND date < ${date} AND bank_balance_real IS NOT NULL AND archived = false
          ORDER BY date DESC LIMIT 1
        ), 0) AS calc_balance

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method NOT IN ('efectivo','pendiente_atelier','socio') AND (is_special_loan = false OR loan_via_bank = true) AND archived = false), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.business_id = ${bId} AND dr.date <= (SELECT MAX(date) FROM daily_records WHERE business_id = ${bId} AND archived = false) AND dr.archived = false
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.business_id = ${bId} AND dr.date = chain.date AND dr.date >= ${date}
      AND NOT EXISTS (
        SELECT 1 FROM businesses b WHERE b.id = ${bId} AND b.system_start_date IS NOT NULL
      )
  `;
}

/**
 * Propaga la cadena desde un ancla YA GUARDADA (`anchorDate`) hacia
 * adelante. Se usa después de que alguien entra el saldo real de un día:
 * los días siguientes se recalculan a partir de esa lectura.
 *
 * Lleva el mismo candado: en una sede con reset, propagar hacia adelante
 * escribiría valores CALCULADOS en días posteriores, y el siguiente que
 * lea el saldo los tomaría por lecturas reales del banco. Es la misma
 * trampa del incidente, por otra puerta.
 */
export function cadenaSaldoDesdeAncla<T>(sql: EtiquetaSQL<T>, bId: number, anchorDate: string): T {
  return sql`
    WITH RECURSIVE chain AS (
      SELECT date, bank_balance_real::numeric AS calc_balance
      FROM daily_records
      WHERE business_id = ${bId} AND date = ${anchorDate} AND bank_balance_real IS NOT NULL AND archived = false

      UNION ALL

      SELECT
        dr.date,
        ROUND((
          c.calc_balance
          + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id = ${bId} AND date = dr.date AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id = ${bId} AND date = dr.date AND payment_method NOT IN ('efectivo','pendiente_atelier','socio') AND (is_special_loan = false OR loan_via_bank = true) AND archived = false), 0)
        )::numeric, 2)
      FROM daily_records dr
      JOIN chain c ON dr.date = (c.date + INTERVAL '1 day')::date
      WHERE dr.business_id = ${bId} AND dr.date <= (SELECT MAX(date) FROM daily_records WHERE business_id = ${bId} AND archived = false) AND dr.archived = false
    )
    UPDATE daily_records dr
    SET bank_balance_real = chain.calc_balance
    FROM chain
    WHERE dr.business_id = ${bId} AND dr.date = chain.date AND dr.date > ${anchorDate}
      AND NOT EXISTS (
        SELECT 1 FROM businesses b WHERE b.id = ${bId} AND b.system_start_date IS NOT NULL
      )
  `;
}

/**
 * El ancla del saldo: la lectura real más reciente hasta `hasta`.
 *
 * En una sede con reset ignora todo lo ANTERIOR al corte. Un saldo de
 * julio en una sede que arranca el 01-ago no es un dato viejo: es de otra
 * vida del sistema, y tomarlo como punto de partida arrastra al presente
 * una historia que el corte justamente vino a cerrar. (Fonavi tenía dos:
 * 28-jul y 30-jul, este último en negativo.)
 */
export function anclaSaldoBcp<T>(sql: EtiquetaSQL<T>, bId: number, hasta: string): T {
  return sql`
    SELECT dr.bank_balance_real::float AS balance, dr.date::text AS date
    FROM daily_records dr
    JOIN businesses b ON b.id = dr.business_id
    WHERE dr.business_id = ${bId}
      AND dr.bank_balance_real IS NOT NULL
      AND dr.date <= ${hasta}
      AND dr.archived = false
      AND (b.system_start_date IS NULL OR dr.date >= b.system_start_date)
    ORDER BY dr.date DESC
    LIMIT 1
  `;
}
