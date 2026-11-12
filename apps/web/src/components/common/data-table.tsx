"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiGet, useList, type Query } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingRows } from "./states";
import { NativeSelect } from "@/components/common/form-fields";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface RowAction<T> {
  label: string;
  onSelect: (row: T) => void;
  hidden?: (row: T) => boolean;
  destructive?: boolean;
}

/** Column meta: sortKey enables server sort; exportValue/exportHeader control Excel export. */
export type DataColumn<T> = ColumnDef<T, unknown> & {
  meta?: { sortKey?: string; exportValue?: (row: T) => unknown; exportHeader?: string; align?: "right" | "center"; className?: string };
};

interface DataTableProps<T> {
  endpoint: string;
  columns: DataColumn<T>[];
  /** fixed query params (e.g. type=CUSTOMER) */
  params?: Query;
  filters?: FilterDef[];
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowActions?: RowAction<T>[];
  exportName?: string;
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
  defaultSort?: { sort: string; dir: "asc" | "desc" };
  /** localStorage key for hidden columns */
  storageKey?: string;
  pageSize?: number;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Every list page: search, filters, column chooser, Excel export, server-side paging and sort,
 * sticky header, row actions, and empty/loading/error states.
 */
export function DataTable<T extends { id: string }>(props: DataTableProps<T>) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(props.pageSize ?? 25);
  const [sort, setSort] = useState(props.defaultSort);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const storageKey = `gc.cols.${props.storageKey ?? props.endpoint}`;
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const dq = useDebounced(q);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setVisibility(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  useEffect(() => setPage(1), [dq, filterValues]);

  const query: Query = { ...props.params, ...filterValues, q: dq, page, pageSize, sort: sort?.sort, dir: sort?.dir };
  const list = useList<T>(props.endpoint, query);

  const columns = useMemo(() => {
    if (!props.rowActions?.length) return props.columns;
    const actionsCol: DataColumn<T> = {
      id: "_actions",
      header: "",
      enableHiding: false,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Row actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {props.rowActions!.filter((a) => !a.hidden?.(row.original)).map((a) => (
                <DropdownMenuItem key={a.label} onSelect={() => a.onSelect(row.original)} className={a.destructive ? "text-destructive" : undefined}>
                  {a.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    };
    return [...props.columns, actionsCol];
  }, [props.columns, props.rowActions]);

  const table = useReactTable({
    data: list.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (updater) => {
      setVisibility((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    getRowId: (r) => r.id,
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const doExport = async () => {
    try {
      const all = await apiGet<{ items: T[] }>(props.endpoint, { ...query, page: 1, pageSize: 10000 });
      const cols = props.columns.filter((c) => c.id !== "_actions" && (c.meta?.exportValue || "accessorKey" in c));
      await exportToExcel(
        props.exportName ?? props.endpoint.replace(/\W+/g, "-"),
        cols.map((c, i) => ({ header: c.meta?.exportHeader ?? (typeof c.header === "string" ? c.header : String(c.id ?? i)), key: `c${i}` })),
        all.items.map((row) =>
          Object.fromEntries(
            cols.map((c, i) => {
              const v = c.meta?.exportValue ? c.meta.exportValue(row) : (row as Record<string, unknown>)[(c as { accessorKey: string }).accessorKey];
              return [`c${i}`, v as never];
            }),
          ),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const onRow = (row: T) => {
    if (props.onRowClick) props.onRowClick(row);
    else if (props.rowHref) router.push(props.rowHref(row));
  };

  return (
    <div className="rounded-xl bg-card shadow-card">
      <div className="flex flex-col gap-2 border-b border-border p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={props.searchPlaceholder ?? "Search…"} className="h-9 pl-8" aria-label="Search" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.filters?.map((f) => (
            <NativeSelect wrapperClassName="w-auto"
              key={f.key}
              aria-label={f.label}
              value={filterValues[f.key] ?? ""}
              onChange={(e) => setFilterValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="h-9 rounded-md bg-fill px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="h-9" aria-label="Choose columns">
                <Columns3 className="size-4" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" size="sm" className="h-9" onClick={doExport} aria-label="Export to Excel">
            <Download className="size-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          {props.toolbar}
        </div>
      </div>

      {list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="px-3">
          <LoadingRows />
        </div>
      ) : total === 0 ? (
        <EmptyState title={props.emptyTitle ?? (dq ? "No matches" : "Nothing here yet")} description={dq ? `Nothing matches "${dq}".` : undefined} action={!dq ? props.emptyAction : undefined} />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-[13.5px]">
            <thead className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border">
                  {hg.headers.map((h) => {
                    const meta = (h.column.columnDef as DataColumn<T>).meta;
                    const sortKey = meta?.sortKey;
                    const active = sortKey && sort?.sort === sortKey;
                    return (
                      <th
                        key={h.id}
                        className={cn(
                          "h-9 px-3 text-left text-[12px] font-medium whitespace-nowrap text-muted-foreground",
                          meta?.align === "right" && "text-right",
                          sortKey && "cursor-pointer select-none hover:text-foreground",
                        )}
                        onClick={() => sortKey && setSort((s) => ({ sort: sortKey, dir: s?.sort === sortKey && s.dir === "asc" ? "desc" : "asc" }))}
                      >
                        <span className="inline-flex items-center gap-1">
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                          {active && (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const href = props.rowHref?.(row.original);
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRow(row.original)}
                    className={cn("border-b border-border/60 last:border-0", (href || props.onRowClick) && "cursor-pointer hover:bg-fill/60", list.isFetching && "opacity-70")}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = (cell.column.columnDef as DataColumn<T>).meta;
                      return (
                        <td key={cell.id} className={cn("h-10 px-3 py-1.5 align-middle", meta?.align === "right" && "text-right tabular", meta?.className)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {props.rowHref && <span className="sr-only"><Link href="#">rows are links</Link></span>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[12.5px] text-muted-foreground">
        <span className="tabular">
          {total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0 records"}
        </span>
        <div className="flex items-center gap-1">
          <NativeSelect wrapperClassName="w-auto" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-7 rounded bg-fill px-1 text-[12px]" aria-label="Rows per page">
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </NativeSelect>
          <Button variant="ghost" size="icon" className="size-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tabular">
            {page} / {pages}
          </span>
          <Button variant="ghost" size="icon" className="size-7" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
