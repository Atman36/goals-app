import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Reuse the connection across hot reloads in dev to avoid exhausting the pool.
  const client = global.__dbClient ?? postgres(connectionString, { prepare: false });
  if (process.env.NODE_ENV !== "production") {
    global.__dbClient = client;
  }

  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;

let lazyDb: Db | undefined;

function getDb(): Db {
  if (!lazyDb) {
    lazyDb = createDb();
  }
  return lazyDb;
}

// Lazy-initialized: `next build` imports every route module for static
// analysis even when a route never actually queries the DB, so throwing at
// import time (the old behavior) broke `npm run build` in envs with no
// DATABASE_URL (T5 finding). The Proxy defers client creation — and the
// "DATABASE_URL is not set" error — until the first real property access,
// i.e. the first actual query. Methods are bound to the real db instance so
// internal `this` usage inside drizzle doesn't resolve to the Proxy.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
