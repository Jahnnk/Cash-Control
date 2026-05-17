import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    const sql = neon(process.env.DATABASE_URL);
    // Logger SOLO en development. En producción anula el overhead
    // de stringify de queries grandes. Para Vercel preview/prod
    // process.env.NODE_ENV es "production", así que el logger queda
    // apagado automáticamente.
    const isDev = process.env.NODE_ENV === "development";
    _db = drizzle(sql, { schema, logger: isDev });
  }
  return _db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});
