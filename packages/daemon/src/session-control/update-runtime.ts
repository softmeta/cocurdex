import {
  type AgentPermissionMode,
  applySessionRuntime,
  type CompatibleProviderModel,
  createProviderSnapshotForModel,
  isAgentPermissionModeSupportedForModel,
  type SessionConfiguration,
  type SessionRecord,
  sessionConfigurationOf,
  snapshotRuntimeSelection,
  type UpdateSessionRuntimePayload,
} from "@cocurdex/shared";

export interface RuntimeUpdateContext {
  compatibleModels: readonly CompatibleProviderModel[];
  permissionModes: readonly AgentPermissionMode[];
}

function findModel(
  models: readonly CompatibleProviderModel[],
  selection: { providerId: string; modelId: string },
) {
  return models.find(
    (item) =>
      item.provider.id === selection.providerId &&
      item.model.modelId === selection.modelId,
  );
}

function permissionModeFor(
  session: SessionRecord,
  model: CompatibleProviderModel["model"],
  permissionModes: readonly AgentPermissionMode[],
) {
  const supported = (mode: AgentPermissionMode) =>
    isAgentPermissionModeSupportedForModel(
      session.agentType,
      mode,
      model.modelId,
      model.name,
    );
  const current = session.permissionMode;
  if (!current || supported(current)) return current;
  return permissionModes.find(supported);
}

export function resolveRuntimeUpdate(
  session: SessionRecord,
  input: UpdateSessionRuntimePayload,
  context: RuntimeUpdateContext,
): SessionConfiguration {
  if (session.archivedAt) {
    throw new Error("Restore the session before changing its configuration");
  }
  const current = session.providerSnapshot;
  const requested = input.model ?? current;
  if (!requested) {
    throw new Error(`${session.agentType} runs without a provider model`);
  }
  const model = findModel(context.compatibleModels, requested);
  if (!model) {
    throw new Error(
      `${requested.providerId}/${requested.modelId} is not available for ${session.agentType}`,
    );
  }
  const base =
    input.model || !current ? createProviderSnapshotForModel(model) : current;
  const providerSnapshot = applySessionRuntime(
    base,
    session.agentType,
    model.model.supportsFastMode ?? false,
    { ...snapshotRuntimeSelection(current), ...input.runtime },
  );
  return {
    ...sessionConfigurationOf(session),
    permissionMode: permissionModeFor(
      session,
      model.model,
      context.permissionModes,
    ),
    providerSnapshot,
  };
}
