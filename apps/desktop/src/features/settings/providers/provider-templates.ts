import type {
  ProviderConfigRecord,
  ProviderTemplateRecord,
} from "@cocurdex/shared";

export function applyProviderTemplate(
  draft: ProviderConfigRecord,
  template: ProviderTemplateRecord,
  previous?: ProviderTemplateRecord,
): ProviderConfigRecord {
  const id = draft.id.trim();
  const name = draft.name.trim();
  return {
    ...draft,
    id: !id || id === previous?.id ? template.id : draft.id,
    name: !name || name === previous?.name ? template.name : draft.name,
    baseUrl: template.baseUrl,
  };
}
