import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function seed() {
  console.log("Seeding initial clients...");

  // Check if clients already exist
  const existing = await sql`SELECT COUNT(*) as count FROM clients`;
  if (Number(existing[0].count) > 0) {
    console.log("Clients already exist, skipping seed.");
    return;
  }

  await sql`
    INSERT INTO clients (name, type, payment_pattern) VALUES
    ('Fonavi', 'familia', 'interdiario'),
    ('Centro', 'familia', 'interdiario'),
    ('Amalia', 'b2b', 'variable')
  `;

  console.log("Seeded 3 initial clients: Fonavi, Centro, Amalia");
}

seed().catch(console.error);
