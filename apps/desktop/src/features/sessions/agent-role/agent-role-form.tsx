import {
  AGENT_ROLE_DESCRIPTION_MAX_LENGTH,
  type AgentId,
  type AgentPermissionMode,
  type AgentRoleRecord,
  type AgentThinkingLevel,
  type CodexReasoningEffort,
  type SaveAgentRolePayload,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@/components/ui";
import { DialogFooter } from "@/components/ui/dialog";
import { useMountEffect } from "@/lib";
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
import {
  agentsAtom,
  getDefaultPermissionMode,
  getSessionModeOptions,
  supportsSessionMode,
} from "../session-store";
import { AgentRoleAvatarPicker } from "./agent-role-avatar-picker";
import { AgentRoleRuntimeFields } from "./agent-role-runtime-fields";
import { saveAgentRoleRecord } from "./agent-role-store";

export function AgentRoleForm({
  role,
  onCancel,
  onSaved,
}: {
  role: SaveAgentRolePayload;
  onCancel(): void;
  onSaved(role: AgentRoleRecord): void;
}) {
  const { t } = useTranslation(["settings", "sessions"]);
  const agents = useAtomValue(agentsAtom);
  const [name, setName] = useState(role.name);
  const [avatar, setAvatar] = useState(role.avatar ?? null);
  const [description, setDescription] = useState(role.description ?? "");
  const [agentId, setAgentId] = useState<AgentId>(role.agentId);
  const [modelValue, setModelValue] = useState(() =>
    role.providerId && role.modelId
      ? getProviderModelValue(role.providerId, role.modelId)
      : "",
  );
  const [permissionMode, setPermissionMode] =
    useState<AgentPermissionMode | null>(role.permissionMode);
  const [sessionModeId, setSessionModeId] = useState<string | null>(
    role.sessionModeId,
  );
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
    const cachedResult =
      getCachedProviderModelEntry(providerModelCache, nextAgentId)?.result ??
      null;
    if (cachedResult) {
      setModelValue(
        getDefaultProviderModelValue(
          nextAgentId,
          cachedResult.items,
          cachedResult.defaultSelection,
        ),
      );
      setIsLoading(false);
    } else {
      setModelValue("");
      setIsLoading(true);
    }
    setPermissionMode(getDefaultPermissionMode(agents, nextAgentId));
    setSessionModeId(
      getSessionModeOptions(agents, nextAgentId).some(
        (mode) => mode.id === sessionModeId,
      )
        ? sessionModeId
        : null,
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
        description: description.trim() || null,
        agentId,
        providerId: parsed?.providerId ?? null,
        modelId: parsed?.modelId ?? null,
        modelName: selectedProviderModel?.model.name ?? role.modelName ?? null,
        permissionMode,
        sessionModeId: supportsSessionMode(agents, agentId, sessionModeId)
          ? sessionModeId
          : null,
        reasoningEffort: reasoningEffort
          ? (reasoningEffort as CodexReasoningEffort)
          : null,
        serviceTier: serviceTier || null,
        fastMode: isClaudeAgent ? fastMode : null,
        thinkingLevel: thinkingLevel === "default" ? null : thinkingLevel,
        openCodeAgent: openCodeAgent || null,
        openCodeVariant: openCodeVariant || null,
        avatar,
      });
      toast.success(t("settings:agentRoles.saved"));
      onSaved(saved);
    } catch {
      setSaving(false);
      toast.error(t("settings:agentRoles.saveFailed"));
    }
  };

  return (
    <form className="contents" onSubmit={handleSubmit}>
      <FieldGroup className="pb-2">
        <Field>
          <FieldLabel htmlFor="agent-role-name">
            {t("settings:agentRoles.name")}
          </FieldLabel>
          <div className="flex items-center gap-2">
            <AgentRoleAvatarPicker
              role={{ id: role.id ?? "new", name, agentId, avatar }}
              onChange={setAvatar}
            />
            <Input
              autoFocus
              id="agent-role-name"
              maxLength={80}
              placeholder={t("settings:agentRoles.namePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-role-description">
            {t("settings:agentRoles.roleDescription")}
          </FieldLabel>
          <Textarea
            id="agent-role-description"
            className="max-h-40 min-h-20"
            maxLength={AGENT_ROLE_DESCRIPTION_MAX_LENGTH}
            placeholder={t("settings:agentRoles.roleDescriptionPlaceholder")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t("settings:agentRoles.runtime")}</FieldLabel>
          <AgentRoleRuntimeFields
            agentId={agentId}
            agents={agents}
            sessionModeId={sessionModeId}
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
            onSessionModeChange={setSessionModeId}
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
        <Button onClick={onCancel} type="button" variant="outline">
          {t("settings:agentRoles.cancel")}
        </Button>
        <Button disabled={!name.trim() || saving} type="submit">
          {t("settings:agentRoles.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
