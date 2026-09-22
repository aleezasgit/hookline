"use client";

import { Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/lib/hooks/use-workspace";

export function CreditsPill() {
  const { data } = useWorkspace();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium">
          <Zap className="size-3.5 fill-primary text-primary" />
          <span>{data ? data.credits : "--"} credits</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>Demo credits. Every visitor starts with 300.</TooltipContent>
    </Tooltip>
  );
}
