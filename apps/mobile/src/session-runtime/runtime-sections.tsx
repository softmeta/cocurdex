import type {
  SessionRuntimeAxes,
  SessionRuntimeSelection,
} from "@cocurdex/shared";
import { type OpenOptionSheet, ValueFormRow } from "@/ui";
import {
  effortChoiceLabel,
  thinkingOptionLabel,
  useRuntimeLabels,
} from "./runtime-labels";

export interface RuntimeChoice {
  key: string;
  label: string;
  supporting?: string | null;
  selected: boolean;
  onPress(): void;
}

export function ChoiceRow({
  title,
  testIDPrefix,
  choices,
  open,
  unsetLabel,
  disabled = false,
}: {
  title: string;
  testIDPrefix: string;
  choices: readonly RuntimeChoice[];
  open: OpenOptionSheet;
  unsetLabel: string;
  disabled?: boolean;
}) {
  const selected = choices.find((choice) => choice.selected);
  return (
    <ValueFormRow
      testID={testIDPrefix}
      label={title}
      value={selected?.label ?? unsetLabel}
      onPress={() =>
        open({
          title,
          items: choices.map((choice) => ({
            key: choice.key,
            testID: `${testIDPrefix}-${choice.key}`,
            label: choice.label,
            supporting: choice.supporting ?? undefined,
            selected: choice.selected,
            onPress: disabled ? () => undefined : choice.onPress,
          })),
        })
      }
    />
  );
}

export function RuntimeRows({
  axes,
  onChange,
  open,
}: {
  axes: SessionRuntimeAxes;
  onChange(patch: SessionRuntimeSelection): void;
  open: OpenOptionSheet;
}) {
  const labels = useRuntimeLabels();
  const { thinking, effort, speed, fastMode, openCode } = axes;
  return (
    <>
      {thinking ? (
        <ChoiceRow
          open={open}
          unsetLabel={labels.defaultValue}
          title={labels.thinking}
          testIDPrefix="runtime-thinking"
          choices={thinking.options.map((option) => ({
            key: option.level,
            label: thinkingOptionLabel(option, labels),
            supporting: option.description,
            selected: option.level === thinking.selected,
            onPress: () => onChange({ thinkingLevel: option.level }),
          }))}
        />
      ) : null}
      {effort ? (
        <ChoiceRow
          open={open}
          unsetLabel={labels.defaultValue}
          title={labels.thinking}
          testIDPrefix="runtime-effort"
          choices={effort.options.map((option) => ({
            key: option.effort,
            label: effortChoiceLabel(option, labels),
            supporting: option.description,
            selected: option.effort === effort.selected,
            onPress: () => onChange({ reasoningEffort: option.effort }),
          }))}
        />
      ) : null}
      {speed ? (
        <ChoiceRow
          open={open}
          unsetLabel={labels.defaultValue}
          title={labels.speed}
          testIDPrefix="runtime-speed"
          choices={[
            {
              key: "standard",
              label: labels.standard,
              selected: speed.selected === null,
              onPress: () => onChange({ serviceTier: null }),
            },
            ...speed.tiers.map((tier) => ({
              key: tier.id,
              label: tier.name,
              supporting: tier.description,
              selected: tier.id === speed.selected,
              onPress: () => onChange({ serviceTier: tier.id }),
            })),
          ]}
        />
      ) : null}
      {fastMode === null ? null : (
        <ChoiceRow
          open={open}
          unsetLabel={labels.defaultValue}
          title={labels.fastMode}
          testIDPrefix="runtime-fast"
          choices={[true, false].map((on) => ({
            key: on ? "on" : "off",
            label: on ? labels.on : labels.off,
            selected: fastMode === on,
            onPress: () => onChange({ fastMode: on }),
          }))}
        />
      )}
      {openCode && openCode.agents.length > 0 ? (
        <ChoiceRow
          open={open}
          unsetLabel={labels.defaultValue}
          title={labels.openCodeAgent}
          testIDPrefix="runtime-opencode-agent"
          choices={openCode.agents.map((agent) => ({
            key: agent,
            label: agent,
            selected: agent === openCode.agent,
            onPress: () => onChange({ openCodeAgent: agent }),
          }))}
        />
      ) : null}
      {openCode && openCode.variants.length > 0 ? (
        <ChoiceRow
          open={open}
          unsetLabel={labels.defaultValue}
          title={labels.openCodeVariant}
          testIDPrefix="runtime-opencode-variant"
          choices={[
            {
              key: "default",
              label: labels.defaultValue,
              selected: openCode.variant === "",
              onPress: () => onChange({ openCodeVariant: null }),
            },
            ...openCode.variants.map((variant) => ({
              key: variant,
              label: variant,
              selected: variant === openCode.variant,
              onPress: () => onChange({ openCodeVariant: variant }),
            })),
          ]}
        />
      ) : null}
    </>
  );
}
