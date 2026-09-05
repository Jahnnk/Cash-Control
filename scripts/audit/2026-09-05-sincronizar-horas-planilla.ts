/**
 * Trae a Cash Control las horas de contrato que viven en PLANILLA.
 *
 * Desde set-2026 el bono de upselling se paga por horas de contrato y no
 * por etiqueta de jornada (decisión de Jahnn, 5-sep-2026). Ese dato ya
 * existe en el sistema de Planilla —`trabajadores.horas_semanales`, la
 * columna de Kelly— y ahí se queda: este script solo trae una COPIA.
 *
 * Por qué copia y no un formulario nuevo: pedirle al administrador que
 * escriba las horas otra vez crearía dos fuentes de verdad para el mismo
 * dato. Es el mismo error que produjo los saldos duplicados y las
 * categorías repetidas. El original vive en Planilla; acá solo se
 * refleja.
 *
 * Como son DOS BASES DE DATOS distintas, la copia puede quedar vieja
 * cuando alguien cambia de horario. Por eso el script no solo escribe:
 * REPORTA las diferencias, incluida la gente que está en un lado y no en
 * el otro. Correrlo antes de cada liquidación.
 *
 * El emparejamiento es por DNI, nunca por nombre: en Cash Control el
 * roster usa nombres cortos ("Teresa", "Raúl") y en Planilla el nombre
 * completo.
 *
 *   npx tsx scripts/audit/2026-09-05-sincronizar-horas-planilla.ts
 *   npx tsx scripts/audit/2026-09-05-sincronizar-horas-planilla.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

function urlDe(archivo: string, nombre: string): string {
  const u = fs.readFileSync(archivo, "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
  if (!u) throw new Error(`No encontré DATABASE_URL de ${nombre} en ${archivo}`);
  return u;
}

const cash = neon(urlDe(".env.local", "Cash Control"));
const planilla = neon(urlDe("../yayis-planilla/.env.local", "Planilla"));

/** Cash Control ↔ Planilla: qué sede es cuál. */
const SEDES: { bId: number; nombre: string; patron: RegExp }[] = [
  { bId: 1, nombre: "Atelier", patron: /atelier/i },
  { bId: 2, nombre: "Fonavi", patron: /fonavi/i },
  { bId: 3, nombre: "Centro", patron: /centro/i },
];

async function main() {
  const empresas = (await planilla`SELECT id, nombre FROM empresas`) as { id: string; nombre: string }[];

  let cambios = 0;
  const huerfanos: string[] = [];

  for (const sede of SEDES) {
    const emp = empresas.find((e) => sede.patron.test(e.nombre));
    if (!emp) { console.log(`\n${sede.nombre}: no existe en Planilla — se salta.`); continue; }

    const enPlanilla = (await planilla`
      SELECT dni, nombre_completo AS nombre, horas_semanales::float AS horas
      FROM trabajadores WHERE empresa_id = ${emp.id} AND estado = 'activo'
    `) as { dni: string | null; nombre: string; horas: number | null }[];

    const enCash = (await cash`
      SELECT id::text, name, dni, jornada, horas_semanales::float AS horas
      FROM staff WHERE business_id = ${sede.bId} AND active = true ORDER BY name
    `) as { id: string; name: string; dni: string | null; jornada: string; horas: number | null }[];

    console.log(`\n${"═".repeat(62)}\n  ${sede.nombre}\n${"═".repeat(62)}`);
    console.log("  persona          DNI         jornada           antes → ahora");

    for (const p of enCash) {
      const match = p.dni ? enPlanilla.find((t) => t.dni === p.dni) : undefined;
      if (!match) {
        console.log(`  ${p.name.padEnd(16)} ${String(p.dni ?? "SIN DNI").padEnd(11)} ${p.jornada.padEnd(17)} ⚠ no está en Planilla`);
        huerfanos.push(`${sede.nombre}: ${p.name} (Cash Control) no aparece en Planilla`);
        continue;
      }
      const antes = p.horas;
      const ahora = match.horas;
      const cambia = ahora !== null && antes !== ahora;
      console.log(
        `  ${p.name.padEnd(16)} ${String(p.dni).padEnd(11)} ${p.jornada.padEnd(17)} ` +
          `${antes ?? "—"} → ${ahora ?? "—"}${cambia ? "   ← cambia" : ""}`,
      );
      if (cambia) {
        cambios++;
        if (APPLY) await cash`UPDATE staff SET horas_semanales = ${ahora} WHERE id = ${p.id}`;
      }
    }

    // Gente de Planilla que Cash Control no conoce: no cobraría bono.
    const dnisCash = new Set(enCash.map((p) => p.dni).filter(Boolean));
    for (const t of enPlanilla) {
      if (t.dni && !dnisCash.has(t.dni)) {
        console.log(`  ⚠ ${t.nombre} (DNI ${t.dni}, ${t.horas ?? "—"} h/sem) está en Planilla y NO en el roster de bonos`);
        huerfanos.push(`${sede.nombre}: ${t.nombre} está en Planilla y no cobraría bono`);
      }
    }
  }

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  ${cambios} hora(s) ${APPLY ? "actualizadas" : "por actualizar"}`);
  if (huerfanos.length) {
    console.log(`\n  ⚠ REVISAR — gente que no calza entre los dos sistemas (${huerfanos.length}):`);
    for (const h of huerfanos) console.log(`     · ${h}`);
    console.log(`\n  Esto NO se arregla solo: o falta el DNI en Cash Control, o alguien`);
    console.log(`  entró/salió y un sistema no se enteró. Revisar antes de liquidar.`);
  }
  if (!APPLY) console.log("\nSimulación. No se cambió nada.");
}

main().catch((e) => { console.error(e); process.exit(1); });
