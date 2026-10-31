import type { AgentAuthMethod } from "@cocurdex/shared";
import type { AcpConnection, AcpConnectionFactory } from "./acp-connection";
import {
  type AcpModelCatalogSpec,
  resetAcpProviderModelsCache,
} from "./acp-model-catalog";
import {
  buildProbeInitializeRequest,
  silentProbeHandlers,
  withProbeCwd,
} from "./acp-probe";
import { createSdkAcpConnection } from "./sdk-acp-connection";

export interface AcpProviderLoginSpec extends AcpModelCatalogSpec {
  authMethodPriority: string[];
}

export interface AcpProviderAuthInfo {
  methods: AgentAuthMethod[];
  loginMethodId: string | null;
  logoutSupported: boolean;
}

const ACP_PROVIDER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const ACP_PROVIDER_AUTH_PROBE_TIMEOUT_MS = 20_000;

interface InFlightLogin {
  controller: AbortController;
  methodId: string | undefined;
  promise: Promise<void>;
}

const inFlightLogins = new Map<string, InFlightLogin>();

export class AcpLoginCancelledError extends Error {
  constructor(providerName: string) {
    super(`${providerName} login was cancelled`);
    this.name = "AcpLoginCancelledError";
  }
}

async function withDeadline<T>(
  run: () => Promise<T>,
  timeout: AcpAuthDeadline,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(timeout.message)),
          timeout.ms,
        );
        onAbort = () => reject(timeout.signal?.reason);
        if (timeout.signal?.aborted) {
          onAbort();
          return;
        }
        timeout.signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) {
      timeout.signal?.removeEventListener("abort", onAbort);
    }
  }
}

interface AcpAuthDeadline {
  ms: number;
  message: string;
  signal?: AbortSignal;
}

function withInitializedConnection<T>(
  spec: AcpProviderLoginSpec,
  connectionFactory: AcpConnectionFactory,
  timeout: AcpAuthDeadline,
  run: (connection: AcpConnection, auth: AcpProviderAuthInfo) => Promise<T>,
): Promise<T> {
  return withProbeCwd(async (cwd) => {
    const connection = await connectionFactory({
      args: spec.args,
      command: spec.command,
      env: spec.env,
      cwd,
      handlers: silentProbeHandlers,
    });
    try {
      return await withDeadline(async () => {
        const response = await connection.initialize(
          buildProbeInitializeRequest(spec),
        );
        return run(connection, toAuthInfo(spec, response));
      }, timeout);
    } finally {
      await connection.close();
    }
  });
}

function toAuthInfo(
  spec: AcpProviderLoginSpec,
  response: Awaited<ReturnType<AcpConnection["initialize"]>>,
): AcpProviderAuthInfo {
  const methods = (response.authMethods ?? []).map((method) => ({
    id: method.id,
    name: method.name,
    description: method.description ?? null,
  }));
  const advertised = methods.map((method) => method.id);
  return {
    methods,
    loginMethodId:
      spec.authMethodPriority.find((id) => advertised.includes(id)) ??
      advertised[0] ??
      null,
    logoutSupported: response.agentCapabilities?.auth?.logout != null,
  };
}

export function readAcpProviderAuth(
  spec: AcpProviderLoginSpec,
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { timeoutMs?: number } = {},
): Promise<AcpProviderAuthInfo> {
  return withInitializedConnection(
    spec,
    connectionFactory,
    {
      ms: options.timeoutMs ?? ACP_PROVIDER_AUTH_PROBE_TIMEOUT_MS,
      message: `${spec.providerName} did not answer in time`,
    },
    async (_connection, auth) => auth,
  );
}

export function loginAcpProvider(
  spec: AcpProviderLoginSpec,
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { methodId?: string; timeoutMs?: number } = {},
): Promise<void> {
  const pending = inFlightLogins.get(spec.providerId);
  if (pending) {
    if (pending.methodId !== options.methodId) {
      return Promise.reject(
        new Error(`${spec.providerName} is already signing in`),
      );
    }
    return pending.promise;
  }

  const controller = new AbortController();
  const promise = withInitializedConnection(
    spec,
    connectionFactory,
    {
      ms: options.timeoutMs ?? ACP_PROVIDER_LOGIN_TIMEOUT_MS,
      message: `${spec.providerName} login timed out`,
      signal: controller.signal,
    },
    async (connection, auth) => {
      const methodId = options.methodId ?? auth.loginMethodId;
      if (!methodId) {
        return;
      }
      if (!auth.methods.some((method) => method.id === methodId)) {
        throw new Error(
          `${spec.providerName} does not offer the login method ${methodId}`,
        );
      }
      await connection.authenticate({ methodId });
    },
  )
    .then(() => {
      resetAcpProviderModelsCache(spec.providerId);
    })
    .finally(() => {
      inFlightLogins.delete(spec.providerId);
    });

  inFlightLogins.set(spec.providerId, {
    controller,
    methodId: options.methodId,
    promise,
  });
  return promise;
}

export function cancelAcpProviderLogin(spec: AcpProviderLoginSpec): boolean {
  const pending = inFlightLogins.get(spec.providerId);
  if (!pending) {
    return false;
  }
  pending.controller.abort(new AcpLoginCancelledError(spec.providerName));
  return true;
}

export async function logoutAcpProvider(
  spec: AcpProviderLoginSpec,
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  await inFlightLogins.get(spec.providerId)?.promise.catch(() => undefined);
  await withInitializedConnection(
    spec,
    connectionFactory,
    {
      ms: options.timeoutMs ?? ACP_PROVIDER_AUTH_PROBE_TIMEOUT_MS,
      message: `${spec.providerName} logout timed out`,
    },
    async (connection, auth) => {
      if (!auth.logoutSupported) {
        throw new Error(`${spec.providerName} does not support logging out`);
      }
      await connection.logout({});
    },
  );
  resetAcpProviderModelsCache(spec.providerId);
}
