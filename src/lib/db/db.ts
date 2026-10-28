import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AsyncLocalStorage } from "node:async_hooks";

// Database access layer: the real Prisma client over a direct PostgreSQL connection (DATABASE_URL).
//
// The rest of the app calls `db.<model>.<method>(...)` Prisma-style. This module keeps the small behavioural
// contract those callers were written against, on top of Prisma:
//   - `findUnique` accepts any filter (it behaves like `findFirst`), and update/delete accept any filter that
//     matches a single row.
//   - String `contains` / `startsWith` / `endsWith` filters are case-insensitive.
//   - Values are coerced to the column type (numeric strings, ISO/date-only strings for DateTime fields).
//   - Decimal / BigInt results are returned as plain numbers; aggregate `_sum` / `_avg` of no rows is 0.
//   - `$transaction(callback)` is a real, atomic database transaction. Transactions are ambient: any `db` call made while a
//     transaction callback is running (including inside helper functions that use the global `db`) joins that transaction,
//     and a nested `$transaction` reuses the outer one.

type AnyClient = PrismaClient | Prisma.TransactionClient;

// The transaction (if any) that the current async call chain is running in.
const activeTx = new AsyncLocalStorage<Prisma.TransactionClient>();

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function getPrisma(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Database configuration missing: DATABASE_URL must be set.");
    }
    globalForPrisma.__prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return globalForPrisma.__prisma;
}

// ---------------------------------------------------------------------------
// Field metadata (from the generated Prisma data model)
// ---------------------------------------------------------------------------

const modelFields = new Map<string, Map<string, string>>();
for (const model of Prisma.dmmf.datamodel.models) {
  const fields = new Map<string, string>();
  for (const f of model.fields) {
    if (f.kind === "scalar") fields.set(f.name, f.type);
  }
  modelFields.set(model.name.charAt(0).toLowerCase() + model.name.slice(1), fields);
}

// ---------------------------------------------------------------------------
// Input coercion
// ---------------------------------------------------------------------------

const NUMERIC_TYPES = new Set(["Int", "BigInt", "Float", "Decimal"]);
const STRING_OPS = new Set(["contains", "startsWith", "endsWith"]);

function coerceScalar(type: string | undefined, value: unknown): unknown {
  if (typeof value !== "string" || !type) return value;
  if (type === "DateTime") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  if (NUMERIC_TYPES.has(type)) {
    const trimmed = value.trim();
    return trimmed !== "" && !isNaN(Number(trimmed)) ? Number(trimmed) : value;
  }
  if (type === "Boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !Prisma.Decimal.isDecimal(v);
}

function coerceFilterValue(type: string | undefined, value: unknown): unknown {
  if (!isPlainObject(value)) return coerceScalar(type, value);
  const out: Record<string, unknown> = {};
  for (const [op, v] of Object.entries(value)) {
    if (op === "in" || op === "notIn") {
      out[op] = Array.isArray(v) ? v.map((x) => coerceScalar(type, x)) : v;
    } else if (op === "not") {
      out[op] = coerceFilterValue(type, v);
    } else if (STRING_OPS.has(op)) {
      out[op] = v;
    } else {
      out[op] = coerceScalar(type, v);
    }
  }
  if (type === "String" && Object.keys(out).some((k) => STRING_OPS.has(k)) && out.mode === undefined) {
    out.mode = "insensitive";
  }
  return out;
}

function coerceWhere(model: string, where: any): any {
  if (!where || typeof where !== "object") return where;
  const fields = modelFields.get(model);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    out[key] = coerceFilterValue(fields?.get(key), value);
  }
  return out;
}

function coerceData(model: string, data: any): any {
  if (!data || typeof data !== "object") return data;
  const fields = modelFields.get(model);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = isPlainObject(value) ? value : coerceScalar(fields?.get(key), value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Output normalisation
// ---------------------------------------------------------------------------

function normalize(value: any): any {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Model delegate wrapper
// ---------------------------------------------------------------------------

function delegateFor(client: AnyClient, model: string): any {
  const delegate = (client as any)[model];
  if (!delegate) throw new Error(`Unknown database model "${model}".`);
  return delegate;
}

// Update/delete need a unique filter in Prisma; callers may pass any filter that identifies one row.
async function withSingleRow(client: AnyClient, model: string, args: any, run: (a: any) => Promise<any>) {
  try {
    return await run(args);
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientValidationError)) throw e;
    const row = await delegateFor(client, model).findFirst({ where: args.where, select: { id: true } });
    if (!row) throw new Error(`No ${model} record matches the given filter.`);
    return run({ ...args, where: { id: row.id } });
  }
}

function modelApi(getClient: () => AnyClient, model: string) {
  const d = () => delegateFor(getClient(), model);
  return {
    findMany: async (args: any = {}) => normalize(await d().findMany({ ...args, where: coerceWhere(model, args.where) })),
    findFirst: async (args: any = {}) => normalize(await d().findFirst({ ...args, where: coerceWhere(model, args.where) })),
    findUnique: async (args: any = {}) => normalize(await d().findFirst({ ...args, where: coerceWhere(model, args.where) })),
    create: async (args: any = {}) => normalize(await d().create({ ...args, data: coerceData(model, args.data) })),
    update: async (args: any = {}) =>
      normalize(
        await withSingleRow(getClient(), model, { ...args, where: coerceWhere(model, args.where), data: coerceData(model, args.data) }, (a) =>
          d().update(a)
        )
      ),
    delete: async (args: any = {}) =>
      normalize(await withSingleRow(getClient(), model, { ...args, where: coerceWhere(model, args.where) }, (a) => d().delete(a))),
    deleteMany: async (args: any = {}) => d().deleteMany({ ...args, where: coerceWhere(model, args.where) }),
    updateMany: async (args: any = {}) =>
      d().updateMany({ ...args, where: coerceWhere(model, args.where), data: coerceData(model, args.data) }),
    count: async (args: any = {}) => d().count({ ...args, where: coerceWhere(model, args.where) }),
    aggregate: async (args: any = {}) => {
      const result = normalize(await d().aggregate({ ...args, where: coerceWhere(model, args.where) }));
      for (const op of ["_sum", "_avg"]) {
        if (result?.[op]) {
          for (const k of Object.keys(result[op])) if (result[op][k] === null) result[op][k] = 0;
        }
      }
      return result;
    },
  };
}

function wrapClient(getClient: () => AnyClient, isRoot: boolean): any {
  const cache = new Map<string, unknown>();
  return new Proxy(
    {},
    {
      get: (_t, prop: string | symbol) => {
        if (typeof prop === "symbol") return undefined;
        if (prop === "$transaction" && isRoot) {
          return async (callback: (tx: any) => Promise<any>) => {
            if (typeof callback !== "function") {
              throw new Error("db.$transaction only supports the interactive (callback) form.");
            }
            const outer = activeTx.getStore();
            if (outer) return callback(wrapClient(() => outer, false)); // already in a transaction: join it
            return getPrisma().$transaction(
              async (tx) => activeTx.run(tx, () => callback(wrapClient(() => tx, false))),
              { maxWait: 10_000, timeout: 30_000 }
            );
          };
        }
        if (prop.startsWith("$")) {
          const client = getClient();
          const fn = (client as any)[prop];
          return typeof fn === "function" ? fn.bind(client) : fn;
        }
        if (!cache.has(prop)) cache.set(prop, modelApi(getClient, prop));
        return cache.get(prop);
      },
    }
  );
}

// The Prisma client is created on first use, so importing this module (e.g. during `next build`) needs no database.
let rootProxy: any;
export const db: any = new Proxy(
  {},
  {
    get: (_t, prop: string | symbol) => {
      if (!rootProxy) rootProxy = wrapClient(() => activeTx.getStore() ?? getPrisma(), true);
      return rootProxy[prop as string];
    },
  }
);

export default db;
