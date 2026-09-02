import type { AgentSessionConfigOption } from "@cocurdex/shared";
import { DropdownMenuCheckboxItem, DropdownMenuGroup } from "@/components/ui";
import { RuntimeAxisSubmenu } from "@/features/sessions";

export type OccupiedSessionConfigAxis =
  | "model"
  | "thinking"
  | "mode"
  | "permission"
  | "speed"
  | "agent"
  | "variant";

const CONFIG_AXIS_ALIASES: Record<
  OccupiedSessionConfigAxis,
  readonly string[]
> = {
  model: ["model", "models"],
  thinking: [
    "thinking",
    "thinking_level",
    "reasoning",
    "reasoning_effort",
    "effort",
  ],
  mode: ["mode", "session_mode", "collaboration", "collaboration_mode"],
  permission: ["permission", "permission_mode", "approval"],
  speed: ["speed", "service_tier", "fast_mode", "fastmode"],
  agent: ["agent", "opencode_agent"],
  variant: ["variant", "opencode_variant"],
};

function normalizeConfigKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function configOptionKeys(option: AgentSessionConfigOption) {
  return [option.id, option.category]
    .filter((value): value is string => Boolean(value))
    .map(normalizeConfigKey);
}

export function getComposerSessionConfigOptions(
  options: readonly AgentSessionConfigOption[],
  occupiedAxes: readonly OccupiedSessionConfigAxis[],
) {
  return options.filter((option) => {
    const keys = configOptionKeys(option);
    return !occupiedAxes.some((axis) =>
      CONFIG_AXIS_ALIASES[axis].some((alias) => keys.includes(alias)),
    );
  });
}

export function getSessionConfigTriggerValues(
  options: readonly AgentSessionConfigOption[],
  occupiedAxes: readonly OccupiedSessionConfigAxis[],
  existingValues: readonly string[] = [],
) {
  const seen = new Set(existingValues);
  return getComposerSessionConfigOptions(options, occupiedAxes).flatMap(
    (option) => {
      if (option.type !== "select") {
        return [];
      }
      const selected = option.options?.find(
        (item) => item.value === option.currentValue,
      );
      if (!selected?.name || seen.has(selected.name)) {
        return [];
      }
      seen.add(selected.name);
      return [selected.name];
    },
  );
}

export function AgentRuntimeConfigItems({
  configOptions,
  disabled,
  onChange,
}: {
  configOptions: readonly AgentSessionConfigOption[];
  disabled?: boolean;
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
