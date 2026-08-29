// Provider-hosted web search wiring. See docs/plans/2026-05-21-chat-mode.md §6.
// We deliberately only support the provider-hosted path here; custom search
// APIs (Brave / Tavily / ...) are a separate strategy slot — see §6.1.

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";
import type { LlmProviderKind } from "./provider-kind";

// Returns the provider-hosted web search tools for `streamText({ tools })`,
// or null when the provider has no hosted search. Stock OpenAI-compatible
// endpoints (Together, Groq, local) don't expose one; users wanting search
// there should switch to the custom search API strategy (§6.1).
export function planWebSearch(providerKind: LlmProviderKind): ToolSet | null {
  switch (providerKind) {
    case "openai":
      return { web_search: openai.tools.webSearch({}) };
    case "anthropic":
      return {
        web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
      };
    case "google":
      return { google_search: google.tools.googleSearch({}) };
    case "openai-compatible":
      return null;
  }
}

export function supportsWebSearch(providerKind: LlmProviderKind): boolean {
  return planWebSearch(providerKind) !== null;
}
