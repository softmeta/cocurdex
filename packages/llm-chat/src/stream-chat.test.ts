import type { AgentRuntimeProviderConfig } from "@cocurdex/shared";
import { expect, it } from "vitest";
import { validateChatRequest } from "./stream-chat";

const config: AgentRuntimeProviderConfig = {
  providerId: "custom",
  providerName: "Custom",
  modelId: "test",
  modelName: "Test",
  api: "anthropic-messages",
  baseUrl: "https://example.test/v1",
  apiKey: "key",
};

it("rejects unknown and inherited prototype API names", () => {
  for (const api of ["not-a-real-api", "toString", "constructor"]) {
    expect(() =>
      validateChatRequest({ ...config, api: api as typeof config.api }, []),
    ).toThrow("does not support provider API");
  }
});
