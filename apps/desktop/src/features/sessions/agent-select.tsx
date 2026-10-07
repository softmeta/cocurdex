import type { AgentId } from "@cocurdex/shared";
import { Check, Pencil, Plus, Settings2 } from "lucide-react";
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
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  ScrollArea,
  Text,
} from "@/components/ui";
import { openSettings } from "@/features/settings/settings-navigation";
import { cn } from "@/lib";
import { AgentIcon, AgentIconLabel } from "./agent-icon";
import {
  type AgentPresetAction,
  type AgentPresetOption,
  AgentPresetSubmenu,
} from "./agent-preset-submenu";
import { AgentRoleAvatar } from "./agent-role/agent-role-avatar";
import type { AgentSelectOption } from "./agent-select-options";
import { agentSelectStatusLabel } from "./agent-select-status";

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
  roles?: readonly AgentPresetOption[];
  selectedRoleId?: string | null;
  teams?: readonly AgentPresetOption[];
  selectedTeamId?: string | null;
  onAddAgent?(): void;
  onCreateRole?(): void;
  onCreateTeam?(): void;
  onEditRole?(roleId: string): void;
  onEditTeam?(teamId: string): void;
  onManageAgents?(): void;
  onManageRoles?(): void;
  onManageTeams?(): void;
  onSelectRole?(roleId: string): void;
  onSelectTeam?(teamId: string): void;
  onUnavailableClick?(agentId: AgentId): void;
  onValueChange(value: AgentId): void;
}

function openAdapterSettings() {
  openSettings("adapters");
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
  teams,
  selectedTeamId = null,
  onAddAgent,
  onCreateRole,
  onCreateTeam,
  onEditRole,
  onEditTeam,
  onManageAgents,
  onManageRoles,
  onManageTeams,
  onSelectRole,
  onSelectTeam,
  onUnavailableClick = openAdapterSettings,
  onValueChange,
}: AgentSelectProps) {
  const { t } = useTranslation(["sessions", "settings"]);
  const [open, setOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
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

  const selectedTeam =
    teams?.find((team) => team.id === selectedTeamId) ?? null;
  const selectedRole = selectedTeam
    ? null
    : (roles?.find((role) => role.id === selectedRoleId) ?? null);
  const selectedPreset = selectedTeam ?? selectedRole;
  const onEditPreset = selectedTeam ? onEditTeam : onEditRole;
  const showRoleHover = Boolean(selectedPreset) && !open;
  const presetActions = (
    create: { label: string; run?(): void },
    manage: { label: string; run?(): void },
  ): AgentPresetAction[] =>
    [
      { ...create, icon: <Plus className="size-4" /> },
      { ...manage, icon: <Settings2 className="size-4" /> },
    ].flatMap(({ icon, label, run }) =>
      run
        ? [
            {
              icon,
              label,
              onSelect: () => {
                setOpen(false);
                run();
              },
            },
          ]
        : [],
    );
  const agentActions = presetActions(
    { label: t("agentSelect.add"), run: onAddAgent },
    { label: t("agentSelect.manage"), run: onManageAgents },
  );
  const showAgentTriggerIcon = selectableOptions.some(
    (option) => option.value === value,
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setHoverOpen(false);
        }
      }}
    >
      <HoverCard
        open={showRoleHover && hoverOpen}
        onOpenChange={(nextOpen) => {
          if (showRoleHover) {
            setHoverOpen(nextOpen);
          }
        }}
      >
        <HoverCardTrigger
          closeDelay={200}
          delay={400}
          render={<span className="inline-flex min-w-0" />}
        >
          <DropdownMenuTrigger asChild>
            <AppDropdownTriggerButton
              appearance={appearance}
              aria-label={triggerAriaLabel}
              chevronClassName={chevronClassName}
              className={triggerClassName}
              disabled={isDisabled}
              showChevron={showChevron}
            >
              {selectedPreset ? (
                <AgentRoleAvatar role={selectedPreset} />
              ) : null}
              {!selectedPreset && showAgentTriggerIcon ? (
                <AgentIcon agentId={value} />
              ) : null}
              {triggerLabel}
            </AppDropdownTriggerButton>
          </DropdownMenuTrigger>
        </HoverCardTrigger>
        {selectedPreset ? (
          <HoverCardContent
            align="start"
            className="w-max max-w-80 py-1.5 ps-3 pe-1.5"
            side="bottom"
          >
            <div className="flex items-center gap-2">
              <Text size="meta" tone="muted" className="min-w-0 flex-1">
                {selectedPreset.agentId ? (
                  <AgentIconLabel agentId={selectedPreset.agentId}>
                    {selectedPreset.summary}
                  </AgentIconLabel>
                ) : (
                  selectedPreset.summary
                )}
              </Text>
              {onEditPreset ? (
                <IconButton
                  aria-label={t("settings:agentRoles.edit")}
                  size="xs"
                  title={t("settings:agentRoles.edit")}
                  onClick={() => {
                    setHoverOpen(false);
                    onEditPreset(selectedPreset.id);
                  }}
                >
                  <Pencil />
                </IconButton>
              ) : null}
            </div>
          </HoverCardContent>
        ) : null}
      </HoverCard>
      <AppDropdownContent
        align={align}
        className={cn(
          compactDropdownContentClassName,
          "[&_[role=menuitem]]:mb-0.5 [&_[role=menuitem]+[role=menuitem]]:mt-0",
          contentClassName,
        )}
        side="bottom"
      >
        {teams ? (
          <AgentPresetSubmenu
            actions={presetActions(
              { label: t("team.menuCreate"), run: onCreateTeam },
              { label: t("team.menuManage"), run: onManageTeams },
            )}
            emptyLabel={t("team.menuEmpty")}
            label={t("team.menuLabel")}
            presets={teams}
            selectedId={selectedTeam?.id ?? null}
            onSelect={(teamId) => {
              setOpen(false);
              onSelectTeam?.(teamId);
            }}
          />
        ) : null}
        {roles ? (
          <AgentPresetSubmenu
            actions={presetActions(
              { label: t("agentRole.menuCreate"), run: onCreateRole },
              { label: t("agentRole.menuManage"), run: onManageRoles },
            )}
            emptyLabel={t("agentRole.empty")}
            label={t("agentRole.menuLabel")}
            presets={roles}
            selectedId={selectedRole?.id ?? null}
            onSelect={(roleId) => {
              setOpen(false);
              onSelectRole?.(roleId);
            }}
          />
        ) : null}
        {teams || roles ? <DropdownMenuSeparator /> : null}
        <ScrollArea
          className="-mx-0.5"
          viewportProps={{
            className:
              "max-h-[calc((var(--text-body--line-height)_+_0.625rem)_*_6)] overscroll-contain",
          }}
        >
          <div className="px-0.5">
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
          </div>
        </ScrollArea>
        {agentActions.length > 0 ? <DropdownMenuSeparator /> : null}
        {agentActions.map((action) => (
          <AppDropdownItem key={action.label} onClick={() => action.onSelect()}>
            {action.icon}
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
          </AppDropdownItem>
        ))}
      </AppDropdownContent>
    </DropdownMenu>
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
      <AgentIcon agentId={option.value} />
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
