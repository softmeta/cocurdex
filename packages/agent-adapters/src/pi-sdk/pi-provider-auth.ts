import type { ProviderAuthMethod, ProviderAuthState } from "@cocurdex/shared";
import type { AuthInteraction } from "@earendil-works/pi-ai";
import { registerBunOAuthFlows as registerBundledPiOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { logAdapterDiagnostic } from "../diagnostics";
import { createPiModelRuntime } from "./pi-model-runtime";
import { getPiAgentDir } from "./pi-paths";

export function registerBundledPiProviderOAuthFlows() {
  registerBundledPiOAuthFlows();
}

function createProviderAuthRuntime(userDataPath: string) {
  return createPiModelRuntime(userDataPath);
}

export async function readPiProviderAuthState(
  userDataPath: string,
  providerId: string,
): Promise<ProviderAuthState> {
  const runtime = await createProviderAuthRuntime(userDataPath);
  const auth = await runtime.checkAuth(providerId);
  if (!auth) {
    return { providerId, type: null, origin: null, source: null };
  }
  const credentials = await runtime.listCredentials();
  const isStored = credentials.some(
    (credential) => credential.providerId === providerId,
  );
  return {
    providerId,
    type: auth.type,
    origin: isStored ? "stored" : "ambient",
    source: isStored ? null : (auth.source ?? null),
  };
}

const CATALOG_REFRESH_TIMEOUT_MS = 15_000;

export async function loginPiProvider(
  userDataPath: string,
  providerId: string,
  method: ProviderAuthMethod,
  interaction: AuthInteraction,
) {
  const runtime = await createProviderAuthRuntime(userDataPath);
  const agentDir = getPiAgentDir(userDataPath);
  const settings = SettingsManager.create(agentDir, agentDir);
  try {
    await runtime.login(providerId, method, interaction, {
      getDeviceId: () => settings.getOrCreateDeviceId(),
    });
  } finally {
    await settings.flush();
  }
  const refreshed = await runtime.refresh({
    providers: [providerId],
    signal: AbortSignal.timeout(CATALOG_REFRESH_TIMEOUT_MS),
  });
  const error = refreshed.errors.get(providerId);
  if (error || refreshed.aborted) {
    logAdapterDiagnostic("warn", "pi: catalog refresh after login failed", {
      providerId,
      aborted: refreshed.aborted,
      error: error?.message,
    });
  }
}

export async function logoutPiProvider(
  userDataPath: string,
  providerId: string,
) {
  const runtime = await createProviderAuthRuntime(userDataPath);
  await runtime.logout(providerId);
}
