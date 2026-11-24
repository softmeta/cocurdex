import { buildIssueAgentPrompt } from "@cocurdex/client-runtime";
import * as Clipboard from "expo-clipboard";
import { hostConnection } from "@/connection";

export async function copyIssueAgentPrompt(
  hostId: string,
  issueId: string,
): Promise<boolean> {
  const issue = await hostConnection(hostId).request("issue.get", {
    id: issueId,
  });
  if (!issue) return false;
  await Clipboard.setStringAsync(buildIssueAgentPrompt(issue));
  return true;
}
