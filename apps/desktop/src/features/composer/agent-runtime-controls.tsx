import type { AgentSessionConfigOption } from "@cocurdex/shared";
import { DropdownMenuCheckboxItem, DropdownMenuGroup } from "@/components/ui";
import { RuntimeAxisSubmenu } from "@/features/sessions";

export function AgentRuntimeConfigItems({
  configOptions,
  disabled,
  inspectOnly = false,
  onChange,
}: {
  configOptions: readonly AgentSessionConfigOption[];
  disabled?: boolean;
  inspectOnly?: boolean;
  onChange?(configId: string, value: boolean | string): void;
}) {
  if (configOptions.length === 0) {
    return null;
  }

  return (
    <>
      {configOptions.map((config) =>
        config.type === "boolean" ? (
          <DropdownMenuGroup key={config.id}>
            <DropdownMenuCheckboxItem
              checked={config.currentValue === true}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange?.(config.id, checked === true)
              }
            >
              {config.description ?? config.name}
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        ) : (
          <RuntimeAxisSubmenu
            key={config.id}
            inspectOnly={inspectOnly}
            label={config.name}
            value={String(config.currentValue ?? "")}
            onValueChange={(value) => onChange?.(config.id, value)}
            options={(config.options ?? []).map((option) => ({
              value: option.value,
              label: option.name,
              description: option.description,
              disabled,
            }))}
          />
        ),
      )}
    </>
  );
}
