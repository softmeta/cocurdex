import path from "node:path";
import type { ProviderAuthMethod, ProviderAuthState } from "@cocurdex/shared";
import type { AuthInteraction, AuthResult } from "@earendil-works/pi-ai";
import { registerBunOAuthFlows as registerBundledPiOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getPiAgentDir } from "./pi-paths";

export function registerBundledPiProviderOAuthFlows() {
  registerBundledPiOAuthFlows();
}

async function createProviderAuthRuntime(userDataPath: string) {
  const agentDir = getPiAgentDir(userDataPath);
  return ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
}

export async function readPiProviderAuthState(
  userDataPath: string,
  providerId: string,
): Promise<ProviderAuthState> {
  const runtime = await createProviderAuthRuntime(userDataPath);
  const auth = await runtime.checkAuth(providerId);
  return {
    providerId,
    type: auth?.type ?? null,
    source: auth?.source ?? null,
  };
}

export async function resolvePiProviderAuth(
  userDataPath: string,
  providerId: string,
): Promise<AuthResult | undefined> {
  const runtime = await createProviderAuthRuntime(userDataPath);
  return runtime.getAuth(providerId);
}

export async function loginPiProvider(
  userDataPath: string,
  providerId: string,
  method: ProviderAuthMethod,
  interaction: AuthInteraction,
) {
  const runtime = await createProviderAuthRuntime(userDataPath);
  await runtime.login(providerId, method, interaction);
}

export async function logoutPiProvider(
  userDataPath: string,
  providerId: string,
) {
  const runtime = await createProviderAuthRuntime(userDataPath);
  await runtime.logout(providerId);
}
