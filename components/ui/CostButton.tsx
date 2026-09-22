"use client";

import { Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { cn } from "cn";
import type { VariantProps } from "class-variance-authority";

interface CostButtonProps extends VariantProps<typeof buttonVariants> {
  label: string;
  cost: number;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

export function CostButton({
  label, cost, onClick, loading, disabled, disabledReason, variant, size, className,
}: CostButtonProps) {
  const { data: workspace } = useWorkspace();
  const insufficientCredits = workspace ? workspace.credits < cost : false;
  const isDisabled = !!disabled || loading || insufficientCredits;
  const reason = disabledReason ?? (insufficientCredits ? "Not enough credits" : undefined);

  const button = (
    <Button
      variant={variant}
      size={size}
      disabled={isDisabled}
      onClick={onClick}
      className={cn("min-w-40", className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      <span>{label} &middot; {cost} credits</span>
    </Button>
  );

  if (isDisabled && reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
}
