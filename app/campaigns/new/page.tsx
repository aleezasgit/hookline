"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BriefPhotoDropzone } from "@/components/campaign/BriefPhotoDropzone";
import { api, ApiError } from "@/lib/api";
import { MODELS } from "@/config/models";
import type { Brief, Goal, Platform, Tone } from "@/lib/types";

const GOALS: { value: Goal; label: string }[] = [
  { value: "awareness", label: "Awareness" },
  { value: "installs", label: "App installs" },
  { value: "sales", label: "Sales" },
  { value: "engagement", label: "Engagement" },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "reels", label: "Reels" },
  { value: "shorts", label: "Shorts" },
];

const TONES: { value: Tone; label: string }[] = [
  { value: "funny", label: "Funny" },
  { value: "relatable", label: "Relatable" },
  { value: "aspirational", label: "Aspirational" },
  { value: "educational", label: "Educational" },
  { value: "chaotic", label: "Chaotic" },
];

const EXAMPLE_BRIEF: Omit<Brief, "productImageUrl"> = {
  productName: "Habitly",
  productDescription:
    "A habit tracker app that turns small daily routines into short streaks with gentle reminders, made for students juggling classes and deadlines.",
  audience: "Students who keep dropping new habits",
  goal: "installs",
  platform: "tiktok",
  tone: "relatable",
  conceptCount: 4,
};

export default function NewCampaignPage() {
  return (
    <Suspense fallback={null}>
      <NewCampaignForm />
    </Suspense>
  );
}

function NewCampaignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productImageUrl, setProductImageUrl] = useState<string | null>(searchParams.get("image"));
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState<Goal>("awareness");
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [tone, setTone] = useState<Tone | null>(null);
  const [conceptCount, setConceptCount] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function useExample() {
    setProductName(EXAMPLE_BRIEF.productName);
    setProductDescription(EXAMPLE_BRIEF.productDescription);
    setAudience(EXAMPLE_BRIEF.audience);
    setGoal(EXAMPLE_BRIEF.goal);
    setPlatform(EXAMPLE_BRIEF.platform);
    setTone(EXAMPLE_BRIEF.tone);
    setConceptCount(EXAMPLE_BRIEF.conceptCount);
    setErrors({});
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (productName.trim().length < 1 || productName.length > 80) next.productName = "1 to 80 characters";
    if (productDescription.trim().length < 1 || productDescription.length > 300)
      next.productDescription = "1 to 300 characters";
    if (audience.trim().length < 1 || audience.length > 200) next.audience = "1 to 200 characters";
    if (!tone) next.tone = "Pick a tone";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate() || !tone) return;
    setSubmitting(true);
    try {
      const brief: Brief = {
        productName: productName.trim(),
        productDescription: productDescription.trim(),
        productImageUrl,
        audience: audience.trim(),
        goal,
        platform,
        tone,
        conceptCount,
      };
      const { campaign } = await api.post<{ campaign: { id: string } }>("/api/campaigns", { brief });
      router.push(`/campaigns/${campaign.id}?step=hooks`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create the campaign. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-4 py-8 pb-28 sm:pb-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">New campaign</h1>
        <button type="button" onClick={useExample} className="text-sm text-primary hover:underline">
          Use an example brief
        </button>
      </div>

      <Field label="Product name" error={errors.productName}>
        <Input
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="Habitly"
          maxLength={80}
        />
      </Field>

      <Field label="What it is" error={errors.productDescription}>
        <Textarea
          rows={2}
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          placeholder="One or two sentences about the product"
          maxLength={300}
        />
      </Field>

      <Field label="Product photo">
        <BriefPhotoDropzone value={productImageUrl} onChange={setProductImageUrl} />
        <p className="mt-1 text-xs text-muted-foreground">Recommended: videos will start from this photo.</p>
      </Field>

      <Field label="Audience" error={errors.audience}>
        <Input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="Students who keep dropping new habits"
          maxLength={200}
        />
      </Field>

      <Field label="Goal">
        <Segmented options={GOALS} value={goal} onChange={setGoal} />
      </Field>

      <Field label="Platform">
        <Segmented options={PLATFORMS} value={platform} onChange={setPlatform} />
      </Field>

      <Field label="Tone" error={errors.tone}>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTone(t.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                tone === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-2 text-foreground hover:border-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Number of variants">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setConceptCount((n) => Math.max(3, n - 1))}
            disabled={conceptCount <= 3}
            aria-label="Fewer variants"
          >
            -
          </Button>
          <span className="w-6 text-center text-sm font-medium">{conceptCount}</span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setConceptCount((n) => Math.min(6, n + 1))}
            disabled={conceptCount >= 6}
            aria-label="More variants"
          >
            +
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Drafts cost about {conceptCount * MODELS.fast.costCredits} credits
        </p>
      </Field>

      <div className="fixed inset-x-0 bottom-0 flex justify-end border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button size="lg" onClick={submit} disabled={submitting}>
          {submitting ? "Writing hooks..." : "Write hooks"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
