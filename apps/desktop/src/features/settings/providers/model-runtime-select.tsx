import { type ProviderApi, providerApis } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { AppSelect } from "@/components";

interface ModelRuntimeSelectProps {
  ariaLabel: string;
  disabled?: boolean;
  value: ProviderApi;
  onChange(value: ProviderApi): void;
}

export function ModelRuntimeSelect({
  ariaLabel,
  disabled = false,
  value,
  onChange,
}: ModelRuntimeSelectProps) {
  const { t } = useTranslation("settings");
  const options = providerApis.map((api) => ({
    value: api,
    label: t(`providers.fields.runtime.${api}`),
    description: api,
  }));
  const selected = options.find((option) => option.value === value);

  return (
    <AppSelect
      align="start"
      appearance="outline"
      contentClassName="w-[var(--anchor-width)]"
      disabled={disabled}
      options={options}
      triggerAriaLabel={ariaLabel}
      triggerClassName="h-8 w-full min-w-0 justify-between font-normal text-foreground"
      triggerLabel={selected?.label ?? value}
      value={value}
      onValueChange={(next) => onChange(next as ProviderApi)}
    />
  );
}
