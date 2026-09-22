import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PresetCard } from "@/components/explore/PresetCard";
import { PRESETS } from "@/config/presets";
import type { PresetCategory } from "@/lib/types";

const TABS: { key: PresetCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "camera", label: "Camera" },
  { key: "effects", label: "Effects" },
  { key: "ugc", label: "UGC" },
];

export default function ExplorePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:py-14">
      <section className="flex flex-col items-start gap-4">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Turn one photo into scroll-stopping video
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
          Pick a visual preset to make a single clip, or brief a campaign to get several
          native-feeling hooks reviewed by AI and approved by you.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/create">Create a video</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/campaigns/new">Start a campaign</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <Tabs defaultValue="all">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
                {PRESETS.filter((p) => t.key === "all" || p.category === t.key).map((p) => (
                  <PresetCard key={p.key} preset={p} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}
