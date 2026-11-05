import {
  AGENT_ROLE_AVATAR_COLORS,
  AGENT_ROLE_AVATAR_FACES,
  AGENT_ROLE_AVATAR_SHAPES,
  type AgentRoleAvatarColor,
  type AgentRoleAvatarFace,
  type AgentRoleAvatarShape,
  type AgentRoleAvatar as AgentRoleAvatarValue,
  normalizeAgentRoleAvatar,
  resolveAgentRoleAvatar,
} from "@cocurdex/shared";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
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
import { AgentRoleAvatar, type AvatarSource } from "./agent-role-avatar";
import { AgentRoleAvatarShapeGlyph } from "./agent-role-avatar-shape";
import {
  AGENT_ROLE_AVATAR_EMOJI_GROUPS,
  type AgentRoleAvatarEmojiGroupId,
  agentRoleAvatarSwatchClassName,
} from "./agent-role-avatar-style";

export function AgentRoleAvatarPicker({
  placeholder,
  role,
  onChange,
}: {
  placeholder?: ReactNode;
  role: AvatarSource;
  onChange(avatar: AgentRoleAvatarValue | null): void;
}) {
  const { t } = useTranslation("sessions");
  const avatar = role.avatar;
  const current = resolveAgentRoleAvatar(role);
  const color = current.color;

  const selectEmoji = (emoji: string) => {
    const next = normalizeAgentRoleAvatar({ kind: "emoji", emoji, color });
    if (next) {
      onChange(next);
    }
  };

  const shapeAvatar = current.kind === "shape" ? current : null;
  const face = shapeAvatar?.face ?? "dots";
  const shape = shapeAvatar?.shape ?? AGENT_ROLE_AVATAR_SHAPES[0];

  const selectShape = (nextShape: AgentRoleAvatarShape) => {
    onChange({ kind: "shape", shape: nextShape, face, color });
  };

  const selectFace = (nextFace: AgentRoleAvatarFace) => {
    onChange({ kind: "shape", shape, face: nextFace, color });
  };

  const selectColor = (nextColor: AgentRoleAvatarColor) => {
    onChange({ ...current, color: nextColor });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t("agentRole.avatar.change")}
          className="shrink-0 cursor-pointer rounded-full outline-none transition-shadow hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <AgentRoleAvatar placeholder={placeholder} role={role} size="lg" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-3 rounded-card p-3">
        <AvatarShapeGrid
          color={color}
          face={face}
          selectedShape={shapeAvatar?.shape ?? null}
          onSelect={selectShape}
        />
        <AvatarFaceRow
          color={color}
          selectedFace={shapeAvatar?.face ?? null}
          shape={shape}
          onSelect={selectFace}
        />
        <AvatarEmojiGrid
          selectedEmoji={current.kind === "emoji" ? current.emoji : null}
          onSelect={selectEmoji}
        />
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

function AvatarShapeGrid({
  color,
  face,
  selectedShape,
  onSelect,
}: {
  color: AgentRoleAvatarColor;
  face: AgentRoleAvatarFace;
  selectedShape: AgentRoleAvatarShape | null;
  onSelect(shape: AgentRoleAvatarShape): void;
}) {
  const { t } = useTranslation("sessions");
  const label = t("agentRole.avatar.shapes");

  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <Text as="h3" size="meta" tone="muted">
        {label}
      </Text>
      <div className="grid grid-cols-5 gap-1">
        {AGENT_ROLE_AVATAR_SHAPES.map((shape, index) => (
          <button
            key={shape}
            aria-label={t("agentRole.avatar.shape", { index: index + 1 })}
            aria-pressed={shape === selectedShape}
            className={cn(
              "inline-flex size-9 cursor-pointer items-center justify-center rounded-control p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
              shape === selectedShape && "bg-accent",
            )}
            type="button"
            onClick={() => onSelect(shape)}
          >
            <AgentRoleAvatarShapeGlyph
              color={color}
              face={face}
              shape={shape}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function AvatarFaceRow({
  color,
  selectedFace,
  shape,
  onSelect,
}: {
  color: AgentRoleAvatarColor;
  selectedFace: AgentRoleAvatarFace | null;
  shape: AgentRoleAvatarShape;
  onSelect(face: AgentRoleAvatarFace): void;
}) {
  const { t } = useTranslation("sessions");
  const label = t("agentRole.avatar.faces");
  const faceLabels: Record<AgentRoleAvatarFace, string> = {
    dots: t("agentRole.avatar.face.dots"),
    happy: t("agentRole.avatar.face.happy"),
    wink: t("agentRole.avatar.face.wink"),
    sleepy: t("agentRole.avatar.face.sleepy"),
    curious: t("agentRole.avatar.face.curious"),
  };

  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <Text as="h3" size="meta" tone="muted">
        {label}
      </Text>
      <div className="grid grid-cols-5 gap-1">
        {AGENT_ROLE_AVATAR_FACES.map((face) => (
          <button
            key={face}
            aria-label={faceLabels[face]}
            aria-pressed={face === selectedFace}
            className={cn(
              "inline-flex size-9 cursor-pointer items-center justify-center rounded-control p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
              face === selectedFace && "bg-accent",
            )}
            type="button"
            onClick={() => onSelect(face)}
          >
            <AgentRoleAvatarShapeGlyph
              color={color}
              face={face}
              shape={shape}
            />
          </button>
        ))}
      </div>
    </section>
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
