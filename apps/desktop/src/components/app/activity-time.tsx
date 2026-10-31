import { Text } from "@/components/ui";
import { useActivityTimeLabel } from "@/lib/relative-time";

export function AppActivityTime({ timestamp }: { timestamp: string }) {
  const activityTime = useActivityTimeLabel(timestamp);
  if (!activityTime) return null;
  return (
    <Text size="meta" tone="muted" className="min-w-0 tabular-nums">
      {activityTime.relative} · {activityTime.absolute}
    </Text>
  );
}
