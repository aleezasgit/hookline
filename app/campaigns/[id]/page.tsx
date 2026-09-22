"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { Button } from "@/components/ui/button";
import { CostButton } from "@/components/ui/CostButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Stepper, type CampaignStep } from "@/components/campaign/Stepper";
import { ConceptCard } from "@/components/campaign/ConceptCard";
import { ReviewCard } from "@/components/campaign/ReviewCard";
import { NoteDialog } from "@/components/campaign/NoteDialog";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { useCampaign } from "@/lib/hooks/use-campaign";
import { api, ApiError } from "@/lib/api";
import { downloadVideo } from "@/lib/media/fetch";
import { MODELS } from "@/config/models";
import { isActive } from "@/lib/types";
import type { CampaignView, ConceptView, Decision, Generation } from "@/lib/types";
import { cn } from "cn";

const STEP_VALUES: CampaignStep[] = ["brief", "hooks", "review", "export"];

export default function CampaignPage() {
  return (
    <Suspense fallback={null}>
      <CampaignPageInner />
    </Suspense>
  );
}

function CampaignPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: view, mutate, error, reconnecting } = useCampaign(id);

  const conceptsRequested = useRef(false);
  useEffect(() => {
    if (!view || conceptsRequested.current) return;
    if (view.campaign.conceptsStatus === "idle" && view.concepts.length === 0) {
      conceptsRequested.current = true;
      api
        .post(`/api/campaigns/${id}/concepts`)
        .then(() => mutate())
        .catch((e) => {
          toast.error(e instanceof ApiError ? e.message : "Could not write hooks. Try again.");
          mutate();
        });
    }
  }, [view, id, mutate]);

  const derivedStep: CampaignStep = useMemo(() => {
    if (!view) return "hooks";
    const hasGenerations = view.concepts.some((c) => c.versions.length > 0);
    return hasGenerations ? "review" : "hooks";
  }, [view]);

  const stepParam = searchParams.get("step");
  const step: CampaignStep =
    stepParam && (STEP_VALUES as string[]).includes(stepParam) ? (stepParam as CampaignStep) : derivedStep;

  function setStep(next: CampaignStep) {
    router.push(`/campaigns/${id}?step=${next}`);
  }

  if (error) {
    // H6: a genuinely missing campaign (a bad or stale id) can't be fixed by
    // retrying, so it gets its own message and a way out instead of a dead-end
    // "Try again" that would just 404 a second time.
    const notFound = error instanceof ApiError && error.code === "NOT_FOUND";
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {notFound ? "Campaign not found." : "Could not load this campaign."}
        </p>
        {notFound ? (
          <Button asChild>
            <Link href="/campaigns">Go to campaigns</Link>
          </Button>
        ) : (
          <Button onClick={() => mutate()}>Try again</Button>
        )}
      </div>
    );
  }

  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius)]" />
          ))}
        </div>
      </div>
    );
  }

  const { campaign } = view;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      {reconnecting ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center">
          <div className="pointer-events-auto rounded-full border border-warning/40 bg-surface-2/95 px-3 py-1 text-xs text-warning shadow-lg backdrop-blur">
            Reconnecting...
          </div>
        </div>
      ) : null}
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
            {campaign.brief.productImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={campaign.brief.productImageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <h1 className="truncate text-xl font-bold">{campaign.name}</h1>
        </div>
        <Stepper view={view} step={step} onStepChange={setStep} />
      </header>

      {step === "hooks" ? (
        <HooksStep view={view} campaignId={id} mutate={mutate} onDone={() => setStep("review")} />
      ) : null}
      {step === "review" ? <ReviewStep view={view} mutate={mutate} onGoExport={() => setStep("export")} /> : null}
      {step === "export" ? <ExportStep view={view} mutate={mutate} onGoReview={() => setStep("review")} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hooks step
// ---------------------------------------------------------------------------

function HooksStep({
  view,
  campaignId,
  mutate,
  onDone,
}: {
  view: CampaignView;
  campaignId: string;
  mutate: () => void;
  onDone: () => void;
}) {
  const { campaign, concepts } = view;
  const [rewriteConfirmOpen, setRewriteConfirmOpen] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [writingHooks, setWritingHooks] = useState(false);

  async function writeHooks() {
    if (writingHooks) return;
    setWritingHooks(true);
    try {
      await api.post(`/api/campaigns/${campaignId}/concepts`);
      mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not write hooks. Try again.");
      mutate();
    } finally {
      setWritingHooks(false);
    }
  }

  async function rewriteHooks() {
    setRewriting(true);
    await writeHooks();
    setRewriting(false);
    setRewriteConfirmOpen(false);
  }

  const selectedWithoutVideo = concepts.filter((c) => c.selected && c.versions.length === 0);
  const k = selectedWithoutVideo.length;
  const cost = k * MODELS.fast.costCredits;

  async function generateDrafts() {
    setGenerating(true);
    try {
      await api.post(`/api/campaigns/${campaignId}/generate`);
      globalMutate("/api/workspace");
      await mutate();
      toast.success(`Generating ${k} draft${k === 1 ? "" : "s"}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start generation. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (campaign.conceptsStatus === "generating") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Writing hooks for {campaign.brief.productName}</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: campaign.brief.conceptCount }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius)]" />
          ))}
        </div>
      </div>
    );
  }

  if (campaign.conceptsStatus === "failed") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not write hooks.</p>
        <Button onClick={writeHooks} disabled={writingHooks}>
          {writingHooks ? "Trying again..." : "Try again"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-center justify-end">
        <Button variant="secondary" size="sm" onClick={() => setRewriteConfirmOpen(true)}>
          Rewrite hooks
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {concepts.map((c) => (
          <ConceptCard key={c.id} concept={c} onMutate={mutate} />
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 flex justify-end border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <CostButton
          label={`Generate ${k} draft${k === 1 ? "" : "s"}`}
          cost={cost}
          onClick={generateDrafts}
          loading={generating}
          disabled={k === 0}
          disabledReason={k === 0 ? "Select at least one hook" : undefined}
        />
      </div>

      <Dialog open={rewriteConfirmOpen} onOpenChange={setRewriteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rewrite hooks</DialogTitle>
            <DialogDescription>Hooks without videos will be replaced.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRewriteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={rewriteHooks} disabled={rewriting}>
              {rewriting ? "Rewriting..." : "Rewrite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------------

type ReviewTab = "needsReview" | "approved" | "rejected";

function ReviewStep({
  view,
  mutate,
  onGoExport,
}: {
  view: CampaignView;
  mutate: () => void;
  onGoExport: () => void;
}) {
  const { concepts, counts } = view;
  const [tab, setTab] = useState<ReviewTab>("needsReview");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [fixTarget, setFixTarget] = useState<ConceptView | null>(null);
  // H3: locks a generation's Approve/Reject/Undo buttons while its own decision
  // request is in flight, so a double click (or the same key pressed twice) can
  // never fire two decision calls for the same card.
  const [deciding, setDeciding] = useState<Set<string>>(new Set());

  // Reset the keyboard focus whenever the active tab changes. Adjusting state
  // directly during render (rather than in a useEffect) avoids an extra
  // cascading render, per React's "adjusting state on prop change" pattern.
  const [prevTab, setPrevTab] = useState(tab);
  if (tab !== prevTab) {
    setPrevTab(tab);
    setFocusedIndex(0);
  }

  const generatingConcepts = concepts.filter((c) => c.latest && isActive(c.latest.status));
  const pendingConcepts = concepts.filter(
    (c) => c.latest && c.latest.status === "done" && c.latest.decision === "pending",
  );
  // A draft whose only generation failed (e.g. it timed out) has nowhere else to
  // live: it isn't done, so it can't be approved/rejected, but it still needs a
  // human to see it and retry. Surface it in Needs review too, where
  // GenerationCard already renders its error + "Try again" state.
  const failedConcepts = concepts.filter((c) => c.latest && c.latest.status === "failed");
  const needsReviewTabList = [...generatingConcepts, ...pendingConcepts, ...failedConcepts];
  const approvedConcepts = concepts.filter((c) => c.latest && c.latest.decision === "approved");
  const rejectedConcepts = concepts.filter((c) => c.latest && c.latest.decision === "rejected");
  const visibleConcepts =
    tab === "needsReview" ? needsReviewTabList : tab === "approved" ? approvedConcepts : rejectedConcepts;
  const clampedFocus = Math.min(focusedIndex, Math.max(visibleConcepts.length - 1, 0));

  async function decide(generationId: string, decision: Decision) {
    if (deciding.has(generationId)) return;
    setDeciding((s) => new Set(s).add(generationId));
    try {
      await api.patch(`/api/generations/${generationId}/decision`, { decision });
      toast.success(decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Undone");
      mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save. Try again.");
    } finally {
      setDeciding((s) => {
        const next = new Set(s);
        next.delete(generationId);
        return next;
      });
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (fixTarget) return; // a dialog is open
      if (visibleConcepts.length === 0) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, visibleConcepts.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key.toLowerCase() === "a") {
        const c = visibleConcepts[clampedFocus];
        if (c?.latest && c.latest.status === "done") decide(c.latest.id, "approved");
      } else if (e.key.toLowerCase() === "r") {
        const c = visibleConcepts[clampedFocus];
        if (c?.latest && c.latest.status === "done") decide(c.latest.id, "rejected");
      } else if (e.key.toLowerCase() === "f") {
        const c = visibleConcepts[clampedFocus];
        if (c?.latest && c.latest.status === "done") setFixTarget(c);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConcepts, clampedFocus, fixTarget]);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewTab)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="needsReview">Needs review ({counts.needsReview})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
          </TabsList>
        <button
          type="button"
          onClick={() => setCaptionsOn((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          Captions
          <span
            role="switch"
            aria-checked={captionsOn}
            aria-label="Captions"
            className={cn("inline-flex h-5 w-9 items-center rounded-full transition-colors", captionsOn ? "bg-primary" : "bg-surface-2")}
          >
            <span
              className={cn(
                "block size-4 translate-x-0.5 rounded-full bg-background transition-transform",
                captionsOn && "translate-x-4",
              )}
            />
          </span>
        </button>
      </div>

      {/* One TabsContent per active tab (not three): each tab's list is already
          derived from the same fetched data, so there's nothing to gain from
          mounting three panels and hiding two. This still gives each
          TabsTrigger a real element to point its aria-controls at. */}
      <TabsContent value={tab} className="mt-4 flex flex-col gap-4">
      {tab === "needsReview" && needsReviewTabList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">All clips reviewed. {counts.approved} approved.</p>
          <Button onClick={onGoExport}>Go to export</Button>
        </div>
      ) : visibleConcepts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleConcepts.map((c, i) => (
            <ReviewCard
              key={c.id}
              concept={c}
              captionsOn={captionsOn}
              isFocused={i === clampedFocus}
              busy={!!c.latest && deciding.has(c.latest.id)}
              onFocusCard={() => setFocusedIndex(i)}
              onApprove={() => c.latest && decide(c.latest.id, "approved")}
              onReject={() => c.latest && decide(c.latest.id, "rejected")}
              onOpenFix={() => setFixTarget(c)}
              onUndo={() => c.latest && decide(c.latest.id, "pending")}
              onMutate={mutate}
            />
          ))}
        </div>
      )}
      </TabsContent>
      </Tabs>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pb-3">
        <div className="pointer-events-auto rounded-full border border-border bg-surface-2/95 px-4 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
          <kbd className="rounded border border-border bg-surface px-1 font-mono">A</kbd> approve{" "}
          <kbd className="rounded border border-border bg-surface px-1 font-mono">R</kbd> reject{" "}
          <kbd className="rounded border border-border bg-surface px-1 font-mono">F</kbd> fix{" "}
          <kbd className="rounded border border-border bg-surface px-1 font-mono">&larr;&rarr;</kbd> move
        </div>
      </div>

      {fixTarget?.latest ? (
        <NoteDialog
          open
          onOpenChange={(open) => {
            if (!open) setFixTarget(null);
          }}
          generationId={fixTarget.latest.id}
          suggestedFix={fixTarget.latest.aiReview?.suggestedFix}
          onRegenerated={() => mutate()}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export step
// ---------------------------------------------------------------------------

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "video";
}

function Elapsed({ createdAt }: { createdAt: string }) {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);
  const s = Math.max(0, seconds);
  return (
    <>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </>
  );
}

function ExportStep({
  view,
  mutate,
  onGoReview,
}: {
  view: CampaignView;
  mutate: () => void;
  onGoReview: () => void;
}) {
  const { campaign, concepts } = view;
  const approved = concepts.filter((c) => c.latest?.decision === "approved");
  const [pendingFinalize, setPendingFinalize] = useState<Set<string>>(new Set());
  const [renderingAll, setRenderingAll] = useState(false);
  const [viewingFinal, setViewingFinal] = useState<Generation | null>(null);
  const [retryingFinal, setRetryingFinal] = useState<Set<string>>(new Set());

  const withoutFinal = approved.filter((c) => !c.final || c.final.status === "failed");
  const renderAllCost = withoutFinal.length * MODELS.pro.costCredits;

  async function finalizeOne(conceptId: string, generationId: string): Promise<boolean> {
    setPendingFinalize((s) => new Set(s).add(conceptId));
    try {
      await api.postIdempotent(`/api/generations/${generationId}/finalize`);
      globalMutate("/api/workspace");
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not render in Pro. Try again.");
      return false;
    } finally {
      setPendingFinalize((s) => {
        const next = new Set(s);
        next.delete(conceptId);
        return next;
      });
      mutate();
    }
  }

  async function retryFinal(id: string) {
    if (retryingFinal.has(id)) return;
    setRetryingFinal((s) => new Set(s).add(id));
    try {
      await api.postIdempotent(`/api/generations/${id}/retry`);
      mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not retry. Try again.");
    } finally {
      setRetryingFinal((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function renderAll() {
    setRenderingAll(true);
    for (const c of withoutFinal) {
      if (!c.latest) continue;
      const ok = await finalizeOne(c.id, c.latest.id);
      if (!ok) break;
    }
    setRenderingAll(false);
  }

  function copyCaption(caption: string) {
    navigator.clipboard
      .writeText(caption)
      .then(() => toast.success("Caption copied"))
      .catch(() => toast.error("Could not copy the caption."));
  }

  if (approved.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">No approved clips yet</p>
        <Button onClick={onGoReview}>Go to review</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-center justify-end">
        <CostButton
          label="Render all in Pro"
          cost={renderAllCost}
          onClick={renderAll}
          loading={renderingAll}
          disabled={withoutFinal.length === 0}
          disabledReason={withoutFinal.length === 0 ? "Every approved clip already has a Pro render" : undefined}
        />
      </div>

      <div className="flex flex-col gap-3">
        {approved.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-3 sm:flex-row sm:items-center"
          >
            <div className="w-24 shrink-0">
              <VideoPlayer src={c.latest?.outputUrl ?? ""} aspect="9:16" mode="hover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.hookLine}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{c.caption}</span>
                <button
                  type="button"
                  onClick={() => copyCaption(c.caption)}
                  className="shrink-0 text-primary hover:underline"
                >
                  Copy caption
                </button>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {!c.final || c.final.status === "failed" ? (
                c.final?.status === "failed" ? (
                  <div className="flex items-center gap-2 text-xs text-danger">
                    <span>{c.final.error ?? "Render failed."} Credits refunded.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={retryingFinal.has(c.final.id)}
                      onClick={() => retryFinal(c.final!.id)}
                    >
                      {retryingFinal.has(c.final.id) ? "Retrying..." : "Try again"}
                    </Button>
                  </div>
                ) : (
                  <CostButton
                    label="Render in Pro"
                    cost={MODELS.pro.costCredits}
                    onClick={() => c.latest && finalizeOne(c.id, c.latest.id)}
                    loading={pendingFinalize.has(c.id)}
                  />
                )
              ) : isActive(c.final.status) ? (
                <span className="text-xs text-muted-foreground">
                  Rendering &middot; <Elapsed createdAt={c.final.createdAt} />
                </span>
              ) : (
                <button type="button" onClick={() => setViewingFinal(c.final)}>
                  <Badge className="cursor-pointer bg-primary text-primary-foreground">Pro</Badge>
                </button>
              )}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  c.latest?.outputUrl &&
                  downloadVideo(c.latest.outputUrl, `${slug(campaign.brief.productName)}-${c.hookType}-draft.mp4`)
                }
              >
                Download draft
              </Button>
              {c.final && c.final.status === "done" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    c.final?.outputUrl &&
                    downloadVideo(c.final.outputUrl, `${slug(campaign.brief.productName)}-${c.hookType}-pro.mp4`)
                  }
                >
                  Download Pro
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!viewingFinal} onOpenChange={(o) => !o && setViewingFinal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pro render</DialogTitle>
          </DialogHeader>
          {viewingFinal ? (
            <VideoPlayer src={viewingFinal.outputUrl ?? ""} aspect={viewingFinal.aspect} mode="controls" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
