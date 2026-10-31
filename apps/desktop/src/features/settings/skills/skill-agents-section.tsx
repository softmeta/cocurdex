import type {
  InstalledSkill,
  SkillAgentVisibility,
  SkillLinkAgent,
} from "@cocurdex/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Button, Label, Switch, Text } from "@/components/ui";
import { SHARED_AGENT_NAMES, SKILL_AGENT_NAMES } from "./skill-agent-names";

function LinkAgentRow({
  disabled,
  visibility,
  onToggle,
}: {
  disabled: boolean;
  visibility: SkillAgentVisibility & { agent: SkillLinkAgent };
  onToggle(agent: SkillLinkAgent, enabled: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const switchId = useId();
  const descriptionId = useId();
  const name = SKILL_AGENT_NAMES[visibility.agent];
  const visible = visibility.access !== "none";
  return (
    <div
      className="flex items-center justify-between gap-6 py-3"
      data-skill-agent={visibility.agent}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <Label htmlFor={switchId}>
          <Text size="body" weight="medium">
            {name}
          </Text>
        </Label>
        <Text className="break-all" id={descriptionId} size="meta" tone="muted">
          {t(`skills.agents.access.${visibility.access}`, {
            path: visibility.path ?? "",
          })}
        </Text>
      </div>
      <Switch
        aria-describedby={descriptionId}
        checked={visible}
        disabled={disabled || !visibility.toggleable}
        id={switchId}
        onCheckedChange={(enabled) => onToggle(visibility.agent, enabled)}
      />
    </div>
  );
}

export function SkillAgentsSection({
  disabled,
  skill,
  onShare,
  onToggle,
}: {
  disabled: boolean;
  skill: InstalledSkill;
  onShare(): void;
  onToggle(agent: SkillLinkAgent, enabled: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const shared = skill.agents.find((agent) => agent.agent === "shared");
  const linked = skill.agents.filter(
    (agent): agent is SkillAgentVisibility & { agent: SkillLinkAgent } =>
      agent.agent !== "shared",
  );
  const isShared = shared?.access === "native";

  return (
    <SettingsGroup title={t("skills.agents.title")}>
      <div
        className="flex items-center justify-between gap-6 py-3"
        data-skill-agent="shared"
      >
        <div className="min-w-0 flex-1">
          <Text as="div" size="body" weight="medium">
            {SHARED_AGENT_NAMES.join(" · ")}
          </Text>
          <Text as="div" className="mt-0.5 break-all" size="meta" tone="muted">
            {isShared
              ? t("skills.agents.sharedNative", { path: shared?.path ?? "" })
              : t("skills.agents.sharedMissing", { path: skill.path })}
          </Text>
        </div>
        {isShared ? null : (
          <Button
            disabled={disabled}
            size="sm"
            variant="outline"
            onClick={onShare}
          >
            {t("skills.agents.share")}
          </Button>
        )}
      </div>
      {linked.map((visibility) => (
        <LinkAgentRow
          disabled={disabled}
          key={visibility.agent}
          visibility={visibility}
          onToggle={onToggle}
        />
      ))}
    </SettingsGroup>
  );
}
