import type {
  ProviderConfigRecord,
  ProviderTemplateRecord,
} from "@cocurdex/shared";

// Fills endpoint from the template. id/name are template-owned unless the
// user typed their own: a blank field, or one still holding the previously
// applied template's value, is overwritten; anything else is preserved. Pass
// `previous` when switching from an earlier template pick. Auth/advanced draft
// fields are untouched.
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
