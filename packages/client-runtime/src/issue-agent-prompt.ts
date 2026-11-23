export interface IssueAgentPromptSource {
  identifier: string;
  title: string;
  description: string | null;
}

const EMBEDDED_IMAGE_SCHEME = "cocurdex://image/";

export function buildIssueAgentPrompt(issue: IssueAgentPromptSource): string {
  const id = issue.identifier;
  const description = (issue.description ?? "")
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .trimEnd();
  const tracking = [
    `This issue lives in Cocurdex. Track it with the \`cocurdex\` CLI:`,
    `- Sub-issues, relations, and comments: \`cocurdex issue show ${id} --detail --json\``,
    `- Before you start: \`cocurdex issue update ${id} --status doing\``,
    `- When the acceptance criteria are met and the checks pass: \`cocurdex issue update ${id} --status review\`, then record what you verified with \`cocurdex issue comment ${id} --body-file <path>\``,
    `- \`cocurdex issue statuses --json\` lists the status ids when \`doing\` or \`review\` has been renamed`,
  ];
  if (description.includes(EMBEDDED_IMAGE_SCHEME)) {
    tracking.push(
      `- Read an embedded \`${EMBEDDED_IMAGE_SCHEME}…\` image from the file path that \`cocurdex image locate <uri> --json\` prints`,
    );
  }
  return [
    `Implement Cocurdex issue ${id}: ${issue.title}`,
    description,
    "---",
    tracking.join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
