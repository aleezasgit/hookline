import useSWR from "swr";
import { fetcher } from "@/lib/api";

export const useWorkspace = () => useSWR<{ id: string; credits: number }>("/api/workspace", fetcher);
