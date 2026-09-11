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
  formatAgentRoleRecordSummary,
  getAgentRoles,
  getStoredAgentRoleId,
  persistAgentRoleId,
  SaveAgentRoleDialog,
  saveAgentRoleRecord,
  subscribeAgentRoles,
} from "../agent-role";
import { AgentSelect, buildAgentSelectOptions } from "../agent-select";
import { CollaborationModeSubmenu } from "../collaboration-mode-control";
import { PermissionModeSubmenu } from "../permission-mode-submenu";
import { ProviderModelMenu } from "../provider-model";
import { shouldShowProviderGroupLabels } from "../provider-model/provider-model-label";
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
  collaborationMode = "default",
  attachment,
  composerRef,
  workspaceRootPath,
  onClearAttachment,
  onSelectWorkspace,
  onOpenWorkspace,
  onSelectBranch,
  onSelectWorktree,
  onSelectAgent,
  onSelectCollaborationMode,
  onStartSession,
}: NewSessionCardProps) {
  const { t } = useTranslation(["common", "sessions", "settings"]);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [saveRoleOpen, setSaveRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRoleRecord | null>(null);
  const [chosenRoleId, setChosenRoleIdState] = useState<string | null>(
    getStoredAgentRoleId,
  );
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const setChosenRoleId = (roleId: string | null) => {
    setChosenRoleIdState(roleId);
    persistAgentRoleId(roleId);
  };
  const {
    selectedCollaborationMode,
    selectedPermissionMode,
    permissionModeOptions,
    setSelectedPermissionMode,
    codexReasoningDefaultValue,
    selectedCodexReasoningEffort,
    setSelectedCodexReasoningEffort,
    selectedCodexServiceTier,
    setSelectedCodexServiceTier,
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
    compatibleProviders,
    isProviderModelLoading,
    selectedProviderModel,
    effectiveSelectedAgent,
    canStartSession,
    canStartWithSelectedAgent,
    codexReasoningOptions,
    codexServiceTierOptions,
    claudeFastModeOptions,
    selectedClaudeFastMode,
    setSelectedClaudeFastMode,
    thinkingLevelOptions,
    thinkingLevelOverride,
    providerSnapshot,
    currentRoleDraft,
    handleSelectAgent,
    handleApplyRole,
    handleSelectCollaborationMode,
    handleSelectProviderModel,
  } = useNewSessionCard({
    workspaceName,
    agents,
    activeWorkspaceId,
    workspaces,
    agentType,
    collaborationMode,
    attachment,
    workspaceRootPath,
    onClearAttachment,
    onSelectAgent,
    onSelectCollaborationMode,
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
      collaborationMode: selectedCollaborationMode,
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
  const triggerValues = [
    ...(selectedCollaborationMode === "plan"
      ? [t("sessions:collaborationMode.plan")]
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
      summary: formatAgentRoleRecordSummary(role, {
        agentLabel: agentLabels[role.agentId],
        permissionLabel: role.permissionMode
          ? t(`sessions:permissionMode.${role.permissionMode}`)
          : null,
        thinkingLabelFor: (level) =>
          t(`sessions:composer.thinkingLevels.${level}`),
        fastModeOn: t("sessions:modelMenu.fastModeOn"),
      }),
      selectable: agentOption?.selectable !== false,
      statusKind: agentOption?.statusKind,
    };
  });
  const selectedRole =
    roleOptions.find((role) => role.id === chosenRoleId) ?? null;
  const saveRoleSummary = formatAgentRoleRecordSummary(currentRoleDraft, {
    agentLabel: agentLabels[currentRoleDraft.agentId],
    permissionLabel: currentRoleDraft.permissionMode
      ? t(`sessions:permissionMode.${currentRoleDraft.permissionMode}`)
      : null,
    thinkingLabelFor: (level) => t(`sessions:composer.thinkingLevels.${level}`),
    fastModeOn: t("sessions:modelMenu.fastModeOn"),
  });
  let agentTriggerLabel: string = t("sessions:composer.noInstalledAgent");
  if (selectedRole) {
    agentTriggerLabel = selectedRole.name;
  } else if (canStartWithSelectedAgent) {
    agentTriggerLabel = agentLabels[effectiveSelectedAgent];
  }

  const modelMenu = selectedRole ? null : (
    <ProviderModelMenu
      appearance="ghost"
      compatibleProviders={compatibleProviders}
      footer={
        <>
          <CollaborationModeSubmenu
            agentType={effectiveSelectedAgent}
            mode={selectedCollaborationMode}
            onChange={handleSelectCollaborationMode}
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
      serviceTierOptions={codexServiceTierOptions}
      serviceTierValue={selectedCodexServiceTier}
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
      onServiceTierChange={setSelectedCodexServiceTier}
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
              ?.rootPath ?? ""
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
        collaborationMode={selectedCollaborationMode}
        mentionMenuPlacement="bottom"
        attachment={attachment}
        onClearAttachment={onClearAttachment}
        onSelectCollaborationMode={handleSelectCollaborationMode}
        workspaceRootPath={contextWorkspaceRootPath}
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
