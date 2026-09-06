import type { AgentDescriptor, AgentId } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  AppDropdownItem,
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  compactDropdownContentClassName,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui";
import { openSettings } from "@/features/settings/settings-navigation";
import { cn } from "@/lib";
import {
  type AdapterStatusKind,
  getAdapterStatus,
  isAdapterSelectable,
} from "./adapter-status";
import { agentOptions } from "./new-session-card/new-session-card-config";
import { agentLabels } from "./session-store";

export interface AgentSelectOption {
  label: ReactNode;
  selectable?: boolean;
  statusKind?: AdapterStatusKind;
  value: AgentId;
}

export interface AgentRoleSelectOption {
  id: string;
  name: string;
  summary: string;
  selectable?: boolean;
  statusKind?: AdapterStatusKind;
}

interface AgentSelectProps {
  align?: "start" | "center" | "end";
  appearance?: AppDropdownTriggerAppearance;
  chevronClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  options: readonly AgentSelectOption[];
  triggerAriaLabel?: string;
  showChevron?: boolean;
  triggerClassName?: string;
  triggerLabel: ReactNode;
  value: AgentId;
  roles?: readonly AgentRoleSelectOption[];
  selectedRoleId?: string | null;
  onSelectRole?(roleId: string): void;
  onUnavailableClick?(agentId: AgentId): void;
  onValueChange(value: AgentId): void;
}

function openAdapterSettings() {
  openSettings("adapters");
}

export function buildAgentSelectOptions(
  agents: readonly AgentDescriptor[],
): AgentSelectOption[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));

  return agentOptions.map((option) => {
    const agent = byId.get(option.id);
    const status = agent ? getAdapterStatus(agent) : null;
    const kind = status?.kind ?? "detecting";

    return {
      value: option.id,
      label: agentLabels[option.id],
      selectable: isAdapterSelectable(kind),
      statusKind: kind,
    };
  });
}

export function AgentSelect({
  align = "start",
  appearance = "outline",
  chevronClassName,
  contentClassName,
  disabled = false,
  options,
  showChevron = true,
  triggerAriaLabel,
  triggerClassName,
  triggerLabel,
  value,
  roles,
  selectedRoleId = null,
  onSelectRole,
  onUnavailableClick = openAdapterSettings,
  onValueChange,
}: AgentSelectProps) {
  const { t } = useTranslation("sessions");
  const [open, setOpen] = useState(false);
  const isDisabled = disabled || options.length === 0;
  const selectableOptions = options.filter(
    (option) => option.selectable !== false,
  );
  const unavailableOptions = options.filter(
    (option) => option.selectable === false,
  );

  const handleOptionClick = (option: AgentSelectOption) => {
    if (option.selectable !== false) {
      setOpen(false);
      onValueChange(option.value);
      return;
    }
    if (option.statusKind === "detecting") {
      return;
    }
    setOpen(false);
    onUnavailableClick(option.value);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <AppDropdownTriggerButton
          appearance={appearance}
          aria-label={triggerAriaLabel}
          chevronClassName={chevronClassName}
          className={triggerClassName}
          disabled={isDisabled}
          showChevron={showChevron}
        >
          {triggerLabel}
        </AppDropdownTriggerButton>
      </DropdownMenuTrigger>
      <AppDropdownContent
        align={align}
        className={cn(
          compactDropdownContentClassName,
          "[&_[role=menuitem]]:mb-0.5 [&_[role=menuitem]+[role=menuitem]]:mt-0",
          contentClassName,
        )}
        side="bottom"
      >
        {roles ? (
          <>
            <AgentRoleSubmenu
              roles={roles}
              selectedRoleId={selectedRoleId}
              onSelectRole={(roleId) => {
                setOpen(false);
                onSelectRole?.(roleId);
              }}
            />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          {selectableOptions.map((option) => (
            <AgentSelectRow
              key={option.value}
              option={option}
              selected={option.value === value}
              statusLabel={agentSelectStatusLabel(option.statusKind, t)}
              onSelect={handleOptionClick}
            />
          ))}
        </DropdownMenuGroup>
        {selectableOptions.length > 0 && unavailableOptions.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}
        {unavailableOptions.length > 0 ? (
          <DropdownMenuGroup>
            {unavailableOptions.map((option) => (
              <AgentSelectRow
                key={option.value}
                option={option}
                selected={false}
                statusLabel={agentSelectStatusLabel(option.statusKind, t)}
                onSelect={handleOptionClick}
              />
            ))}
          </DropdownMenuGroup>
        ) : null}
      </AppDropdownContent>
    </DropdownMenu>
  );
}

function AgentRoleSubmenu({
  roles,
  selectedRoleId,
  onSelectRole,
}: {
  roles: readonly AgentRoleSelectOption[];
  selectedRoleId: string | null;
  onSelectRole(roleId: string): void;
}) {
  const { t } = useTranslation("sessions");

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="min-w-0 flex-1 truncate">
          {t("agentRole.menuLabel")}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56 max-w-80">
        {roles.length === 0 ? (
          <AppDropdownItem disabled>
            <span className="text-muted-foreground">
              {t("agentRole.empty")}
            </span>
          </AppDropdownItem>
        ) : (
          roles.map((role) => {
            const unavailable = role.selectable === false;
            return (
              <AppDropdownItem
                key={role.id}
                className={cn(unavailable && "text-muted-foreground")}
                selected={role.id === selectedRoleId}
                onClick={(event) => {
                  if (unavailable) {
                    event.preventDefault();
                    return;
                  }
                  onSelectRole(role.id);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{role.name}</span>
                  <span className="truncate text-meta text-muted-foreground">
                    {role.summary}
                  </span>
                </span>
                {unavailable ? (
                  <span className="shrink-0 text-meta text-muted-foreground">
                    {agentSelectStatusLabel(role.statusKind, t)}
                  </span>
                ) : null}
                {role.id === selectedRoleId ? (
                  <Check className="size-4 shrink-0" />
                ) : null}
              </AppDropdownItem>
            );
          })
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function AgentSelectRow({
  option,
  selected,
  statusLabel,
  onSelect,
}: {
  option: AgentSelectOption;
  selected: boolean;
  statusLabel: string | null;
  onSelect(option: AgentSelectOption): void;
}) {
  const unavailable = option.selectable === false;

  return (
    <AppDropdownItem
      className={cn(
        unavailable && "text-muted-foreground",
        option.statusKind === "detecting" && "cursor-default",
      )}
      selected={selected}
      onClick={(event) => {
        if (option.statusKind === "detecting") {
          event.preventDefault();
        }
        onSelect(option);
      }}
    >
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {statusLabel ? (
        <span className="shrink-0 text-meta text-muted-foreground">
          {statusLabel}
        </span>
      ) : null}
      {selected ? <Check className="size-4 shrink-0" /> : null}
    </AppDropdownItem>
  );
}

function agentSelectStatusLabel(
  kind: AdapterStatusKind | undefined,
  t: TFunction<"sessions">,
) {
  if (kind === "detecting") {
    return t("composer.agentStatus.detecting");
  }
  if (kind === "missing") {
    return t("composer.agentStatus.notInstalled");
  }
  if (kind === "outdated") {
    return t("composer.agentStatus.updateRequired");
  }
  if (kind === "error") {
    return t("composer.agentStatus.error");
  }
  return null;
}
