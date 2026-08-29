import { Text } from "@/components/ui";
import { cn } from "@/lib";

interface SlashCommandPreviewProps {
  description: string;
  tone?: "chat" | "welcome";
}

export function SlashCommandPreview({
  description,
  tone = "chat",
}: SlashCommandPreviewProps) {
  const panelClassName =
    tone === "welcome"
      ? "border-welcome-border/60 bg-welcome-surface/95 text-welcome-fg-secondary backdrop-blur-md"
      : "border-chat-border-soft bg-chat-surface-raised/95 text-chat-fg backdrop-blur-md";
  const bodyClassName =
    tone === "welcome" ? "text-welcome-fg-muted" : "text-chat-fg-muted";

  return (
    <div
      className={cn(
        "w-72 shrink-0 rounded-card border p-2.5 shadow-chat-soft",
        panelClassName,
      )}
    >
      <Text
        as="p"
        className={cn("whitespace-pre-wrap break-words", bodyClassName)}
        size="meta"
      >
        {description}
      </Text>
    </div>
  );
}
