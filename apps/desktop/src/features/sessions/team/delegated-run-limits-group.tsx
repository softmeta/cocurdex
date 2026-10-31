import {
  AGENT_RUN_LIMIT_BOUNDS,
  type AgentRunLimits,
  parseAgentRunLimits,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  SettingNumberInput,
  SettingRow,
  SettingsGroup,
} from "@/components/app";
import { desktopApi, useMountEffect } from "@/lib";

type RunLimitField = keyof AgentRunLimits;

type RunLimitDrafts = Record<RunLimitField, string>;

const EMPTY_DRAFTS: RunLimitDrafts = {
  maxConcurrentRuns: "",
  maxConcurrentRunsPerAgent: "",
  delegatedRunTimeoutMinutes: "",
};

function draftsFrom(limits: AgentRunLimits): RunLimitDrafts {
  return {
    maxConcurrentRuns: String(limits.maxConcurrentRuns),
    maxConcurrentRunsPerAgent: String(limits.maxConcurrentRunsPerAgent),
    delegatedRunTimeoutMinutes:
      limits.delegatedRunTimeoutMinutes === null
        ? ""
        : String(limits.delegatedRunTimeoutMinutes),
  };
}

function limitsFrom(drafts: RunLimitDrafts): AgentRunLimits | null {
  const timeout = drafts.delegatedRunTimeoutMinutes.trim();
  return parseAgentRunLimits({
    maxConcurrentRuns: Number(drafts.maxConcurrentRuns),
    maxConcurrentRunsPerAgent: Number(drafts.maxConcurrentRunsPerAgent),
    delegatedRunTimeoutMinutes: timeout === "" ? null : Number(timeout),
  });
}

function RunLimitInput({
  disabled,
  field,
  label,
  onChange,
  onCommit,
  placeholder,
  unit,
  value,
}: {
  disabled: boolean;
  field: RunLimitField;
  label: string;
  onChange: (field: RunLimitField, value: string) => void;
  onCommit: () => void;
  placeholder?: string;
  unit?: string;
  value: string;
}) {
  const bounds = AGENT_RUN_LIMIT_BOUNDS[field];
  return (
    <SettingNumberInput
      aria-label={label}
      disabled={disabled}
      max={bounds.max}
      min={bounds.min}
      onChange={(event) => onChange(field, event.target.value)}
      onCommit={onCommit}
      placeholder={placeholder}
      step={1}
      type="number"
      unit={unit}
      value={value}
    />
  );
}

export function DelegatedRunLimitsGroup() {
  const { t } = useTranslation("settings");
  const [saved, setSaved] = useState<AgentRunLimits | null>(null);
  const [drafts, setDrafts] = useState<RunLimitDrafts | null>(null);

  useMountEffect(() => {
    void desktopApi.getAgentRunLimits().then((limits) => {
      setSaved(limits);
      setDrafts(draftsFrom(limits));
    });
  });

  const change = (field: RunLimitField, value: string) => {
    setDrafts((current) =>
      current ? { ...current, [field]: value } : current,
    );
  };

  const commit = async () => {
    if (!drafts || !saved) return;
    const next = limitsFrom(drafts);
    if (!next) {
      toast.error(t("teams.runLimits.invalid"));
      setDrafts(draftsFrom(saved));
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(saved)) return;
    try {
      const stored = await desktopApi.setAgentRunLimits(next);
      setSaved(stored);
      setDrafts(draftsFrom(stored));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("teams.runLimits.saveFailed"),
      );
      setDrafts(draftsFrom(saved));
    }
  };

  const disabled = drafts === null;
  const values = drafts ?? EMPTY_DRAFTS;

  return (
    <SettingsGroup
      description={t("teams.runLimits.description")}
      title={t("teams.runLimits.title")}
    >
      <SettingRow
        description={t("teams.runLimits.maxConcurrentRuns.description")}
        title={t("teams.runLimits.maxConcurrentRuns.title")}
      >
        <RunLimitInput
          disabled={disabled}
          field="maxConcurrentRuns"
          label={t("teams.runLimits.maxConcurrentRuns.title")}
          onChange={change}
          onCommit={() => void commit()}
          value={values.maxConcurrentRuns}
        />
      </SettingRow>
      <SettingRow
        description={t("teams.runLimits.maxConcurrentRunsPerAgent.description")}
        title={t("teams.runLimits.maxConcurrentRunsPerAgent.title")}
      >
        <RunLimitInput
          disabled={disabled}
          field="maxConcurrentRunsPerAgent"
          label={t("teams.runLimits.maxConcurrentRunsPerAgent.title")}
          onChange={change}
          onCommit={() => void commit()}
          value={values.maxConcurrentRunsPerAgent}
        />
      </SettingRow>
      <SettingRow
        description={t("teams.runLimits.timeout.description")}
        title={t("teams.runLimits.timeout.title")}
      >
        <RunLimitInput
          disabled={disabled}
          field="delegatedRunTimeoutMinutes"
          label={t("teams.runLimits.timeout.title")}
          onChange={change}
          onCommit={() => void commit()}
          placeholder={t("teams.runLimits.timeout.none")}
          unit={t("teams.scriptRuns.minutes")}
          value={values.delegatedRunTimeoutMinutes}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
