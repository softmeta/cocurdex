import type { ConversationUsage } from "@cocurdex/shared";

function formatTokenCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
}

function formatDurationMs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatTokenUsage(usage: ConversationUsage) {
  const parts = [];
  if (usage.inputTokens && usage.inputTokens > 0) {
    parts.push(`↑${formatTokenCount(usage.inputTokens)}`);
  }
  if (usage.outputTokens && usage.outputTokens > 0) {
    parts.push(`↓${formatTokenCount(usage.outputTokens)}`);
  }
  if (usage.costUsd && usage.costUsd > 0) {
    parts.push(`$${usage.costUsd.toFixed(3)}`);
  }
  return parts.join(" ");
}

export function formatUsage(usage: ConversationUsage | null) {
  if (!usage) {
    return null;
  }

  const tokenUsage = formatTokenUsage(usage);
  const parts = [];
  if (usage.durationMs && usage.durationMs > 0) {
    parts.push(formatDurationMs(usage.durationMs));
  }
  if (tokenUsage) {
    parts.push(tokenUsage);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
