"use client";

import Link from "next/link";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shell/EmptyState";
import { fetcher } from "@/lib/api";
import type { CampaignSummary } from "@/lib/types";

export default function CampaignsPage() {
  const { data, isLoading, error } = useSWR<{ campaigns: CampaignSummary[] }>("/api/campaigns", fetcher);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Campaigns</h1>
        <Button asChild>
          <Link href="/campaigns/new">New campaign</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-[var(--radius)] bg-surface-2" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Could not load your campaigns.</p>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </div>
      ) : !data || data.campaigns.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          text="Brief once, get several native video hooks, review them fast."
          actionLabel="Start a campaign"
          actionHref="/campaigns/new"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-4 transition-colors hover:border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="aspect-[16/9] overflow-hidden rounded-md bg-gradient-to-br from-surface-2 to-black">
                {c.productImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.productImageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {c.approvedCount} approved of {c.conceptCount}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
