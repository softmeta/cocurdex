import { cn } from "@/lib";

export type AppStatusTone =
  | "success"
  | "attention"
  | "danger"
  | "muted"
  | "faint";

export function AppStatusDot({
  label,
  tone,
}: {
  label: string;
  tone: AppStatusTone;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        {
          success: "bg-status-success",
          attention: "bg-status-attention",
          danger: "bg-destructive",
          muted: "bg-muted-foreground/40",
          faint: "bg-muted-foreground/20",
        }[tone],
      )}
      role="img"
      title={label}
    />
  );
}
