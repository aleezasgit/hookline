import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/api";
import { isActive } from "@/lib/types";
import type { CampaignView } from "@/lib/types";
import { useReconnectStreak } from "./use-reconnect";

export const useCampaign = (id: string) => {
  const reconnect = useReconnectStreak();
  const result = useSWR<CampaignView>(`/api/campaigns/${id}`, fetcher, {
    refreshInterval: (d) =>
      d && (d.campaign.conceptsStatus === "generating" ||
            d.concepts.some((c) => (c.latest && isActive(c.latest.status)) || (c.final && isActive(c.final.status))))
        ? reconnect.pollMs : 0,
    onSuccess: () => {
      reconnect.onSuccess();
      // Same reasoning as use-generations.ts: a batch item or a Pro render can
      // fail and refund purely from background polling. Revalidate credits on
      // every successful fetch rather than diffing previous vs. new state.
      globalMutate("/api/workspace");
    },
    onError: reconnect.onError,
  });
  return { ...result, reconnecting: reconnect.reconnecting };
};
