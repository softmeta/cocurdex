import type {
  AgentId,
  AgentPermissionMode,
  AgentRoleRecord,
  AgentThinkingLevel,
  CodexReasoningEffort,
  CollaborationModeKind,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Field, FieldGroup, FieldLabel, Input } from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMountEffect } from "@/lib";
import { supportsPlanMode } from "../collaboration-mode";
import {
  getCachedProviderModelEntry,
  getDefaultProviderModelValue,
  getProviderModelCacheVersion,
  getProviderModelValue,
  loadProviderModelOptions,
  parseProviderModelValue,
  providerModelCache,
  subscribeProviderModelCache,
} from "../provider-model";
import { agentsAtom, getDefaultPermissionMode } from "../session-store";
import { AgentRoleRuntimeFields } from "./agent-role-runtime-fields";
import { saveAgentRoleRecord } from "./agent-role-store";

export function AgentRoleEditDialog({
  role,
  open,
  onOpenChange,
  onSaved,
}: {
  role: AgentRoleRecord | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved?(role: AgentRoleRecord): void;
}) {
  if (!role) {
    return null;
  }

  return (
    <AgentRoleEditForm
      key={role.id}
      open={open}
      role={role}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

function AgentRoleEditForm({
  role,
  open,
  onOpenChange,
  onSaved,
}: {
  role: AgentRoleRecord;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved?(role: AgentRoleRecord): void;
}) {
  const { t } = useTranslation(["settings", "sessions"]);
  const agents = useAtomValue(agentsAtom);
  const [name, setName] = useState(role.name);
  const [agentId, setAgentId] = useState<AgentId>(role.agentId);
  const [modelValue, setModelValue] = useState(() =>
    role.providerId && role.modelId
      ? getProviderModelValue(role.providerId, role.modelId)
      : "",
  );
  const [permissionMode, setPermissionMode] =
    useState<AgentPermissionMode | null>(role.permissionMode);
  const [collaborationMode, setCollaborationMode] =
    useState<CollaborationModeKind>(role.collaborationMode);
  const [reasoningEffort, setReasoningEffort] = useState(
    role.reasoningEffort ?? "",
  );
  const [serviceTier, setServiceTier] = useState(role.serviceTier ?? "");
  const [fastMode, setFastMode] = useState(role.fastMode ?? false);
  const [thinkingLevel, setThinkingLevel] = useState<AgentThinkingLevel>(
    role.thinkingLevel ?? "default",
  );
  const [openCodeAgent, setOpenCodeAgent] = useState(role.openCodeAgent ?? "");
  const [openCodeVariant, setOpenCodeVariant] = useState(
    role.openCodeVariant ?? "",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useSyncExternalStore(
    subscribeProviderModelCache,
    getProviderModelCacheVersion,
    () => 0,
  );
  const cacheEntry = getCachedProviderModelEntry(providerModelCache, agentId);
  const compatibleProviders = cacheEntry?.result?.items ?? [];
  const selectedProviderModel = compatibleProviders.find(
    ({ provider, model }) =>
      getProviderModelValue(provider.id, model.modelId) === modelValue,
  );
  const isClaudeAgent = agentId === "claude-agent";

  useMountEffect(() => {
    let cancelled = false;
    void loadProviderModelOptions(providerModelCache, role.agentId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setModelValue(
          getDefaultProviderModelValue(
            role.agentId,
            result.items,
            result.defaultSelection,
            role.providerId && role.modelId
              ? { providerId: role.providerId, modelId: role.modelId }
              : undefined,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  });

  const handleSelectAgent = async (nextAgentId: AgentId) => {
    setAgentId(nextAgentId);
    setModelValue("");
    setIsLoading(true);
    setPermissionMode(getDefaultPermissionMode(agents, nextAgentId));
    setCollaborationMode(
      supportsPlanMode(nextAgentId) ? collaborationMode : "default",
    );
    setReasoningEffort("");
    setServiceTier("");
    setFastMode(false);
    setThinkingLevel("default");
    setOpenCodeAgent("");
    setOpenCodeVariant("");
    try {
      const result = await loadProviderModelOptions(
        providerModelCache,
        nextAgentId,
      );
      setModelValue(
        getDefaultProviderModelValue(
          nextAgentId,
          result.items,
          result.defaultSelection,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) {
      return;
    }
    const parsed = parseProviderModelValue(modelValue);
    setSaving(true);
    try {
      const saved = await saveAgentRoleRecord({
        id: role.id,
        name: trimmed,
        agentId,
        providerId: parsed?.providerId ?? null,
        modelId: parsed?.modelId ?? null,
        modelName: selectedProviderModel?.model.name ?? role.modelName,
        permissionMode,
        collaborationMode:
          collaborationMode === "plan" && supportsPlanMode(agentId)
            ? "plan"
            : "default",
        reasoningEffort: reasoningEffort
          ? (reasoningEffort as CodexReasoningEffort)
          : null,
        serviceTier: serviceTier || null,
        fastMode: isClaudeAgent ? fastMode : null,
        thinkingLevel: thinkingLevel === "default" ? null : thinkingLevel,
        openCodeAgent: openCodeAgent || null,
        openCodeVariant: openCodeVariant || null,
      });
      toast.success(t("settings:agentRoles.saved"));
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      setSaving(false);
      toast.error(t("settings:agentRoles.saveFailed"));
    }
  };

  return (
    <Dialog disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{t("settings:agentRoles.editTitle")}</DialogTitle>
        </DialogHeader>
        <form className="contents" onSubmit={handleSubmit}>
          <FieldGroup className="pb-2">
            <Field>
              <FieldLabel htmlFor="agent-role-name">
                {t("settings:agentRoles.name")}
              </FieldLabel>
              <Input
                autoFocus
                id="agent-role-name"
                maxLength={80}
                placeholder={t("settings:agentRoles.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <AgentRoleRuntimeFields
                agentId={agentId}
                agents={agents}
                collaborationMode={collaborationMode}
                compatibleProviders={compatibleProviders}
                fastMode={fastMode}
                isLoading={isLoading}
                modelValue={modelValue}
                openCodeAgent={openCodeAgent}
                openCodeVariant={openCodeVariant}
                permissionMode={permissionMode}
                reasoningEffort={reasoningEffort}
                serviceTier={serviceTier}
                thinkingLevel={thinkingLevel}
                onAgentChange={(next) => void handleSelectAgent(next)}
                onCollaborationModeChange={setCollaborationMode}
                onFastModeChange={setFastMode}
                onModelChange={setModelValue}
                onOpenCodeAgentChange={setOpenCodeAgent}
                onOpenCodeVariantChange={setOpenCodeVariant}
                onPermissionModeChange={setPermissionMode}
                onReasoningEffortChange={setReasoningEffort}
                onServiceTierChange={setServiceTier}
                onThinkingLevelChange={setThinkingLevel}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="py-3">
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  {t("settings:agentRoles.cancel")}
                </Button>
              }
            />
            <Button disabled={!name.trim() || saving} type="submit">
              {t("settings:agentRoles.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
