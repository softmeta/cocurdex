import {
  AGENT_ROLE_AVATAR_COLORS,
  type AgentRoleAvatar as AgentRoleAvatarValue,
  normalizeAgentRoleAvatar,
} from "@cocurdex/shared";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  AgentRoleAvatar,
  type AgentRoleAvatarSource,
} from "./agent-role-avatar";
import {
  AGENT_ROLE_AVATAR_EMOJI_GROUPS,
  type AgentRoleAvatarEmojiGroupId,
  agentRoleAvatarSwatchClassName,
  defaultAgentRoleAvatarColor,
} from "./agent-role-avatar-style";

export function AgentRoleAvatarPicker({
  role,
  onChange,
}: {
  role: AgentRoleAvatarSource;
  onChange(avatar: AgentRoleAvatarValue | null): void;
}) {
  const { t } = useTranslation("sessions");
  const avatar = role.avatar;
  const color = avatar?.color ?? defaultAgentRoleAvatarColor(role.id);
  const selectedEmoji = avatar?.kind === "emoji" ? avatar.emoji : null;

  const selectEmoji = (emoji: string) => {
    const next = normalizeAgentRoleAvatar({ kind: "emoji", emoji, color });
    if (next) {
      onChange(next);
    }
  };

  const selectColor = (nextColor: AgentRoleAvatarValue["color"]) => {
    onChange(
      selectedEmoji
        ? { kind: "emoji", emoji: selectedEmoji, color: nextColor }
        : { kind: "initial", color: nextColor },
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t("agentRole.avatar.change")}
          className="shrink-0 cursor-pointer rounded-full outline-none transition-shadow hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <AgentRoleAvatar role={role} size="lg" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-3 rounded-card p-3">
        <AvatarEmojiGrid selectedEmoji={selectedEmoji} onSelect={selectEmoji} />
        <Input
          aria-label={t("agentRole.avatar.custom")}
          placeholder={t("agentRole.avatar.customPlaceholder")}
          onChange={(event) => selectEmoji(event.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <Text size="meta" tone="muted">
            {t("agentRole.avatar.color")}
          </Text>
          <div className="flex items-center gap-1.5">
            {AGENT_ROLE_AVATAR_COLORS.map((swatch) => (
              <button
                key={swatch}
                aria-label={swatch}
                aria-pressed={swatch === color}
                className={cn(
                  "size-5 cursor-pointer rounded-full outline-none ring-offset-2 ring-offset-popover focus-visible:ring-2 focus-visible:ring-ring",
                  agentRoleAvatarSwatchClassName[swatch],
                  swatch === color && "ring-2 ring-foreground/60",
                )}
                type="button"
                onClick={() => selectColor(swatch)}
              />
            ))}
          </div>
        </div>
        {avatar ? (
          <Button
            className="self-start"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onChange(null)}
          >
            <RotateCcw className="size-3.5" />
            {t("agentRole.avatar.reset")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function AvatarEmojiGrid({
  selectedEmoji,
  onSelect,
}: {
  selectedEmoji: string | null;
  onSelect(emoji: string): void;
}) {
  const { t } = useTranslation("sessions");
  const groupLabels: Record<AgentRoleAvatarEmojiGroupId, string> = {
    people: t("agentRole.avatar.groups.people"),
    animals: t("agentRole.avatar.groups.animals"),
    symbols: t("agentRole.avatar.groups.symbols"),
    work: t("agentRole.avatar.groups.work"),
  };

  return (
    <div className="-mx-1 flex max-h-64 flex-col overflow-y-auto px-1">
      {AGENT_ROLE_AVATAR_EMOJI_GROUPS.map((group) => (
        <section key={group.id} aria-label={groupLabels[group.id]}>
          <Text
            as="h3"
            className="sticky top-0 bg-popover pt-1 pb-1.5"
            size="meta"
            tone="muted"
          >
            {groupLabels[group.id]}
          </Text>
          <div className="grid grid-cols-8 gap-1 pb-2">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                aria-pressed={emoji === selectedEmoji}
                className={cn(
                  "inline-flex size-8 cursor-pointer items-center justify-center rounded-control text-avatar-emoji-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                  emoji === selectedEmoji && "bg-accent",
                )}
                type="button"
                onClick={() => onSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
