import type { ListQuery, Paged } from "@gc/shared";

type Delegate = {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
};

/** Case-insensitive OR search across fields. Supports nested paths like "brand.name". */
export function searchWhere(q: string | undefined, fields: string[]): Record<string, unknown> {
  if (!q) return {};
  return {
    OR: fields.map((f) => {
      const parts = f.split(".");
      let node: Record<string, unknown> = { contains: q, mode: "insensitive" };
      for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]]: node };
      return node;
    }),
  };
}

/** Server-side paging used by every list endpoint. */
export async function paginate<T = any>(
  delegate: Delegate,
  query: ListQuery,
  args: { where?: any; include?: any; select?: any; orderBy?: any; allowedSort?: string[] } = {},
): Promise<Paged<T>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  let orderBy = args.orderBy ?? { createdAt: "desc" };
  if (query.sort && (!args.allowedSort || args.allowedSort.includes(query.sort))) {
    const parts = query.sort.split(".");
    let node: any = query.dir ?? "asc";
    for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]]: node };
    orderBy = node;
  }
  const [items, total] = await Promise.all([
    delegate.findMany({
      where: args.where,
      include: args.include,
      select: args.select,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    delegate.count({ where: args.where }),
  ]);
  return { items, total, page, pageSize };
}

/** Pick simple equality filters from the query string (e.g. ?type=TILE&brandId=..). */
export function pickFilters(raw: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const key of allowed) {
    const v = raw[key];
    if (v === undefined || v === null || v === "") continue;
    if (v === "true" || v === "false") where[key] = v === "true";
    else where[key] = v;
  }
  return where;
}
