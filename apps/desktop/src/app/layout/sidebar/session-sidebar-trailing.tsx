import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Text } from "@/components/ui";
import { useCompactAgeLabel } from "@/lib/relative-time";

function SessionStatusIndicator({
  needsAttention,
  isRunning,
}: {
  isRunning: boolean;
  needsAttention: boolean;
}) {
  const { t } = useTranslation("sessions");

  if (!(needsAttention || isRunning)) {
    return null;
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {needsAttention ? (
        <span
          className="sidebar-activity-dot size-1.5 rounded-full text-chat-status-pending-fg"
          role="img"
          aria-label={t("sidebar.pendingAttention")}
        />
      ) : (
        <span aria-label={t("sidebar.running")} role="img">
          <CocurdexMark className="size-4" motion="working" />
        </span>
      )}
    </span>
  );
}

function SessionAgeLabel({ timestamp }: { timestamp: string }) {
  const label = useCompactAgeLabel(timestamp);
  return (
    <Text
      size="meta"
      className="shrink-0 text-sidebar-fg-subtle tabular-nums @max-[13rem]/sidebar:hidden"
    >
      {label}
    </Text>
  );
}

function SessionUnreadDot() {
  const { t } = useTranslation("sessions");

  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-sidebar-primary"
      role="img"
      aria-label={t("sidebar.unread")}
    />
  );
}

export function SessionTrailing({
  isRunning,
  isUnread,
  needsAttention,
  showTimestamp,
  timestamp,
}: {
  isRunning: boolean;
  isUnread: boolean;
  needsAttention: boolean;
  showTimestamp: boolean;
  timestamp: string;
}) {
  if (needsAttention || isRunning) {
    return (
      <SessionStatusIndicator
        isRunning={isRunning}
        needsAttention={needsAttention}
      />
    );
  }
  if (isUnread) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <SessionUnreadDot />
        {showTimestamp ? <SessionAgeLabel timestamp={timestamp} /> : null}
      </span>
    );
  }
  return showTimestamp ? <SessionAgeLabel timestamp={timestamp} /> : null;
}
