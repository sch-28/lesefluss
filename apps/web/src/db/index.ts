import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Module-level singleton - Node.js module caching ensures one pool per process
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pool or a transaction: what read helpers accept so they run inside a caller's transaction. */
export type DbExecutor = Db | Tx;
