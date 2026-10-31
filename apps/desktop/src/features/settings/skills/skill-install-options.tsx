import { skillLinkAgentsForScope } from "@cocurdex/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Checkbox,
  Label,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { SHARED_AGENT_NAMES, SKILL_AGENT_NAMES } from "./skill-agent-names";
import { SkillScriptWarning } from "./skill-files-section";
import type { SkillInstallChoice } from "./skill-library-model";

export function SkillInstallOptions({
  choice,
  disabled,
  scriptCount,
  workspaceName,
  onChange,
}: {
  choice: SkillInstallChoice;
  disabled: boolean;
  scriptCount: number;
  workspaceName: string | null;
  onChange(choice: SkillInstallChoice): void;
}) {
  const { t } = useTranslation("settings");
  const idPrefix = useId();
  const linkable = skillLinkAgentsForScope(choice.scope);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Text size="meta" tone="muted" weight="medium">
          {t("skills.install.scope")}
        </Text>
        <ToggleGroup
          aria-label={t("skills.install.scope")}
          disabled={disabled}
          spacing={0.5}
          type="single"
          value={choice.scope}
          variant="segmented"
          onValueChange={(value) => {
            if (value === "global" || value === "workspace") {
              onChange({ scope: value, agents: choice.agents });
            }
          }}
        >
          <ToggleGroupItem value="global">
            {t("skills.install.global")}
          </ToggleGroupItem>
          {workspaceName ? (
            <ToggleGroupItem value="workspace">
              {t("skills.install.workspace", { workspace: workspaceName })}
            </ToggleGroupItem>
          ) : null}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <Text size="meta" tone="muted" weight="medium">
          {t("skills.install.agents")}
        </Text>
        <Text size="meta" tone="muted">
          {t("skills.install.sharedAgents", {
            agents: SHARED_AGENT_NAMES.join(" · "),
          })}
        </Text>
        {linkable.map((agent) => {
          const id = `${idPrefix}-${agent}`;
          return (
            <Label className="flex items-center gap-2" htmlFor={id} key={agent}>
              <Checkbox
                checked={choice.agents.includes(agent)}
                disabled={disabled}
                id={id}
                onCheckedChange={(checked) =>
                  onChange({
                    scope: choice.scope,
                    agents:
                      checked === true
                        ? [...choice.agents, agent]
                        : choice.agents.filter((item) => item !== agent),
                  })
                }
              />
              <Text size="body">
                {t("skills.install.linkAgent", {
                  agent: SKILL_AGENT_NAMES[agent],
                })}
              </Text>
            </Label>
          );
        })}
      </div>
      <SkillScriptWarning count={scriptCount} />
    </div>
  );
}
