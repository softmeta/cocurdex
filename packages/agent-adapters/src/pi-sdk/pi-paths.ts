import { tmpdir } from "node:os";
import path from "node:path";

export function getPiAgentDir(userDataPath: string | undefined) {
  if (!userDataPath) {
    return path.join(tmpdir(), "cocurdex", "pi-agent");
  }

  return path.join(userDataPath, "pi-agent");
}
