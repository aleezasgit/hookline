"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CampaignView } from "@/lib/types";

export type CampaignStep = "brief" | "hooks" | "review" | "export";

const STEPS: { key: CampaignStep; label: string }[] = [
  { key: "brief", label: "Brief" },
  { key: "hooks", label: "Hooks" },
  { key: "review", label: "Review" },
  { key: "export", label: "Export" },
];

interface StepperProps {
  view: CampaignView;
  step: CampaignStep;
  onStepChange: (step: CampaignStep) => void;
  className?: string;
}

export function Stepper({ view, step, onStepChange, className }: StepperProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const { campaign, concepts, counts } = view;

  const hooksReady = campaign.conceptsStatus === "ready";
  const hasGenerations = concepts.some((c) => c.versions.length > 0);
  // NOTE: architecture.md section 4 only defines Hooks vs Review derivation, not
  // per-step "completed" checkmarks. Simplest reading that matches product.md:
  // Brief is always done once the campaign exists, Hooks is done once concepts are
  // written, Review is done once nothing is left in "needs review", Export never
  // shows a check since there is no terminal state for it.
  const isCompleted = (key: CampaignStep) => {
    if (key === "brief") return true;
    if (key === "hooks") return hooksReady;
    if (key === "review") return hasGenerations && counts.needsReview === 0;
    return false;
  };

  return (
    <>
      <nav className={cn("flex flex-wrap items-center gap-1", className)} aria-label="Campaign steps">
        {STEPS.map((s, i) => {
          const active = s.key === step;
          const done = isCompleted(s.key);
          const badge =
            s.key === "review" ? counts.needsReview : s.key === "export" ? counts.approved : null;
          return (
            <div key={s.key} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => (s.key === "brief" ? setBriefOpen(true) : onStepChange(s.key))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                )}
                {s.label}
                {badge !== null && badge > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                    {badge}
                  </span>
                ) : null}
              </button>
              {i < STEPS.length - 1 ? <span className="h-px w-4 shrink-0 bg-border" aria-hidden /> : null}
            </div>
          );
        })}
      </nav>

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Brief</DialogTitle>
          </DialogHeader>
          <dl className="grid gap-3 text-sm">
            <Row label="Product" value={campaign.brief.productName} />
            <Row label="What it is" value={campaign.brief.productDescription} />
            <Row label="Audience" value={campaign.brief.audience} />
            <Row label="Goal" value={campaign.brief.goal} />
            <Row label="Platform" value={campaign.brief.platform} />
            <Row label="Tone" value={campaign.brief.tone} />
            <Row label="Variants" value={String(campaign.brief.conceptCount)} />
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
