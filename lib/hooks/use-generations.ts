import useSWR, { mutate as globalMutate } from "swr";
import { fetcher } from "@/lib/api";
import { isActive } from "@/lib/types";
import type { Generation } from "@/lib/types";
import { useReconnectStreak } from "./use-reconnect";

export const useGenerations = (filter: string) => {
  const reconnect = useReconnectStreak();
  const result = useSWR<{ generations: Generation[] }>(`/api/generations?filter=${filter}&limit=60`, fetcher, {
    refreshInterval: (d) => (d?.generations.some((g) => isActive(g.status)) ? reconnect.pollMs : 0),
    onSuccess: () => {
      reconnect.onSuccess();
      // A generation can fail (timeout, a provider error) and refund credits
      // purely from background polling, with no user action to hang a
      // mutate("/api/workspace") off of. Checking the freshly-fetched data
      // itself is too late: the exact poll that discovers a failure already
      // reports it as no longer active. Revalidating on every successful
      // fetch (this hook only ever polls while something IS active, so the
      // "nothing was happening" case barely calls this at all) is simpler
      // and correct instead of trying to diff previous vs. new state.
      globalMutate("/api/workspace");
    },
    onError: reconnect.onError,
  });
  return { ...result, reconnecting: reconnect.reconnecting };
};
