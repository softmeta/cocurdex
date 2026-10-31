import type { AgentSessionConfigOption } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { ChoiceRow, type RuntimeChoice } from "@/session-runtime";
import type { OpenOptionSheet } from "@/ui";

function optionChoices(
  option: AgentSessionConfigOption,
  labels: { on: string; off: string },
  onChange: (value: boolean | string) => void,
): RuntimeChoice[] {
  if (option.type === "boolean") {
    return [true, false].map((on) => ({
      key: on ? "on" : "off",
      label: on ? labels.on : labels.off,
      selected: option.currentValue === on,
      onPress: () => onChange(on),
    }));
  }
  return (option.options ?? []).map((item) => ({
    key: item.value,
    label: item.name || item.value,
    supporting: item.description,
    selected: item.value === option.currentValue,
    onPress: () => onChange(item.value),
  }));
}

export function ConfigOptionRows({
  options,
  onChange,
  open,
}: {
  open: OpenOptionSheet;
  options: readonly AgentSessionConfigOption[];
  onChange(configId: string, value: boolean | string): void;
}) {
  const { t } = useTranslation("sessions");
  const labels = { on: t("runtime.on"), off: t("runtime.off") };
  return (
    <>
      {options.map((option) => (
        <ChoiceRow
          open={open}
          unsetLabel={t("runtime.default")}
          key={option.id}
          title={option.name}
          testIDPrefix={`session-config-option-${option.id}`}
          choices={optionChoices(option, labels, (value) =>
            onChange(option.id, value),
          )}
        />
      ))}
    </>
  );
}
