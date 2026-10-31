import path from "node:path";
import type { AgentToolCallResult } from "@cocurdex/shared";
import { createContentAddressedStore } from "./content-addressed-store";

export const EXTERNAL_TOOL_RESULT_MIN_BYTES = 16 * 1024;
const UNREFERENCED_OUTPUT_MIN_AGE_MS = 10 * 60 * 1000;

export interface ToolOutputStore {
  put(result: AgentToolCallResult): Promise<string>;
  get(ref: string): Promise<AgentToolCallResult | null>;
  removeUnreferenced(keep: Set<string>): Promise<number>;
}

export function getToolOutputsRoot(userDataPath: string) {
  return path.join(userDataPath, "tool-outputs");
}

function parseResult(bytes: Buffer): AgentToolCallResult | null {
  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as AgentToolCallResult;
    return Array.isArray(parsed?.content) ? parsed : null;
  } catch {
    return null;
  }
}

export function createToolOutputStore(userDataPath: string): ToolOutputStore {
  const store = createContentAddressedStore(getToolOutputsRoot(userDataPath));
  return {
    async put(result) {
      const bytes = Buffer.from(
        JSON.stringify({
          content: result.content,
          rawOutput: result.rawOutput,
        }),
        "utf8",
      );
      return (await store.put(bytes)).hash;
    },
    async get(ref) {
      const bytes = await store.get(ref);
      return bytes ? parseResult(bytes) : null;
    },
    removeUnreferenced(keep) {
      return store.gc(keep, { minAgeMs: UNREFERENCED_OUTPUT_MIN_AGE_MS });
    },
  };
}
