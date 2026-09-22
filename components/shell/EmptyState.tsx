import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  text: string;
  actionLabel: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, text, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[var(--radius)] border border-dashed border-border px-6 py-16 text-center">
      <Icon className="size-10 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {actionHref ? (
        <Button asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
