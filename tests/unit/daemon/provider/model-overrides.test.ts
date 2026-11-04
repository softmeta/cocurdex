import { clearBuiltInProviderModelsCache } from "@cocurdex/daemon/internal/provider/models";
import { DaemonProviderService } from "@cocurdex/daemon/internal/provider/service";
import type { ProviderCredentials } from "@cocurdex/daemon/internal/provider-credentials/service";
import { DaemonState } from "@cocurdex/daemon/internal/state";
import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const listPiProviderModelsMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/agent-adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cocurdex/agent-adapters")>()),
  listPiBuiltInProviderIds: () => ["xiaomi-token-plan-cn"],
  listPiProviderModels: listPiProviderModelsMock,
}));

const temp = createTempDirs();
afterAll(() => temp.cleanup());

const now = "2026-11-03T00:00:00.000Z";

const provider: ProviderConfigRecord = {
  id: "xiaomi-token-plan-cn",
  name: "Xiaomi Token Plan CN",
  baseUrl: "https://example.invalid/v1",
  enabled: true,
  apiKeySecretId: null,
  headersJson: null,
  createdAt: now,
  updatedAt: now,
};

const catalogModel: ProviderModelRecord = {
  providerId: provider.id,
  modelId: "mimo-v2.6-flash",
  name: "MiMo-V2.6-Flash",
  api: "openai-completions",
  enabled: true,
  source: "api",
  contextLimit: 1_048_576,
  outputLimit: 131_072,
  capabilities: ["agent", "chat"],
  reasoning: true,
  createdAt: now,
  updatedAt: now,
};

let state: DaemonState;
let service: DaemonProviderService;

async function listModels() {
  return service.listAllModels({ providerIds: [provider.id] });
}

beforeEach(async () => {
  clearBuiltInProviderModelsCache();
  listPiProviderModelsMock.mockReset().mockResolvedValue([catalogModel]);
  state = new DaemonState(await temp.create("cocu-override-"));
  await state.saveProviderConfig(provider);
  service = new DaemonProviderService(state, {
    readApiKey: vi.fn(async () => "key"),
    readAuthState: vi.fn(async () => ({ type: "api_key" })),
  } as unknown as ProviderCredentials);
});

afterEach(() => state.close());

describe("built-in model parameter overrides", () => {
  it("keeps an edited parameter while later catalog changes still apply", async () => {
    await service.saveProviderModel({ ...catalogModel, outputLimit: 32_768 });

    clearBuiltInProviderModelsCache();
    listPiProviderModelsMock.mockResolvedValue([
      { ...catalogModel, contextLimit: 2_097_152 },
    ]);

    expect(await listModels()).toMatchObject([
      {
        modelId: catalogModel.modelId,
        outputLimit: 32_768,
        contextLimit: 2_097_152,
        overridden: true,
      },
    ]);
  });

  it("restores the catalog values on reset", async () => {
    await service.saveProviderModel({
      ...catalogModel,
      enabled: false,
      compatJson: '{"supportsDeveloperRole":false}',
    });

    await service.resetProviderModel(provider.id, catalogModel.modelId);

    expect(await listModels()).toEqual([catalogModel]);
  });

  it("reads a legacy whole-row copy as only its enabled flag and converts it on save", async () => {
    await state.saveProviderModel({
      ...catalogModel,
      enabled: false,
      contextLimit: 4_096,
    });

    expect(await listModels()).toEqual([{ ...catalogModel, enabled: false }]);

    await service.saveProviderModel({ ...catalogModel, enabled: true });

    expect(await state.listProviderModels(provider.id)).toEqual([]);
    expect(await listModels()).toEqual([catalogModel]);
  });

  it("refuses to reset a model the catalog does not ship", async () => {
    await expect(
      service.resetProviderModel(provider.id, "not-in-catalog"),
    ).rejects.toThrow(/not a built-in model/);
  });
});
