import { buildIssueAgentPrompt } from "@cocurdex/client-runtime";
import { toast } from "sonner";
import { i18n } from "@/i18n";
import { issuesIpc } from "./issues-ipc";

export async function copyIssueAgentPrompt(issueId: string): Promise<void> {
  try {
    const issue = await issuesIpc.getIssue({ id: issueId });
    if (!issue) {
      toast.error(i18n.t("issues:detail.notFound"));
      return;
    }
    await navigator.clipboard.writeText(buildIssueAgentPrompt(issue));
    toast.success(i18n.t("issues:agentPrompt.copied"));
  } catch {
    toast.error(i18n.t("issues:agentPrompt.copyFailed"));
  }
}
