import type {
  AgentRoleRecord,
  MessageAttachment,
  TeamTemplateRecord,
} from "@cocurdex/shared";
import { FolderOpen, GitBranch } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppDropdownTriggerLabel, AppSearchableSelect } from "@/components";
import { Button, Checkbox } from "@/components/ui";
import {
  ChatComposer,
  ComposerSurfaceBody,
  newSessionComposerDraftKey,
  WelcomeHeading,
} from "@/features/composer";
import {
  AgentSelect,
  buildAgentSelectOptions,
  defaultAgentDescriptors,
  getAgentDisplayLabel,
  getThinkingLevelLabel,
  PermissionModeSubmenu,
  ProviderModelMenu,
  SessionModeSubmenu,
  shouldShowProviderGroupLabels,
  ThinkingLevelSubmenu,
  useSessionModeLabels,
} from "@/features/sessions";
import {
  AgentRoleEditDialog,
  getAgentRoles,
  getStoredAgentRoleId,
  persistAgentRoleId,
  SaveAgentRoleDialog,
  saveAgentRoleRecord,
  subscribeAgentRoles,
  useAgentRoleSummary,
} from "@/features/sessions/agent-role";
import { TeamTemplateEditDialog } from "@/features/sessions/team";
import { AcpRegistryDialog } from "@/features/settings";
import { openSettings } from "@/features/settings/settings-navigation";
import {
  composerContextTriggerHoverClassName,
  WorkspacePicker,
  WorktreePicker,
} from "@/features/workspaces";
import { cn } from "@/lib";
import type { NewSessionCardProps } from "./new-session-card.types";
import { useNewSessionCard } from "./use-new-session-card";
import { useNewSessionTeam } from "./use-new-session-team";

function openTeamSettings() {
  openSettings("teams");
}

function openAdapterSettings() {
  openSettings("adapters");
}

function openRoleSettings() {
  openSettings("agentRoles");
}

// Composer footer pickers: shadcn ghost Button trigger
// (via AppDropdownTriggerButton appearance="ghost") — resting transparent,
// hover/open use ghost muted fill + control radius. Keep dense padding only.
const compactGhostTriggerClassName = cn("h-7 gap-1 px-1");
const composerContextTriggerClassName = cn(
  "h-7 gap-1.5 rounded-control px-2 text-muted-foreground hover:text-foreground aria-expanded:text-foreground",
  composerContextTriggerHoverClassName,
);

export function NewSessionCard({
  workspaceName,
  agents,
  activeWorkspaceId,
  workspaces = [],
  activeBranches = [],
  activeBranch,
  worktrees = [],
  selectedWorktreePath = null,
  sessionTitle,
  agentType,
  sessionModeId = null,
  attachment,
  composerContextChips,
  composerRef,
  workspaceRootPath,
  onClearAttachment,
  onSelectWorkspace,
  onOpenWorkspace,
  onRelocateWorkspace,
  onSelectBranch,
  onSelectWorktree,
  onCreateWorktree,
  onSelectAgent,
  onSelectSessionMode,
  onStartSession,
}: NewSessionCardProps) {
  const { t } = useTranslation(["common", "sessions", "settings"]);
  const { label: sessionModeLabel } = useSessionModeLabels();
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [createWorktree, setCreateWorktree] = useState(false);
  const createWorktreeId = useId();
  const [saveRoleOpen, setSaveRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRoleRecord | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [teamDialog, setTeamDialog] = useState<{
    template: TeamTemplateRecord | null;
  } | null>(null);
  const [chosenRoleId, setChosenRoleIdState] = useState<string | null>(
    getStoredAgentRoleId,
  );
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const formatRoleSummary = useAgentRoleSummary();
  const setChosenRoleId = (roleId: string | null) => {
    setChosenRoleIdState(roleId);
    persistAgentRoleId(roleId);
  };
  const {
    selectedSessionModeId,
    sessionModeOptions,
    selectedPermissionMode,
    permissionModeOptions,
    setSelectedPermissionMode,
    codexReasoningDefaultValue,
    selectedCodexReasoningEffort,
    setSelectedCodexReasoningEffort,
    selectedServiceTier,
    setSelectedServiceTier,
    selectedThinkingLevel,
    setSelectedThinkingLevel,
    openCodeAgentOptions,
    openCodeAgentDefaultValue,
    openCodeAgentValue,
    openCodeVariantOptions,
    openCodeVariantValue,
    setSelectedOpenCodeAgent,
    setSelectedOpenCodeVariant,
    hasWorkspace,
    contextWorkspaceRootPath,
    contextWorkspaceRootPaths,
    compatibleProviders,
    isProviderModelLoading,
    selectedProviderModel,
    effectiveSelectedAgent,
    canStartSession,
    canStartWithSelectedAgent,
    codexReasoningOptions,
    serviceTierOptions,
    claudeFastModeOptions,
    selectedClaudeFastMode,
    setSelectedClaudeFastMode,
    thinkingLevelOptions,
    thinkingLevelOverride,
    providerSnapshot,
    currentRoleDraft,
    handleSelectAgent,
    handleApplyRole,
    handleSelectSessionMode,
    handleSelectProviderModel,
  } = useNewSessionCard({
    workspaceName,
    agents,
    activeWorkspaceId,
    workspaces,
    agentType,
    sessionModeId,
    attachment,
    workspaceRootPath,
    onClearAttachment,
    onSelectAgent,
    onSelectSessionMode,
    onStartSession,
  });

  // Wires the ChatComposer submit into the higher-level "start session"
  // intent. ChatComposer already clears its own editor on send, so we just
  // forward the prompt text + attachments along with the picked agent /
  // permission / provider snapshot.
  const handleStartSession = (
    text: string,
    attachments: MessageAttachment[],
  ) => {
    if (!createWorktree || !onCreateWorktree) {
      startSession(text, attachments);
      return;
    }
    return onCreateWorktree().then(
      (worktreePath) => {
        setCreateWorktree(false);
        startSession(text, attachments, worktreePath);
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(t("sessions:worktree.createFailed", { message }));
      },
    );
  };

  const startSession = (
    text: string,
    attachments: MessageAttachment[],
    worktreePath?: string,
  ) => {
    onStartSession?.({
      agentType: effectiveSelectedAgent,
      attachments: attachments.length > 0 ? attachments : undefined,
      sessionModeId: selectedSessionModeId,
      permissionMode: selectedPermissionMode,
      message: text,
      providerSnapshot,
      thinkingLevel: selectedThinkingLevel ?? undefined,
      agentRoleId: chosenRoleId,
      teamTemplateId: chosenTeamId,
      worktreePath,
    });
  };

  const selectedPermissionModeOption = permissionModeOptions.find(
    (option) => option.id === selectedPermissionMode,
  );
  const selectedSessionMode = sessionModeOptions.find(
    (mode) => mode.id === selectedSessionModeId,
  );
  const triggerValues = [
    // Nothing to show on the trigger while the agent default is in play.
    ...(selectedSessionMode && selectedSessionMode.id !== "default"
      ? [sessionModeLabel(effectiveSelectedAgent, selectedSessionMode)]
      : []),
    // Nothing to show on the trigger while the axis is unset.
    ...(thinkingLevelOptions.length > 1 && selectedThinkingLevel
      ? [
          getThinkingLevelLabel(thinkingLevelOptions, selectedThinkingLevel) ??
            t(`sessions:composer.thinkingLevels.${selectedThinkingLevel}`),
        ]
      : []),
    ...(selectedPermissionModeOption
      ? [t(`sessions:permissionMode.${selectedPermissionModeOption.id}`)]
      : []),
  ];

  const agentSelectOptions = buildAgentSelectOptions(
    agents ?? defaultAgentDescriptors,
  );
  const { chosenTeamId, setChosenTeamId, teamOptions, templates, leadOf } =
    useNewSessionTeam({
      agentOptions: agentSelectOptions,
      roles,
    });
  const handleSelectTeam = (teamId: string) => {
    const lead = leadOf(teamId);
    if (!lead) {
      return;
    }
    setChosenTeamId(teamId);
    setChosenRoleId(lead.id);
    handleApplyRole(lead);
  };
  const roleOptions = roles.map((role) => {
    const agentOption = agentSelectOptions.find(
      (option) => option.value === role.agentId,
    );
    return {
      id: role.id,
      agentId: role.agentId,
      avatar: role.avatar,
      name: role.name,
      summary: formatRoleSummary(role),
      selectable: agentOption?.selectable !== false,
      statusKind: agentOption?.statusKind,
    };
  });
  const selectedRole =
    roleOptions.find((role) => role.id === chosenRoleId) ?? null;
  const selectedTeam =
    teamOptions.find((team) => team.id === chosenTeamId) ?? null;
  const saveRoleSummary = formatRoleSummary(currentRoleDraft);
  let agentTriggerLabel: string = t("sessions:composer.noInstalledAgent");
  if (selectedTeam) {
    agentTriggerLabel = selectedTeam.name;
  } else if (selectedRole) {
    agentTriggerLabel = selectedRole.name;
  } else if (canStartWithSelectedAgent) {
    agentTriggerLabel = getAgentDisplayLabel(effectiveSelectedAgent);
  }

  const modelMenu = selectedRole ? null : (
    <ProviderModelMenu
      agentId={effectiveSelectedAgent}
      appearance="ghost"
      compatibleProviders={compatibleProviders}
      footer={
        <>
          <SessionModeSubmenu
            agentType={effectiveSelectedAgent}
            modeId={selectedSessionModeId}
            modes={sessionModeOptions}
            onChange={handleSelectSessionMode}
          />
          <ThinkingLevelSubmenu
            level={selectedThinkingLevel}
            options={thinkingLevelOptions}
            onChange={setSelectedThinkingLevel}
          />
          <PermissionModeSubmenu
            agentType={effectiveSelectedAgent}
            mode={selectedPermissionMode}
            options={permissionModeOptions}
            providerSnapshot={providerSnapshot}
            onChange={setSelectedPermissionMode}
          />
        </>
      }
      isLoading={isProviderModelLoading}
      reasoningEffortOptions={codexReasoningOptions}
      reasoningEffortDefaultValue={codexReasoningDefaultValue}
      reasoningEffortValue={
        selectedCodexReasoningEffort || codexReasoningDefaultValue
      }
      fastModeOptions={claudeFastModeOptions}
      fastModeValue={selectedClaudeFastMode ? "on" : "off"}
      serviceTierOptions={serviceTierOptions}
      serviceTierValue={selectedServiceTier}
      openCodeAgentOptions={openCodeAgentOptions}
      openCodeAgentDefaultValue={openCodeAgentDefaultValue}
      openCodeAgentValue={openCodeAgentValue}
      openCodeVariantOptions={openCodeVariantOptions}
      openCodeVariantValue={openCodeVariantValue}
      thinkingLevelValue={thinkingLevelOverride}
      triggerClassName={compactGhostTriggerClassName}
      triggerValues={triggerValues}
      showProviderGroupLabels={shouldShowProviderGroupLabels(
        effectiveSelectedAgent,
      )}
      value={selectedProviderModel}
      onChange={handleSelectProviderModel}
      onReasoningEffortChange={setSelectedCodexReasoningEffort}
      onFastModeChange={setSelectedClaudeFastMode}
      onOpenCodeAgentChange={setSelectedOpenCodeAgent}
      onOpenCodeVariantChange={setSelectedOpenCodeVariant}
      onServiceTierChange={setSelectedServiceTier}
      onSaveAsRole={() => setSaveRoleOpen(true)}
    />
  );

  const controls = (
    <>
      <AgentSelect
        appearance="ghost"
        options={agentSelectOptions}
        roles={roleOptions}
        selectedRoleId={chosenRoleId}
        teams={teamOptions}
        selectedTeamId={chosenTeamId}
        triggerClassName={cn("max-w-40 shrink-0", compactGhostTriggerClassName)}
        triggerLabel={
          <AppDropdownTriggerLabel>{agentTriggerLabel}</AppDropdownTriggerLabel>
        }
        value={effectiveSelectedAgent}
        onEditRole={(roleId) => {
          const role = roles.find((item) => item.id === roleId);
          if (role) {
            setEditingRole(role);
          }
        }}
        onAddAgent={() => setRegistryOpen(true)}
        onCreateRole={() => setCreatingRole(true)}
        onCreateTeam={() => setTeamDialog({ template: null })}
        onEditTeam={(teamId) => {
          const template = templates.find((item) => item.id === teamId);
          if (template) {
            setTeamDialog({ template });
          }
        }}
        onManageAgents={openAdapterSettings}
        onManageRoles={openRoleSettings}
        onManageTeams={openTeamSettings}
        onSelectRole={(roleId) => {
          const role = roles.find((item) => item.id === roleId);
          if (role) {
            setChosenTeamId(null);
            setChosenRoleId(role.id);
            handleApplyRole(role);
          }
        }}
        onSelectTeam={handleSelectTeam}
        onValueChange={(agentId) => {
          setChosenTeamId(null);
          setChosenRoleId(null);
          handleSelectAgent(agentId);
        }}
      />
      {modelMenu}
    </>
  );

  const branchOptions = activeBranches
    .filter((branch) => branch.kind === "local")
    .map((branch) => ({
      value: branch.name,
      label: branch.name,
      group: "branches",
      groupLabel: t("sessions:branch.branches"),
      icon: <GitBranch className="size-3.5" />,
    }));

  const handleSelectBranch = async (branch: string) => {
    if (!branch || branch === activeBranch || !onSelectBranch) {
      return;
    }

    setIsSwitchingBranch(true);
    try {
      await onSelectBranch(branch);
    } catch (error) {
      console.error("[sessions] checkout branch failed", error);
      toast.error(t("sessions:branch.switchFailed", { branch }));
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  // Workspace and branch remain editable until the session starts. Branch
  // selection performs a real checkout; active sessions render it read-only.
  const header = (
    <div className="flex flex-wrap items-center gap-1.5">
      <WorkspacePicker
        appearance="outline"
        showChevron={false}
        triggerClassName={cn("max-w-60", composerContextTriggerClassName)}
        activeWorkspaceId={activeWorkspaceId}
        workspaceName={workspaceName}
        workspaces={workspaces}
        onSelectWorkspace={onSelectWorkspace}
        onOpenWorkspace={onOpenWorkspace}
        onRelocateWorkspace={onRelocateWorkspace}
      />

      {hasWorkspace ? (
        <WorktreePicker
          appearance="outline"
          disabled={createWorktree}
          showChevron={false}
          selectedPath={selectedWorktreePath}
          triggerClassName={composerContextTriggerClassName}
          workspaceRootPath={
            workspaces.find((workspace) => workspace.id === activeWorkspaceId)
              ?.rootPaths[0] ?? ""
          }
          worktrees={worktrees}
          onSelect={(path) => onSelectWorktree?.(path)}
        />
      ) : null}

      {hasWorkspace ? (
        <AppSearchableSelect
          appearance="outline"
          showChevron={false}
          disabled={isSwitchingBranch || branchOptions.length === 0}
          emptyText={t("sessions:branch.empty")}
          options={branchOptions}
          searchPlaceholder={t("sessions:branch.searchPlaceholder")}
          side="top"
          triggerClassName={cn("max-w-45", composerContextTriggerClassName)}
          triggerLabel={
            <span className="flex min-w-0 items-center gap-1.5">
              <GitBranch className="size-3.5 shrink-0" />
              {activeBranch === undefined ? null : (
                <span className="truncate">
                  {activeBranch ?? t("sessions:branch.noBranch")}
                </span>
              )}
            </span>
          }
          value={activeBranch ?? ""}
          onValueChange={(branch) => void handleSelectBranch(branch)}
        />
      ) : null}

      {hasWorkspace && onCreateWorktree ? (
        <label
          className={cn(
            "flex cursor-pointer items-center",
            composerContextTriggerClassName,
          )}
          htmlFor={createWorktreeId}
        >
          <Checkbox
            checked={createWorktree}
            className="bg-background"
            id={createWorktreeId}
            onCheckedChange={(checked) => {
              setCreateWorktree(checked);
              if (checked) {
                onSelectWorktree?.(null);
              }
            }}
          />
          {t("sessions:worktree.label")}
        </label>
      ) : null}
    </div>
  );

  return (
    <ComposerSurfaceBody className="flex flex-col">
      {sessionTitle ? <div className="sr-only">{sessionTitle}</div> : null}
      {workspaceName ? (
        <WelcomeHeading>
          {t("sessions:workspace.startTitleBefore")}
          <WorkspacePicker
            align="center"
            appearance="ghost"
            activeWorkspaceId={activeWorkspaceId}
            side="bottom"
            trigger={
              <button
                className="group/ws inline-flex max-w-[16ch] items-baseline rounded-control px-0.5 align-baseline font-medium text-foreground transition-colors hover:bg-muted/50 aria-expanded:bg-muted/50 [&>svg]:hidden"
                type="button"
              />
            }
            triggerAriaLabel={t("sessions:workspace.workspace")}
            triggerLabel={
              <span className="truncate underline decoration-foreground/30 underline-offset-[0.18em] transition-colors group-hover/ws:decoration-foreground group-aria-expanded/ws:decoration-foreground">
                {workspaceName}
              </span>
            }
            workspaceName={workspaceName}
            workspaces={workspaces}
            onOpenWorkspace={onOpenWorkspace}
            onRelocateWorkspace={onRelocateWorkspace}
            onSelectWorkspace={onSelectWorkspace}
          />
          {t("sessions:workspace.startTitleAfter")}
        </WelcomeHeading>
      ) : (
        // No workspace yet: the heading states the next step and carries the
        // action inline, mirroring the workspace picker that replaces it once a
        // workspace is open.
        <WelcomeHeading>
          {t("sessions:workspace.emptyTitle")}
          <Button
            aria-label={t("sessions:workspace.openFolder")}
            className="self-center"
            onClick={onOpenWorkspace}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <FolderOpen className="size-4" />
          </Button>
        </WelcomeHeading>
      )}

      <ChatComposer
        ref={composerRef}
        mode="agent"
        variant="panel"
        tone="welcome"
        sessionId={null}
        draftKey={newSessionComposerDraftKey(activeWorkspaceId)}
        agentType={effectiveSelectedAgent}
        sessionModeId={selectedSessionModeId}
        mentionMenuPlacement="bottom"
        attachment={attachment}
        contextChips={composerContextChips}
        onClearAttachment={onClearAttachment}
        onSelectSessionMode={handleSelectSessionMode}
        workspaceRootPath={contextWorkspaceRootPath}
        workspaceRootPaths={contextWorkspaceRootPaths}
        placeholderOverride={t("sessions:composer.placeholder")}
        controls={controls}
        header={header}
        canSubmit={hasWorkspace && canStartSession}
        onSend={handleStartSession}
      />
      <SaveAgentRoleDialog
        open={saveRoleOpen}
        onOpenChange={setSaveRoleOpen}
        agentId={currentRoleDraft.agentId}
        summary={saveRoleSummary}
        onSave={async (role) => {
          const saved = await saveAgentRoleRecord({
            ...currentRoleDraft,
            ...role,
          });
          setChosenRoleId(saved.id);
          toast.success(t("sessions:agentRole.saved"));
        }}
      />
      <AgentRoleEditDialog
        open={Boolean(editingRole) || creatingRole}
        role={editingRole}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingRole(null);
            setCreatingRole(false);
          }
        }}
        onSaved={(saved) => {
          if (creatingRole) {
            setChosenTeamId(null);
            setChosenRoleId(saved.id);
          }
          handleApplyRole(saved);
        }}
      />
      <AcpRegistryDialog open={registryOpen} onOpenChange={setRegistryOpen} />
      <TeamTemplateEditDialog
        open={teamDialog !== null}
        template={teamDialog?.template ?? null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTeamDialog(null);
          }
        }}
      />
    </ComposerSurfaceBody>
  );
}
