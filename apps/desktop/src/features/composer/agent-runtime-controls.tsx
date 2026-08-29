import type { AgentSessionConfigOption } from "@cocurdex/shared";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui";
import { RuntimeAxisSubmenu } from "@/features/sessions";

export function AgentRuntimeConfigControl({
  configOptions,
  disabled,
  onChange,
}: {
  configOptions: AgentSessionConfigOption[];
  disabled?: boolean;
  onChange?(configId: string, value: boolean | string): void;
}) {
  const { t } = useTranslation("agent");

  if (configOptions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AppDropdownTriggerButton disabled={disabled}>
          <Settings2 className="size-4" />
          <AppDropdownTriggerLabel>
            {t("runtime.settings")}
          </AppDropdownTriggerLabel>
        </AppDropdownTriggerButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48" side="bottom">
        {configOptions.map((config) =>
          config.type === "boolean" ? (
            <DropdownMenuGroup key={config.id}>
              <DropdownMenuCheckboxItem
                checked={config.currentValue === true}
                onCheckedChange={(checked) =>
                  onChange?.(config.id, checked === true)
                }
              >
                {config.description ?? config.name}
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          ) : (
            // Value axes (reasoning effort, speed, …) drill into a submenu so
            // every agent's runtime picker reads the same as Codex's.
            <RuntimeAxisSubmenu
              key={config.id}
              label={config.name}
              value={String(config.currentValue ?? "")}
              onValueChange={(value) => onChange?.(config.id, value)}
              options={(config.options ?? []).map((option) => ({
                value: option.value,
                label: option.name,
                description: option.description,
              }))}
            />
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
