import db from "@/lib/db/db";

/**
 * Runs fn inside a transaction holding a Postgres advisory lock for `key`, so concurrent callers with the same key
 * run one after another (check-then-write races become safe). Lock is released when the transaction ends.
 */
export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return db.$transaction(async () => {
    await (db as any).$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", key);
    return fn();
  });
}
