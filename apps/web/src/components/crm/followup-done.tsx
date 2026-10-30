"use client";

import { useState } from "react";
import { toast } from "sonner";
import { labelOf, LEAD_STATUSES } from "@gc/shared";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell, NativeSelect } from "@/components/common/form-fields";
import { api, newIdempotencyKey } from "@/lib/api";

/** Mark a follow-up done, note the outcome and schedule the next one. */
export function FollowupDoneDialog({ followupId, leadName, onClose, onDone }: { followupId: string; leadName: string; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const save = async () => {
    if (!outcome.trim()) {
      toast.error("Write what happened");
      return;
    }
    setSaving(true);
    try {
      await api(`/followups/${followupId}/done`, {
        method: "POST",
        idempotencyKey: key,
        body: { outcome, nextDueAt: next ? new Date(`${next}:00+05:30`).toISOString() : null, status: status || undefined },
      });
      toast.success("Follow-up updated");
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
          <DialogTitle>Follow-up with {leadName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FieldShell label="What happened?" required>
            <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus placeholder="Called, visited showroom, sent quote…" />
          </FieldShell>
          <FieldShell label="Next follow-up">
            <Input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
          </FieldShell>
          <FieldShell label="Move lead to stage">
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Keep current</option>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{labelOf(s)}</option>)}
            </NativeSelect>
          </FieldShell>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
