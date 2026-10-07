import {
  DEFAULT_SCRIPT_RUN_SETTINGS,
  SCRIPT_RUN_HARD_MAX_AGENTS,
  SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS,
  type ScriptRunSettings,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingsGroup } from "@/components";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Text,
} from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";

function SettingNumberRow({
  id,
  title,
  description,
  value,
  min,
  max,
  placeholder,
  unit,
  onCommit,
}: {
  id: string;
  title: string;
  description: string;
  value: number | null;
  min: number;
  max?: number;
  placeholder?: string;
  unit?: string;
  onCommit(value: number | null): void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <label className="min-w-0 flex-1" htmlFor={id}>
        <Text as="div" weight="medium">
          {title}
        </Text>
        <Text as="div" className="mt-0.5" tone="muted">
          {description}
        </Text>
      </label>
      <InputGroup className="w-24 shrink-0">
        <InputGroupInput
          className="text-end tabular-nums"
          id={id}
          max={max}
          min={min}
          onBlur={() => onCommit(draft.trim() ? Number(draft) : null)}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          type="number"
          value={draft}
        />
        {unit ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </div>
  );
}

export function ScriptRunSettingsSection() {
  const { t } = useTranslation("settings");
  const [settings, setSettings] = useState<ScriptRunSettings | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    void desktopApi.getScriptRunSettings().then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  });

  if (!settings) return null;

  const save = async (patch: Partial<ScriptRunSettings>) => {
    try {
      setSettings(
        await desktopApi.saveScriptRunSettings({ ...settings, ...patch }),
      );
    } catch {
      toast.error(t("teams.scriptRuns.saveFailed"));
    }
  };

  return (
    <SettingsGroup
      description={t("teams.scriptRuns.description")}
      title={t("teams.scriptRuns.title")}
    >
      <SettingNumberRow
        description={t("teams.scriptRuns.defaultMaxAgentsDescription")}
        id="script-run-default-max-agents"
        key={`agents-${settings.defaultMaxAgents}`}
        max={SCRIPT_RUN_HARD_MAX_AGENTS}
        min={1}
        onCommit={(value) =>
          void save({
            defaultMaxAgents:
              value ?? DEFAULT_SCRIPT_RUN_SETTINGS.defaultMaxAgents,
          })
        }
        title={t("teams.scriptRuns.defaultMaxAgents")}
        value={settings.defaultMaxAgents}
      />
      <SettingNumberRow
        description={t("teams.scriptRuns.schemaMaxAttemptsDescription")}
        id="script-run-schema-attempts"
        key={`attempts-${settings.schemaMaxAttempts}`}
        max={SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS}
        min={1}
        onCommit={(value) =>
          void save({
            schemaMaxAttempts:
              value ?? DEFAULT_SCRIPT_RUN_SETTINGS.schemaMaxAttempts,
          })
        }
        title={t("teams.scriptRuns.schemaMaxAttempts")}
        value={settings.schemaMaxAttempts}
      />
      <SettingNumberRow
        description={t("teams.scriptRuns.maxDurationDescription")}
        id="script-run-max-duration"
        key={`duration-${settings.maxDurationMinutes}`}
        min={1}
        onCommit={(value) => void save({ maxDurationMinutes: value })}
        placeholder={t("teams.scriptRuns.unlimited")}
        title={t("teams.scriptRuns.maxDuration")}
        unit={t("teams.scriptRuns.minutes")}
        value={settings.maxDurationMinutes}
      />
    </SettingsGroup>
  );
}
