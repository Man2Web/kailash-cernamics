"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { api, newIdempotencyKey, uploadFile } from "@/lib/api";

/** Site visit check-in with GPS position and photos (field sales on mobile). */
export function VisitCheckInDialog({ leadId, onClose, onDone }: { leadId?: string; onClose: () => void; onDone: () => void }) {
  const [lead, setLead] = useState<string | null>(leadId ?? null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [key] = useState(newIdempotencyKey);

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      (e) => {
        toast.error(e.message || "Could not get location");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push((await uploadFile(f, "visits")).url);
      setPhotos((p) => [...p, ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("/site-visits", { method: "POST", idempotencyKey: key, body: { leadId: lead, lat: pos?.lat ?? null, lng: pos?.lng ?? null, photos, notes: notes || null } });
      toast.success("Visit checked in");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Site visit check-in</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!leadId && (
            <FieldShell label="Lead">
              <EntitySelect<{ id: string; name: string; phone?: string }> endpoint="/leads" value={lead} onChange={(id) => setLead(id)} getLabel={(l) => l.name} getDescription={(l) => l.phone} clearable />
            </FieldShell>
          )}
          <FieldShell label="Location">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={locate} disabled={locating}>
                <MapPin className="size-4" /> {locating ? "Locating…" : pos ? "Update location" : "Use my location"}
              </Button>
              {pos && (
                <a className="text-[12px] text-tint hover:underline" href={`https://maps.google.com/?q=${pos.lat},${pos.lng}`} target="_blank" rel="noreferrer">
                  {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                </a>
              )}
            </div>
          </FieldShell>
          <FieldShell label="Photos">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-fill px-3 py-1.5 text-[13px] font-medium">
              <Camera className="size-4" /> {uploading ? "Uploading…" : "Add photos"}
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
            </label>
            {!!photos.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="size-16 rounded-md object-cover" />
                ))}
              </div>
            )}
          </FieldShell>
          <FieldShell label="Notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Measurements, customer preferences…" />
          </FieldShell>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Check in"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
