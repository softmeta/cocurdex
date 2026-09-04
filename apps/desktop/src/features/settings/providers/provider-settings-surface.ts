export type ProviderSettingsSurface =
  | { kind: "empty" }
  | { kind: "create"; templateId: string }
  | { kind: "provider"; id: string };

export function resolveProviderSettingsSurface(input: {
  isCreatingProvider: boolean;
  pendingTemplateId: string;
  providerIds: readonly string[];
  selectedProviderId: string | null;
}): ProviderSettingsSurface {
  if (input.isCreatingProvider) {
    return { kind: "create", templateId: input.pendingTemplateId };
  }

  if (
    input.selectedProviderId &&
    input.providerIds.includes(input.selectedProviderId)
  ) {
    return { kind: "provider", id: input.selectedProviderId };
  }

  const firstProviderId = input.providerIds[0];
  if (firstProviderId) {
    return { kind: "provider", id: firstProviderId };
  }

  return { kind: "empty" };
}
