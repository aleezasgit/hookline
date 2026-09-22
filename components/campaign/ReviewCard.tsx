"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GenerationCard } from "@/components/video/GenerationCard";
import { ScorePill } from "@/components/campaign/ScorePill";
import { enqueueReview, failedLocally, retryReview } from "@/lib/media/review-queue";
import type { ConceptView } from "@/lib/types";

interface ReviewCardProps {
  concept: ConceptView;
  captionsOn: boolean;
  isFocused: boolean;
  busy?: boolean;
  onFocusCard: () => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenFix: () => void;
  onUndo: () => void;
  onMutate: () => void;
  className?: string;
}

export function ReviewCard({
  concept,
  captionsOn,
  isFocused,
  busy,
  onFocusCard,
  onApprove,
  onReject,
  onOpenFix,
  onUndo,
  onMutate,
  className,
}: ReviewCardProps) {
  const versions = concept.versions;
  const [versionIndex, setVersionIndex] = useState(0);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const clampedIndex = Math.min(versionIndex, Math.max(versions.length - 1, 0));
  const current = versions[clampedIndex] ?? null;
  const isLatest = clampedIndex === 0;
  const latest = concept.latest;

  // Kick off the AI pre-review as soon as the latest clip finishes. The queue
  // de-duplicates by generation id, so this is safe to call on every render.
  useEffect(() => {
    if (latest && latest.status === "done" && latest.aiReviewStatus === "none") {
      enqueueReview(latest.id, latest.outputUrl ?? "", onMutate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latest?.status, latest?.aiReviewStatus]);

  if (!current) return null;

  const reviewFailed = current.aiReviewStatus === "failed" || failedLocally.has(current.id);
  const reviewing = current.aiReviewStatus === "none" || current.aiReviewStatus === "pending";
  const review = current.aiReview;

  return (
    <div
      tabIndex={0}
      onClick={onFocusCard}
      onFocus={onFocusCard}
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-3 outline-none",
        isFocused && "ring-2 ring-primary",
        className,
      )}
    >
      <GenerationCard generation={current} mode="autoplay" caption={captionsOn ? concept.hookLine : null} />

      {versions.length > 1 ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={clampedIndex >= versions.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              setVersionIndex((i) => Math.min(i + 1, versions.length - 1));
            }}
            aria-label="Older version"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span>
            v{versions.length - clampedIndex} of {versions.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={clampedIndex <= 0}
            onClick={(e) => {
              e.stopPropagation();
              setVersionIndex((i) => Math.max(i - 1, 0));
            }}
            aria-label="Newer version"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      ) : null}

      {current.status === "done" ? (
        <div className="min-h-[2rem]">
          {reviewFailed ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-danger">Review unavailable</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  retryReview(current.id, current.outputUrl ?? "", onMutate);
                }}
              >
                Retry review
              </Button>
            </div>
          ) : reviewing ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
              ))}
              <span className="text-xs text-muted-foreground">Reviewing</span>
            </div>
          ) : review ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <ScorePill label="Hook" score={review.scores.hook} />
                <ScorePill label="Native" score={review.scores.native} />
                <ScorePill label="On brief" score={review.scores.onBrief} />
                <ScorePill label="Quality" score={review.scores.quality} />
                <span className="text-xs font-semibold text-muted-foreground">{review.overall}/5</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReasonsOpen((v) => !v);
                }}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Why
                <ChevronDown className={cn("size-3 transition-transform", reasonsOpen && "rotate-180")} />
              </button>
              {reasonsOpen ? (
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Hook.</strong> {review.reasons.hook}
                  </li>
                  <li>
                    <strong className="text-foreground">Native.</strong> {review.reasons.native}
                  </li>
                  <li>
                    <strong className="text-foreground">On brief.</strong> {review.reasons.onBrief}
                  </li>
                  <li>
                    <strong className="text-foreground">Quality.</strong> {review.reasons.quality}
                  </li>
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">Suggested fix: {review.suggestedFix}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {isLatest && current.status === "done" ? (
        current.decision !== "pending" ? (
          <div className="flex items-center justify-between">
            <Badge
              className={cn(
                current.decision === "approved" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
              )}
            >
              {current.decision === "approved" ? "Approved" : "Rejected"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onUndo();
              }}
            >
              Undo
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              Reject
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFix();
              }}
            >
              Fix
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
