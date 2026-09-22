import { cn } from "cn";

interface ScorePillProps {
  label: string;
  score: number;
  className?: string;
}

export function ScorePill({ label, score, className }: ScorePillProps) {
  const tone =
    score >= 4
      ? "border-success/30 bg-success/10 text-success"
      : score === 3
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-danger/30 bg-danger/10 text-danger";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      {label} {score}/5
    </span>
  );
}
