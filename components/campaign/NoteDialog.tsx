"use client";

import { useState } from "react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CostButton } from "@/components/ui/CostButton";
import { api, ApiError } from "@/lib/api";
import { MODELS } from "@/config/models";
import type { Generation } from "@/lib/types";

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generationId: string;
  suggestedFix?: string | null;
  onRegenerated: (generation: Generation) => void;
}

export function NoteDialog({ open, onOpenChange, generationId, suggestedFix, onRegenerated }: NoteDialogProps) {
  const [note, setNote] = useState("");
  const [includeSuggestion, setIncludeSuggestion] = useState(true);
  const [loading, setLoading] = useState(false);

  const hasNote = note.trim().length > 0;
  const canSubmit = hasNote || (includeSuggestion && !!suggestedFix);

  async function submit() {
    setLoading(true);
    try {
      const { generation } = await api.postIdempotent<{ generation: Generation }>(
        `/api/generations/${generationId}/regenerate`,
        { note: hasNote ? note.trim() : undefined, includeSuggestion },
      );
      globalMutate("/api/workspace");
      toast.success("Regenerating");
      onRegenerated(generation);
      onOpenChange(false);
      setNote("");
      setIncludeSuggestion(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not regenerate. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fix and regenerate</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea
            placeholder="What should change?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
          />
          {suggestedFix ? (
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={includeSuggestion}
                onCheckedChange={(v) => setIncludeSuggestion(v === true)}
                className="mt-0.5"
              />
              <span>Include the reviewer&apos;s suggestion: {suggestedFix}</span>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <CostButton
            label="Regenerate"
            cost={MODELS.fast.costCredits}
            onClick={submit}
            loading={loading}
            disabled={!canSubmit}
            disabledReason={!canSubmit ? "Add a note or include the suggestion" : undefined}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
