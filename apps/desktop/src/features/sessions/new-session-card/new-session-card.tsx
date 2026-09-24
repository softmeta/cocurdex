import type { AgentRoleRecord, MessageAttachment } from "@cocurdex/shared";
import { FolderOpen, GitBranch } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppDropdownTriggerLabel, AppSearchableSelect } from "@/components";
import { Button } from "@/components/ui";
import {
  ChatComposer,
  ComposerSurfaceBody,
  getThinkingLevelLabel,
  newSessionComposerDraftKey,
  ThinkingLevelSubmenu,
  WelcomeHeading,
} from "@/features/composer";
import {
  composerContextTriggerHoverClassName,
  WorkspacePicker,
  WorktreePicker,
} from "@/features/workspaces";
import { cn } from "@/lib";
import {
  AgentRoleEditDialog,
  getAgentRoles,
  getStoredAgentRoleId,
  persistAgentRoleId,
  SaveAgentRoleDialog,
  saveAgentRoleRecord,
  subscribeAgentRoles,
  useAgentRoleSummary,
} from "../agent-role";
import { AgentSelect } from "../agent-select";
import { buildAgentSelectOptions } from "../agent-select-options";
import { PermissionModeSubmenu } from "../permission-mode-submenu";
import { ProviderModelMenu } from "../provider-model";
import { shouldShowProviderGroupLabels } from "../provider-model/provider-model-label";
import { SessionModeSubmenu } from "../session-mode-control";
import { useSessionModeLabels } from "../session-mode-label";
import { agentLabels } from "../session-store";
import type { NewSessionCardProps } from "./new-session-card.types";
import { defaultAgentDescriptors } from "./new-session-card-config";
import { useNewSessionCard } from "./use-new-session-card";

// Composer footer + session context pickers: shadcn ghost Button trigger
// (via AppDropdownTriggerButton appearance="ghost") — resting transparent,
// hover/open use ghost muted fill + control radius. Keep dense padding only.
const compactGhostTriggerClassName = cn("h-7 gap-1 px-1");
const composerContextTriggerClassName = cn(
  compactGhostTriggerClassName,
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
  composerRef,
  workspaceRootPath,
  onClearAttachment,
  onSelectWorkspace,
  onOpenWorkspace,
  onRelocateWorkspace,
  onSelectBranch,
  onSelectWorktree,
  onSelectAgent,
  onSelectSessionMode,
  onStartSession,
}: NewSessionCardProps) {
  const { t } = useTranslation(["common", "sessions", "settings"]);
  const { label: sessionModeLabel } = useSessionModeLabels();
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [saveRoleOpen, setSaveRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRoleRecord | null>(null);
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
    onStartSession?.({
      agentType: effectiveSelectedAgent,
      attachments: attachments.length > 0 ? attachments : undefined,
      sessionModeId: selectedSessionModeId,
      permissionMode: selectedPermissionMode,
      message: text,
      providerSnapshot,
      thinkingLevel: selectedThinkingLevel ?? undefined,
      agentRoleId: chosenRoleId,
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
  const roleOptions = roles.map((role) => {
    const agentOption = agentSelectOptions.find(
      (option) => option.value === role.agentId,
    );
    return {
      id: role.id,
      name: role.name,
      summary: formatRoleSummary(role),
      selectable: agentOption?.selectable !== false,
      statusKind: agentOption?.statusKind,
    };
  });
  const selectedRole =
    roleOptions.find((role) => role.id === chosenRoleId) ?? null;
  const saveRoleSummary = formatRoleSummary(currentRoleDraft);
  let agentTriggerLabel: string = t("sessions:composer.noInstalledAgent");
  if (selectedRole) {
    agentTriggerLabel = selectedRole.name;
  } else if (canStartWithSelectedAgent) {
    agentTriggerLabel = agentLabels[effectiveSelectedAgent];
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
        onSelectRole={(roleId) => {
          const role = roles.find((item) => item.id === roleId);
          if (role) {
            setChosenRoleId(role.id);
            handleApplyRole(role);
          }
        }}
        onValueChange={(agentId) => {
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
    <div className="flex items-center gap-1">
      <WorkspacePicker
        appearance="ghost"
        triggerClassName={cn("max-w-60", composerContextTriggerClassName)}
        activeWorkspaceId={activeWorkspaceId}
        workspaceName={workspaceName}
        workspaces={workspaces}
        onSelectWorkspace={onSelectWorkspace}
        onOpenWorkspace={onOpenWorkspace}
        onRelocateWorkspace={onRelocateWorkspace}
      />

      {hasWorkspace && activeWorkspaceId ? (
        <WorktreePicker
          appearance="ghost"
          branches={activeBranches}
          currentBranch={activeBranch}
          selectedPath={selectedWorktreePath}
          triggerClassName={composerContextTriggerClassName}
          workspaceId={activeWorkspaceId}
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
          appearance="ghost"
          disabled={isSwitchingBranch || branchOptions.length === 0}
          emptyText={t("sessions:branch.empty")}
          options={branchOptions}
          searchPlaceholder={t("sessions:branch.searchPlaceholder")}
          side="top"
          triggerClassName={cn("max-w-45", composerContextTriggerClassName)}
          triggerLabel={
            <span className="flex min-w-0 items-center gap-1.5">
              <GitBranch className="size-3.5 shrink-0" />
              <span className="truncate">
                {activeBranch ?? t("sessions:branch.noBranch")}
              </span>
            </span>
          }
          value={activeBranch ?? ""}
          onValueChange={(branch) => void handleSelectBranch(branch)}
        />
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
        // No project yet: the heading states the next step and carries the
        // action inline, mirroring the workspace picker that replaces it once a
        // project is open.
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
        summary={saveRoleSummary}
        onSave={async (name) => {
          const saved = await saveAgentRoleRecord({
            ...currentRoleDraft,
            name,
          });
          setChosenRoleId(saved.id);
          toast.success(t("sessions:agentRole.saved"));
        }}
      />
      <AgentRoleEditDialog
        open={Boolean(editingRole)}
        role={editingRole}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingRole(null);
          }
        }}
        onSaved={(saved) => {
          handleApplyRole(saved);
        }}
      />
    </ComposerSurfaceBody>
  );
}
