import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppDropdownItem } from "@/components";
import {
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import type { AdapterStatusKind } from "./adapter-status";
import {
  AgentRoleAvatar,
  type AvatarSource,
} from "./agent-role/agent-role-avatar";
import { agentSelectStatusLabel } from "./agent-select-status";

export interface AgentPresetOption extends AvatarSource {
  summary: string;
  selectable?: boolean;
  statusKind?: AdapterStatusKind;
}

export interface AgentPresetAction {
  icon: ReactNode;
  label: string;
  onSelect(): void;
}

export function AgentPresetSubmenu({
  actions = [],
  emptyLabel,
  label,
  presets,
  selectedId,
  onSelect,
}: {
  actions?: readonly AgentPresetAction[];
  emptyLabel: string;
  label: string;
  presets: readonly AgentPresetOption[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const { t } = useTranslation("sessions");

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="[--popup-max-width:20rem]">
        {presets.length === 0 ? (
          <AppDropdownItem className="px-2 py-1" disabled>
            <span className="text-muted-foreground">{emptyLabel}</span>
          </AppDropdownItem>
        ) : (
          presets.map((preset) => {
            const unavailable = preset.selectable === false;
            const selected = preset.id === selectedId;
            return (
              <AppDropdownItem
                key={preset.id}
                className={cn(unavailable && "text-muted-foreground")}
                selected={selected}
                onClick={(event) => {
                  if (unavailable) {
                    event.preventDefault();
                    return;
                  }
                  onSelect(preset.id);
                }}
              >
                <AgentRoleAvatar role={preset} />
                <span
                  className="flex min-w-0 flex-1 items-baseline gap-2"
                  title={preset.summary}
                >
                  <span className="shrink-0">{preset.name}</span>
                  <span className="min-w-0 truncate text-meta text-muted-foreground">
                    {preset.summary}
                  </span>
                </span>
                {unavailable ? (
                  <span className="shrink-0 text-meta text-muted-foreground">
                    {agentSelectStatusLabel(preset.statusKind, t)}
                  </span>
                ) : null}
                {selected ? <Check className="size-4 shrink-0" /> : null}
              </AppDropdownItem>
            );
          })
        )}
        {actions.length > 0 ? (
          <DropdownMenuSeparator className="my-0.5" />
        ) : null}
        {actions.map((action) => (
          <AppDropdownItem
            className="gap-1.5 px-2 py-1"
            key={action.label}
            onClick={() => action.onSelect()}
          >
            {action.icon}
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
          </AppDropdownItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
