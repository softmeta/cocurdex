import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface AcpProbeSpec {
  args: string[];
  command: string;
  env?: Record<string, string>;
  initializeMeta?: Record<string, unknown>;
}

export async function withProbeCwd<T>(
  run: (cwd: string) => Promise<T>,
): Promise<T> {
  const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-acp-probe-"));
  try {
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export function buildProbeInitializeRequest(spec: AcpProbeSpec) {
  return {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
    clientInfo: { name: "Cocurdex", title: "Cocurdex", version: "0.0.0" },
    _meta: spec.initializeMeta,
  };
}

export const silentProbeHandlers = {
  onSessionUpdate() {},
  requestPermission() {
    return Promise.resolve({ outcome: { outcome: "cancelled" as const } });
  },
};
