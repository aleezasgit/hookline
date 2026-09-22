"use client";

import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Film } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CostButton } from "@/components/ui/CostButton";
import { GenerationCard } from "@/components/video/GenerationCard";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { EmptyState } from "@/components/shell/EmptyState";
import { useGenerations } from "@/lib/hooks/use-generations";
import { api, ApiError } from "@/lib/api";
import { downloadVideo } from "@/lib/media/fetch";
import { getPreset } from "@/config/presets";
import { MODELS, getModel } from "@/config/models";
import type { Generation } from "@/lib/types";

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "final", label: "Pro renders" },
  { key: "campaign", label: "Campaigns" },
];

export default function LibraryPage() {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const { data, mutate: mutateList, error, reconnecting } = useGenerations(filter);
  const { mutate } = useSWRConfig();
  const generations = data?.generations ?? [];
  const open = generations.find((g) => g.id === openId) ?? null;

  async function handleFinalize(g: Generation) {
    setFinalizing(true);
    try {
      await api.postIdempotent<{ generation: Generation }>(`/api/generations/${g.id}/finalize`);
      mutate("/api/workspace");
      mutateList();
      toast.success("Rendering in Pro. Find it under Pro renders when it's done.");
      // NOTE: finalize creates a brand new generation row (tier=final, parentId=g.id) rather
      // than updating this one, and there's no "children of this draft" API to look it up, so
      // the dialog stays on the current draft instead of guessing which row to jump to. Create's
      // page can safely reselect because its "recent" list always includes the new row (filter
      // is Create-scoped, not tier-scoped); Library's tab filter may not include it.
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not render in Pro. Try again.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleDownload(g: Generation) {
    if (!g.outputUrl) return;
    try {
      await downloadVideo(g.outputUrl, `hookline-${g.id}.mp4`);
    } catch {
      toast.error("Could not download the video. Try again.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <Tabs value={filter} onValueChange={setFilter}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {reconnecting ? (
          <p className="text-xs text-warning">Reconnecting...</p>
        ) : null}

        {/* One TabsContent per filter (not four): the grid's data already comes
            from a fresh fetch keyed by `filter`, so there's nothing to gain from
            mounting four panels and hiding three. This still gives Radix's
            TabsTrigger a real element to point its aria-controls at, which an
            empty <Tabs><TabsList> with no TabsContent at all doesn't. */}
        <TabsContent value={filter} className="mt-6 flex flex-col gap-6">
      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Could not load this. Retry.</p>
          <Button onClick={() => mutateList()}>Retry</Button>
        </div>
      ) : generations.length === 0 ? (
        <EmptyState icon={Film} text="No videos yet." actionLabel="Create your first video" actionHref="/create" />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {generations.map((g) => (
            <GenerationCard
              key={g.id}
              generation={g}
              mode="hover"
              onSelect={g.status === "done" ? () => setOpenId(g.id) : undefined}
            />
          ))}
        </div>
      )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-3xl sm:max-w-3xl">
          {open ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <VideoPlayer src={open.outputUrl ?? ""} aspect={open.aspect} mode="controls" />
              <div className="flex flex-col gap-4">
                <DialogHeader>
                  <DialogTitle>{getPreset(open.presetKey)?.name ?? "No preset"}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">{open.prompt}</p>
                <dl className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                  <dt>Model</dt>
                  <dd className="text-foreground">{getModel(open.modelKey).label}</dd>
                  <dt>Created</dt>
                  <dd className="text-foreground">{new Date(open.createdAt).toLocaleString()}</dd>
                  <dt>Cost</dt>
                  <dd className="text-foreground">{open.cost} credits</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleDownload(open)}>
                    Download
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/create?from=${open.id}`}>Remix</Link>
                  </Button>
                  {open.inputImageUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/campaigns/new?image=${encodeURIComponent(open.inputImageUrl)}`}>Use in campaign</Link>
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button type="button" variant="outline" size="sm" disabled>
                            Use in campaign
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Needs a clip made from a photo</TooltipContent>
                    </Tooltip>
                  )}
                  {open.tier === "draft" ? (
                    <CostButton
                      label="Render in Pro"
                      cost={MODELS.pro.costCredits}
                      onClick={() => handleFinalize(open)}
                      loading={finalizing}
                      size="sm"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
