"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { GST_RATES, productSchema, SQFT_PER_SQM, TILE_APPLICATIONS, UOM_TYPES, formatINR, labelOf, ratePerBoxToPerPiece, type ProductInput } from "@gc/shared";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/common/page-header";
import { FormGrid, MoneyField, NumberField, SelectField, SwitchField, TextField, TextareaField, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { Input } from "@/components/ui/input";
import { api, ApiError, uploadFile, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useDraft, useFormKeys, useUnsavedGuard } from "@/hooks/use-form-keys";
import { EntityField } from "./entity-field";

export interface ProductRow extends ProductInput {
  id: string;
  sqmPerBox: number | null;
  brand?: { id: string; name: string };
  category?: { id: string; name: string; type: string };
  size?: { id: string; name: string } | null;
  variants?: { id: string; skuSuffix: string; name: string | null; mrpPaise: number | null; color: { name: string } | null }[];
}

const EMPTY: ProductInput = {
  sku: "",
  name: "",
  brandId: "",
  categoryId: "",
  seriesId: null,
  sizeId: null,
  finishId: null,
  colorId: null,
  hsn: "6907",
  gstRate: 18,
  uomType: "PIECE_BOX_AREA",
  unitName: "pcs",
  pcsPerBox: null,
  sqftPerBox: null,
  sqmPerBox: null,
  weightPerBoxKg: null,
  mrpPaise: 0,
  allowLooseSale: false,
  reorderLevelPcs: 0,
  applications: [],
  leadTimeDays: null,
  safetyStockDays: 7,
  images: [],
  description: "",
  isActive: true,
};

function toForm(p: ProductRow): ProductInput {
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof ProductInput)[]) (out as Record<string, unknown>)[k] = (p as unknown as Record<string, unknown>)[k] ?? (EMPTY as Record<string, unknown>)[k];
  return out;
}

/** Product create/edit: tile box fields only for PIECE_BOX_AREA; images go to /api/files. */
export function ProductForm({ product }: { product?: ProductRow }) {
  const router = useRouter();
  const { can } = useSession();
  const canWrite = can("catalogue.write");
  const form = useForm<ProductInput>({ resolver: zodResolver(productSchema) as Resolver<ProductInput>, defaultValues: product ? toForm(product) : EMPTY });
  const values = useWatch({ control: form.control });
  const draft = useDraft<ProductInput>(product ? null : "product-new", values as ProductInput, !product);
  const [uploading, setUploading] = useState(false);
  useUnsavedGuard(form.formState.isDirty);

  useEffect(() => {
    if (product) return;
    const d = draft.load();
    if (d && d.name) {
      form.reset(d);
      toast.info("Restored your unsaved draft");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tile = values.uomType === "PIECE_BOX_AREA";
  const sqm = values.sqftPerBox ? (Number(values.sqftPerBox) / SQFT_PER_SQM).toFixed(4) : "";

  const save = useApiMutation(
    (v: ProductInput) => (product ? api<ProductRow>(`/products/${product.id}`, { method: "PATCH", body: v }) : api<ProductRow>("/products", { method: "POST", body: v })),
    ["/products"],
  );
  const submit = form.handleSubmit((v) =>
    save.mutate(v, {
      onSuccess: (row) => {
        toast.success("Product saved");
        draft.clear();
        form.reset(toForm(row as ProductRow));
        if (!product) router.replace(`/catalogue/products/${(row as ProductRow).id}`);
      },
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    }),
  );
  const ref = useFormKeys<HTMLFormElement>(() => submit());

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push((await uploadFile(f, "products")).url);
      form.setValue("images", [...(form.getValues("images") ?? []), ...urls], { shouldDirty: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canWrite} className="space-y-4">
        <Section title="Basic details">
          <FormGrid>
            <TextField control={form.control} name="sku" label="SKU" required autoFocus={!product} placeholder="TL-KJ-6012-CAL" />
            <TextField control={form.control} name="name" label="Name" required />
            <EntityField control={form.control} name="brandId" label="Brand" endpoint="/brands" getLabel={(b) => b.name} required buildNew={(t) => ({ name: t })} />
            <EntityField
              control={form.control}
              name="categoryId"
              label="Category"
              endpoint="/categories"
              getLabel={(c) => c.name}
              getDescription={(c) => labelOf(c.type)}
              required
              onPicked={(c) => {
                if (!c) return;
                const isTile = c.type === "TILE";
                form.setValue("uomType", isTile ? "PIECE_BOX_AREA" : "UNIT", { shouldDirty: true });
                form.setValue("hsn", isTile ? "6907" : c.type === "SANITARY" ? "6910" : c.type === "CP_FITTING" ? "8481" : c.type === "ADHESIVE" ? "3214" : form.getValues("hsn"), { shouldDirty: true });
                form.setValue("unitName", isTile ? "pcs" : "nos");
              }}
            />
            <EntityField control={form.control} name="seriesId" label="Series" endpoint="/series" params={values.brandId ? { brandId: values.brandId } : undefined} getLabel={(s) => s.name} buildNew={(t) => ({ name: t, brandId: values.brandId || null })} />
            <EntityField
              control={form.control}
              name="sizeId"
              label="Size"
              endpoint="/sizes"
              getLabel={(s) => s.name}
              invalidMessage="Type the size as length x width in mm, e.g. 600x1200"
              buildNew={(t) => {
                // "600x1200" or "600 x 1200 mm" → length/width in mm
                const m = t.match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:mm)?$/i);
                return m ? { name: t, lengthMm: Math.round(+m[1]), widthMm: Math.round(+m[2]) } : null;
              }}
            />
            <EntityField control={form.control} name="finishId" label="Finish" endpoint="/finishes" getLabel={(s) => s.name} buildNew={(t) => ({ name: t })} />
            <EntityField control={form.control} name="colorId" label="Colour" endpoint="/colors" getLabel={(s) => s.name} buildNew={(t) => ({ name: t })} />
          </FormGrid>
        </Section>

        <Section title="Units, tax and price">
          <FormGrid cols={4}>
            <SelectField control={form.control} name="uomType" label="Unit type" allowEmpty={false} options={UOM_TYPES.map((u) => ({ value: u, label: u === "PIECE_BOX_AREA" ? "Tile (pieces, box, sq ft)" : "Unit (nos / set)" }))} />
            {tile ? (
              <>
                <NumberField control={form.control} name="pcsPerBox" label="Pieces per box" integer required />
                <NumberField control={form.control} name="sqftPerBox" label="Sq ft per box" required suffix="sq ft" hint={sqm ? `= ${sqm} sq m per box` : undefined} />
                <NumberField control={form.control} name="weightPerBoxKg" label="Weight per box" suffix="kg" />
              </>
            ) : (
              <TextField control={form.control} name="unitName" label="Unit name" placeholder="nos / set / bag" />
            )}
            <TextField control={form.control} name="hsn" label="HSN code" required />
            <SelectField control={form.control} name="gstRate" label="GST rate" allowEmpty={false} options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))} />
            <MoneyField control={form.control} name="mrpPaise" label={tile ? "MRP per box" : "MRP per unit"} hint={tile && values.pcsPerBox && values.mrpPaise ? `${formatINR(ratePerBoxToPerPiece(Number(values.mrpPaise), Number(values.pcsPerBox)))} per piece` : undefined} />
            <NumberField control={form.control} name="reorderLevelPcs" label={tile ? "Low-stock alert at (pieces)" : "Low-stock alert at"} integer />
          </FormGrid>
          <FormGrid cols={4} className="mt-4">
            <NumberField control={form.control} name="leadTimeDays" label="Lead time" integer suffix="days" hint="Blank = brand's lead time" />
            <NumberField control={form.control} name="safetyStockDays" label="Safety stock" integer suffix="days" hint="Extra cover for the reorder planner" />
          </FormGrid>
          {tile && (
            <Controller
              control={form.control}
              name="applications"
              render={({ field }) => {
                const value: string[] = field.value ?? [];
                return (
                  <div className="mt-4">
                    <div className="mb-1.5 text-[13px] font-medium text-foreground/80">Used for</div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Applications">
                      {TILE_APPLICATIONS.map((a) => {
                        const on = value.includes(a);
                        return (
                          <button
                            key={a}
                            type="button"
                            aria-pressed={on}
                            onClick={() => field.onChange(on ? value.filter((x) => x !== a) : [...value, a])}
                            className={on ? "rounded-full bg-tint px-3 py-1 text-[12.5px] font-medium text-white" : "rounded-full bg-fill px-3 py-1 text-[12.5px] text-foreground/80 hover:bg-fill-strong"}
                          >
                            {labelOf(a)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }}
            />
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {tile && <SwitchField control={form.control} name="allowLooseSale" label="Allow loose piece sale" />}
            <SwitchField control={form.control} name="isActive" label="Active" />
          </div>
        </Section>

        <Section title="Images">
          <div className="flex flex-wrap gap-3">
            {(values.images ?? []).map((url, i) => (
              <div key={url + i} className="group relative size-24 overflow-hidden rounded-lg bg-fill">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
                {canWrite && (
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => form.setValue("images", (values.images ?? []).filter((_, j) => j !== i) as string[], { shouldDirty: true })}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {canWrite && (
              <label className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-border text-[12px] text-muted-foreground hover:bg-fill">
                <span className="flex flex-col items-center gap-1">
                  <ImagePlus className="size-5" />
                  {uploading ? "Uploading…" : "Add images"}
                </span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onUpload(e.target.files)} />
              </label>
            )}
          </div>
        </Section>

        <Section title="Description">
          <TextareaField control={form.control} name="description" rows={3} />
        </Section>
      </fieldset>

      {canWrite && (
        <div className="material-bar sticky bottom-0 -mx-3 flex justify-end gap-2 border-t border-border px-3 py-3 md:-mx-6 md:px-6">
          <Button type="button" variant="secondary" onClick={() => router.push("/catalogue/products")}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save product"} <kbd className="ml-1 hidden text-[10px] opacity-70 md:inline">Ctrl S</kbd>
          </Button>
        </div>
      )}
    </form>
  );
}

/** Sanitary colour variants (e.g. WC in ivory / black). */
export function VariantsSection({ productId }: { productId: string }) {
  const { can } = useSession();
  const list = useApi<{ items: { id: string; skuSuffix: string; name: string | null; mrpPaise: number | null; colorId: string | null; color: { name: string } | null }[] }>("/product-variants", { productId, pageSize: 100 });
  const [draft, setDraft] = useState<{ skuSuffix: string; name: string; colorId: string | null; mrpPaise: number | null }>({ skuSuffix: "", name: "", colorId: null, mrpPaise: null });
  const add = useApiMutation(() => api("/product-variants", { method: "POST", body: { ...draft, productId } }), ["/product-variants"]);
  const del = useApiMutation((id: string) => api(`/product-variants/${id}`, { method: "DELETE" }), ["/product-variants"]);
  return (
    <Section title="Colour variants">
      {list.data?.items.length ? (
        <ul className="mb-3 divide-y divide-border">
          {list.data.items.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-2 text-[13.5px]">
              <span className="w-16 font-mono">{v.skuSuffix}</span>
              <span className="flex-1">{v.name ?? v.color?.name}</span>
              <span className="tabular">{v.mrpPaise ? formatINR(v.mrpPaise) : "—"}</span>
              {can("catalogue.write") && (
                <Button variant="ghost" size="icon" className="size-7" aria-label="Delete variant" onClick={() => del.mutate(v.id, { onError: (e) => toast.error(e.message) })}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[13px] text-muted-foreground">No variants. Add colour options sold under this product.</p>
      )}
      {can("catalogue.write") && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input placeholder="SKU suffix" value={draft.skuSuffix} onChange={(e) => setDraft({ ...draft, skuSuffix: e.target.value })} />
          <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <EntitySelect endpoint="/colors" value={draft.colorId} onChange={(id) => setDraft({ ...draft, colorId: id })} getLabel={(c: { id: string; name: string }) => c.name} placeholder="Colour" clearable />
          <MoneyInput value={draft.mrpPaise} onChange={(p) => setDraft({ ...draft, mrpPaise: p })} />
          <Button
            type="button"
            onClick={() =>
              add.mutate(undefined, {
                onSuccess: () => {
                  toast.success("Variant added");
                  setDraft({ skuSuffix: "", name: "", colorId: null, mrpPaise: null });
                },
                onError: (e) => toast.error(e.message),
              })
            }
            disabled={!draft.skuSuffix || add.isPending}
          >
            Add variant
          </Button>
        </div>
      )}
      <NativeSelect className="hidden" aria-hidden />
    </Section>
  );
}
