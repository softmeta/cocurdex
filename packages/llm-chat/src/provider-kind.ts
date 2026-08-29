import type { ProviderApi, ProviderConfigRecord } from "@cocurdex/shared";

// Coarse classification of a provider — chooses which AI SDK adapter to
// instantiate. The model api is authoritative when it names a vendor; for
// OpenAI-shaped apis we probe the base URL for well-known hosts. Never match
// on the display name — users name proxies after the models they front.
export type LlmProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible";

export function classifyProvider(
  provider: Pick<ProviderConfigRecord, "baseUrl">,
  api: ProviderApi,
): LlmProviderKind {
  if (api === "anthropic-messages") {
    return "anthropic";
  }

  if (api === "google-generative-ai") {
    return "google";
  }

  const host = provider.baseUrl.toLowerCase();
  if (host.includes("anthropic")) return "anthropic";
  if (host.includes("googleapis")) return "google";
  if (host.includes("openai.com")) return "openai";
  return "openai-compatible";
}
