"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Film, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CostButton } from "@/components/ui/CostButton";
import { PresetPicker } from "@/components/create/PresetPicker";
import { ImageDropzone } from "@/components/create/ImageDropzone";
import { GenerationCard } from "@/components/video/GenerationCard";
import { useGenerations } from "@/lib/hooks/use-generations";
import { api, ApiError } from "@/lib/api";
import { downloadVideo } from "@/lib/media/fetch";
import { cn } from "cn";
import { getPreset } from "@/config/presets";
import { MODELS, getModel } from "@/config/models";
import type { Aspect, Generation, ModelKey } from "@/lib/types";

const ASPECTS: Aspect[] = ["9:16", "16:9", "1:1"];

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateStudio />
    </Suspense>
  );
}

function CreateStudio() {
  const searchParams = useSearchParams();
  const { mutate } = useSWRConfig();

  // ?preset= is available synchronously on first render, so it's read via a lazy initializer
  // instead of an effect (no need to wait a tick just to set state React already has on hand).
  const [presetKey, setPresetKey] = useState<string | null>(
    () => getPreset(searchParams.get("preset"))?.key ?? null,
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState<ModelKey>(
    () => getPreset(searchParams.get("preset"))?.defaultModel ?? "fast",
  );
  const [aspect, setAspect] = useState<Aspect>(
    () => getPreset(searchParams.get("preset"))?.defaultAspect ?? "9:16",
  );
  const [duration, setDuration] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Snapshot for a selected generation that may not (yet, or ever) be in the "recent" list,
  // e.g. right after POST /api/generate before the list has revalidated, or a ?from= id that
  // has aged out of the recent-60 window. The recent list (when it has the id) always wins
  // since it carries live polling updates.
  const [selectedFallback, setSelectedFallback] = useState<Generation | null>(null);
  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const initialized = useRef(false);
  const generateRef = useRef<() => void>(() => {});

  const { data: recentData, mutate: mutateRecent, error: recentError, reconnecting: recentReconnecting } = useGenerations("create");
  const recent = useMemo(() => recentData?.generations ?? [], [recentData]);

  const model = getModel(modelKey);
  const preset = getPreset(presetKey);

  function applyGeneration(g: Generation) {
    setPresetKey(g.presetKey);
    setImageUrl(g.inputImageUrl);
    setPrompt(g.prompt);
    setModelKey(g.modelKey);
    setAspect(g.aspect);
    setDuration(g.duration);
    setSelectedId(g.id);
    setSelectedFallback(g);
  }

  // Prefill from ?from= on first load only. This needs a network round trip, so unlike
  // ?preset= (read synchronously above) it can't be done in a useState initializer; the
  // setState calls below run inside the fetch's .then callback, not synchronously in the
  // effect body itself, which is the pattern React's docs recommend for this case.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fromParam = searchParams.get("from");
    if (!fromParam) return;
    api
      .get<{ generation: Generation }>(`/api/generations/${fromParam}`)
      .then(({ generation }) => applyGeneration(generation))
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "Could not load that generation."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return recent.find((g) => g.id === selectedId) ?? (selectedFallback?.id === selectedId ? selectedFallback : null);
  }, [recent, selectedId, selectedFallback]);

  function handleModelChange(next: ModelKey) {
    const m = getModel(next);
    setModelKey(next);
    if (!m.aspects.includes(aspect)) setAspect(m.aspects[0]);
    if (!m.durations.includes(duration)) setDuration(m.defaultDuration);
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const { generation } = await api.postIdempotent<{ generation: Generation }>("/api/generate", {
        presetKey,
        modelKey,
        prompt,
        imageUrl,
        aspect,
        duration,
      });
      setSelectedId(generation.id);
      setSelectedFallback(generation);
      mutate("/api/workspace");
      mutateRecent();
      toast.success("Generating your video.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start the generation. Try again.");
    } finally {
      setGenerating(false);
    }
  }
  useEffect(() => {
    generateRef.current = handleGenerate;
  });

  async function handleEnhance() {
    if (enhancing || !prompt.trim()) return;
    setEnhancing(true);
    const previous = prompt;
    try {
      const { prompt: enhanced } = await api.post<{ prompt: string }>("/api/prompt/enhance", { prompt, presetKey });
      setPrompt(enhanced);
      toast.success("Prompt enhanced.", {
        action: { label: "Undo", onClick: () => setPrompt(previous) },
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not enhance the prompt. Try again.");
    } finally {
      setEnhancing(false);
    }
  }

  async function handleFinalize() {
    if (!selected || finalizing) return;
    setFinalizing(true);
    try {
      const { generation } = await api.postIdempotent<{ generation: Generation }>(`/api/generations/${selected.id}/finalize`);
      setSelectedId(generation.id);
      setSelectedFallback(generation);
      mutate("/api/workspace");
      mutateRecent();
      toast.success("Rendering in Pro.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not render in Pro. Try again.");
    } finally {
      setFinalizing(false);
    }
  }

  function handleRemix() {
    if (!selected) return;
    applyGeneration(selected);
    toast.success("Loaded into the panel.");
  }

  async function handleDownload() {
    if (!selected?.outputUrl) return;
    try {
      await downloadVideo(selected.outputUrl, `hookline-${selected.id}.mp4`);
    } catch {
      toast.error("Could not download the video. Try again.");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        generateRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const canUseInCampaign = !!selected?.inputImageUrl;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 pb-28 lg:flex-row lg:items-start lg:pb-6">
      {/* Controls */}
      <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:w-[360px] lg:shrink-0">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Preset</p>
          <PresetPicker presetKey={presetKey} onChange={setPresetKey} />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Photo (optional)</p>
          <ImageDropzone value={imageUrl} onChange={setImageUrl} fitAspect={aspect === "9:16" ? "9:16" : undefined} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Prompt</p>
            <Button type="button" variant="ghost" size="sm" onClick={handleEnhance} disabled={enhancing || !prompt.trim()}>
              <Wand2 className="size-3.5" />
              {enhancing ? "Enhancing..." : "Enhance"}
            </Button>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={preset?.placeholder ?? "Describe what you want to see"}
            rows={4}
            maxLength={1000}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{prompt.length}/1000</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Model</p>
          {/* NOTE: a two-way toggle reads clearer than a dropdown for a binary Fast/Pro choice;
              the doc calls this a "model select" but doesn't mandate the shadcn Select control. */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(MODELS) as ModelKey[]).map((key) => {
              const m = MODELS[key];
              const active = modelKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleModelChange(key)}
                  className={cn(
                    "rounded-[var(--radius)] border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs">{m.costCredits} credits</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Aspect</p>
          <div className="flex gap-2">
            {ASPECTS.filter((a) => model.aspects.includes(a)).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspect(a)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  aspect === a
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Length</p>
          <div className="w-fit rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {duration}s
          </div>
        </div>

        <div className="hidden lg:block">
          <CostButton label="Generate" cost={model.costCredits} onClick={handleGenerate} loading={generating} className="w-full" />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex flex-1 flex-col gap-6">
        <div className="mx-auto w-full max-w-sm">
          {selected ? (
            <GenerationCard generation={selected} mode="controls" />
          ) : (
            <div className="flex aspect-[9/16] flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-border bg-surface-2 p-8 text-center">
              <Film className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Your video will appear here</p>
              {preset ? <p className="text-xs text-muted-foreground">Preset: {preset.name}</p> : null}
            </div>
          )}
        </div>

        {selected && selected.status === "done" ? (
          <div className="mx-auto flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
              Download
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleRemix}>
              Remix
            </Button>
            {canUseInCampaign ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/campaigns/new?image=${encodeURIComponent(selected.inputImageUrl!)}`}>Use in campaign</Link>
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
            {selected.tier === "draft" ? (
              <CostButton label="Render in Pro" cost={MODELS.pro.costCredits} onClick={handleFinalize} loading={finalizing} size="sm" />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
            {recentReconnecting ? <span className="text-xs text-warning">Reconnecting...</span> : null}
          </div>
          {recentError ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Could not load this. Retry.</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => mutateRecent()}>Retry</Button>
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet. Generate your first video above.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recent.slice(0, 20).map((g) => (
                <GenerationCard
                  key={g.id}
                  generation={g}
                  mode="hover"
                  onSelect={() => {
                    setSelectedId(g.id);
                    setSelectedFallback(g);
                  }}
                  selected={g.id === selectedId}
                  className="w-28 shrink-0"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom bar on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <CostButton label="Generate" cost={model.costCredits} onClick={handleGenerate} loading={generating} className="w-full" />
      </div>
    </div>
  );
}
