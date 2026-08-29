import type { MessageAttachment } from "@cocurdex/shared";
import { FolderOpen, GitBranch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSearchableSelect } from "@/components";
import { Button } from "@/components/ui";
import {
  ChatComposer,
  ComposerSurfaceBody,
  getThinkingLevelLabel,
  ThinkingLevelSubmenu,
  WelcomeHeading,
} from "@/features/composer";
import { WorkspacePicker } from "@/features/workspaces";
import { cn } from "@/lib";
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

export function NewSessionCard({
  workspaceName,
  agents,
  activeWorkspaceId,
  workspaces = [],
  activeBranches = [],
  activeBranch,
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
  onSelectAgent,
  onSelectCollaborationMode,
  onStartSession,
}: NewSessionCardProps) {
  const { t } = useTranslation(["common", "sessions"]);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
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
    handleSelectAgent,
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

  const controls = (
    <>
      <AgentSelect
        appearance="ghost"
        options={buildAgentSelectOptions(agents ?? defaultAgentDescriptors)}
        triggerClassName={cn("max-w-40 shrink-0", compactGhostTriggerClassName)}
        triggerLabel={
          canStartWithSelectedAgent
            ? agentLabels[effectiveSelectedAgent]
            : t("sessions:composer.noInstalledAgent")
        }
        value={effectiveSelectedAgent}
        onValueChange={handleSelectAgent}
      />
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
        onThinkingLevelReset={() => setSelectedThinkingLevel("default")}
      />
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
        triggerClassName={cn("max-w-60", compactGhostTriggerClassName)}
        activeWorkspaceId={activeWorkspaceId}
        workspaceName={workspaceName}
        workspaces={workspaces}
        onSelectWorkspace={onSelectWorkspace}
        onOpenWorkspace={onOpenWorkspace}
      />

      {hasWorkspace ? (
        <AppSearchableSelect
          appearance="ghost"
          disabled={isSwitchingBranch || branchOptions.length === 0}
          emptyText={t("sessions:branch.empty")}
          options={branchOptions}
          searchPlaceholder={t("sessions:branch.searchPlaceholder")}
          side="top"
          triggerClassName={cn("max-w-45", compactGhostTriggerClassName)}
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
    </ComposerSurfaceBody>
  );
}
