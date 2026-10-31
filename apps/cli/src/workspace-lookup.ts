import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";

export async function resolveWorkspaceId(workspaceValue: string) {
  const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
  const workspace = workspaces.find(
    (item) =>
      item.id === workspaceValue || item.rootPaths.includes(workspaceValue),
  );
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceValue}`);
  }
  return workspace.id;
}
