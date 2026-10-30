"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { FieldShell, NativeSelect } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BatchSelect, GodownSelect, ProductPicker, QtyInput, QtyText, type ProductLite } from "@/components/inventory/pickers";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Item {
  id: string;
  qtyPcs: number;
  installedAt: string;
  product: ProductLite & { images: string[] };
  batch: { batchNo: string; shadeCode: string; caliber: string };
}
interface Board {
  id: string;
  code: string;
  name: string;
  location: string | null;
  godown: { id: string; name: string };
  items: Item[];
}

export default function DisplayBoardsPage() {
  const { can } = useSession();
  const q = useApi<{ items: Board[] }>("/display-boards", { pageSize: 200 });
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<Board | null>(null);
  const [removing, setRemoving] = useState<{ board: Board; item: Item } | null>(null);
  const write = can("sample.write");

  return (
    <>
      <PageHeader
        title="Display boards"
        description="Tiles fixed on showroom boards and bays. Fixing moves stock to DISPLAY; taking down returns it to a godown (or to damaged)."
        actions={write && <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New board</Button>}
      />
      {q.isLoading ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <Section><EmptyState title="No display boards yet" description="Add the showroom walls and bays, then fix tiles on them." /></Section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.items.map((b) => (
            <Section
              key={b.id}
              title={<span>{b.code} · {b.name}</span>}
              actions={write && <Button size="sm" variant="secondary" onClick={() => setAdding(b)}><Plus className="size-4" /> Tile</Button>}
            >
              <p className="-mt-2 mb-2 text-[12px] text-muted-foreground">{[b.location, b.godown.name].filter(Boolean).join(" · ")}</p>
              {b.items.length ? (
                <ul className="space-y-2">
                  {b.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-3">
                      {it.product.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.product.images[0]} alt="" className="size-11 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="size-11 shrink-0 rounded-md bg-fill" />
                      )}
                      <div className="min-w-0 flex-1 text-[13px]">
                        <div className="truncate font-medium">{it.product.name}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {it.product.sku} · shade {it.batch.shadeCode} · <QtyText pcs={it.qtyPcs} product={it.product} /> · since {formatDate(it.installedAt)}
                        </div>
                      </div>
                      {write && (
                        <Button variant="ghost" size="icon" className="size-7" aria-label="Take down" onClick={() => setRemoving({ board: b, item: it })}>
                          <X className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">No tiles on this board.</p>
              )}
            </Section>
          ))}
        </div>
      )}
      {creating && <NewBoardDialog onClose={() => setCreating(false)} />}
      {adding && <AddTileDialog board={adding} onClose={() => setAdding(null)} />}
      {removing && <RemoveDialog board={removing.board} item={removing.item} onClose={() => setRemoving(null)} />}
    </>
  );
}

function NewBoardDialog({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({ godownId: "", code: "", name: "", location: "" });
  const save = useApiMutation((body: unknown) => api("/display-boards", { method: "POST", body }), ["/display-boards"]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New display board</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldShell label="Showroom godown" required><GodownSelect value={v.godownId} onChange={(id) => setV({ ...v, godownId: id })} /></FieldShell>
          <FieldShell label="Code" required><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} placeholder="B1" /></FieldShell>
          <FieldShell label="Name" required><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Bathroom wall bay" /></FieldShell>
          <FieldShell label="Location"><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Ground floor, left" /></FieldShell>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate(v, { onSuccess: () => { toast.success("Board added"); onClose(); }, onError: (e: ApiError) => toast.error(e.message) })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTileDialog({ board, onClose }: { board: Board; onClose: () => void }) {
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [fromGodownId, setFrom] = useState("");
  const [batchId, setBatch] = useState<string | null>(null);
  const [qty, setQty] = useState(0);
  const add = useApiMutation((body: unknown) => api(`/display-boards/${board.id}/items`, { method: "POST", body }), ["/display-boards", "/stock"]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Fix a tile on {board.code}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <FieldShell label="Product" required><ProductPicker value={productId} onChange={(id, p) => { setProductId(id); setProduct(p); setBatch(null); }} /></FieldShell>
          <FieldShell label="Take from godown" required><GodownSelect value={fromGodownId} onChange={setFrom} /></FieldShell>
          <FieldShell label="Shade lot" required><BatchSelect productId={productId} godownId={fromGodownId || null} product={product} value={batchId} onChange={setBatch} /></FieldShell>
          <FieldShell label="Pieces" required><QtyInput product={product} value={qty} onChange={setQty} /></FieldShell>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={add.isPending}
            onClick={() =>
              add.mutate(
                { productId, batchId, fromGodownId, qtyPcs: qty },
                { onSuccess: () => { toast.success("Tile fixed on board"); onClose(); }, onError: (e: ApiError) => toast.error(e.message) },
              )
            }
          >
            Fix on board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ board, item, onClose }: { board: Board; item: Item; onClose: () => void }) {
  const [toGodownId, setTo] = useState("");
  const [toStockType, setType] = useState<"SALEABLE" | "DAMAGED">("SALEABLE");
  const rm = useApiMutation((body: unknown) => api(`/display-boards/${board.id}/items/${item.id}/remove`, { method: "POST", body }), ["/display-boards", "/stock"]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Take down {item.product.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <FieldShell label="Return to godown" required><GodownSelect value={toGodownId} onChange={setTo} /></FieldShell>
          <FieldShell label="Condition">
            <NativeSelect value={toStockType} onChange={(e) => setType(e.target.value as "SALEABLE" | "DAMAGED")}>
              <option value="SALEABLE">Good — back to saleable</option>
              <option value="DAMAGED">Damaged (chipped / stained)</option>
            </NativeSelect>
          </FieldShell>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={rm.isPending} onClick={() => rm.mutate({ toGodownId, toStockType }, { onSuccess: () => { toast.success("Taken down"); onClose(); }, onError: (e: ApiError) => toast.error(e.message) })}>Take down</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
