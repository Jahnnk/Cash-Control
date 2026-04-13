import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Creating budgets table...");

  await sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_name TEXT NOT NULL UNIQUE,
      budget_percentage NUMERIC(5,2) DEFAULT 0,
      cost_type TEXT NOT NULL DEFAULT 'variable',
      has_traffic_light BOOLEAN NOT NULL DEFAULT true,
      threshold_green INTEGER NOT NULL DEFAULT 70,
      threshold_yellow INTEGER NOT NULL DEFAULT 90,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;
  console.log("Table created.");

  // Check if already seeded
  const existing = await sql`SELECT COUNT(*) as c FROM budgets`;
  if (Number(existing[0].c) > 0) {
    console.log("Budgets already seeded, skipping.");
    return;
  }

  console.log("Seeding budgets...");

  // Operativos (con semáforo)
  const operativos = [
    { name: "Insumos", pct: 33, type: "variable", desc: "Ingredientes, materia prima directa" },
    { name: "Planilla", pct: 30, type: "semi_fijo", desc: "Salarios, cargas sociales, beneficios" },
    { name: "Alquiler", pct: 10, type: "fijo", desc: "Local de producción" },
    { name: "Servicios", pct: 6, type: "semi_fijo", desc: "Luz, agua, gas" },
    { name: "Packaging", pct: 7, type: "variable", desc: "Bolsas, cajas, etiquetas, stickers" },
    { name: "Deliverys", pct: 3, type: "variable", desc: "Comisiones apps, entregas terceros" },
    { name: "Fletes", pct: 2, type: "variable", desc: "Envíos interprovinciales" },
    { name: "Mantenimientos", pct: 3, type: "semi_fijo", desc: "Reparaciones, repuestos, preventivo" },
    { name: "Limpieza", pct: 1.5, type: "variable", desc: "Lavavajillas, detergentes, toallas, desinfectantes" },
    { name: "Oficina", pct: 1, type: "variable", desc: "Papel, tinta, artículos de escritorio" },
    { name: "Marketing", pct: 3, type: "variable", desc: "Redes, publicidad, branding" },
    { name: "Ss Bancarios", pct: 2, type: "fijo", desc: "Comisiones bancarias, POS, transferencias" },
    { name: "Software / tecnología", pct: 1.5, type: "fijo", desc: "Byte POS, apps, suscripciones" },
    { name: "Otros", pct: 2, type: "variable", desc: "Contingencia, imprevistos" },
  ];

  for (const o of operativos) {
    await sql`
      INSERT INTO budgets (category_name, budget_percentage, cost_type, has_traffic_light, description)
      VALUES (${o.name}, ${o.pct}, ${o.type}, true, ${o.desc})
    `;
  }

  // Obligaciones (sin semáforo)
  const obligaciones = [
    { name: "SUNAT", type: "fijo", desc: "Impuestos según régimen tributario" },
    { name: "Préstamos", type: "fijo", desc: "Cuotas de deuda, servicio financiero" },
    { name: "Vueltos y Devoluciones", type: "variable", desc: "Ajustes de caja, devoluciones a clientes" },
  ];

  for (const o of obligaciones) {
    await sql`
      INSERT INTO budgets (category_name, budget_percentage, cost_type, has_traffic_light, description)
      VALUES (${o.name}, 0, ${o.type}, false, ${o.desc})
    `;
  }

  console.log(`Seeded ${operativos.length} operativos + ${obligaciones.length} obligaciones`);
}

migrate().catch(console.error);
