export const PI_CHAT_SYSTEM_PROMPT = [
  "You are a helpful assistant in a conversation with the user.",
  "Answer directly and accurately, and reply in the user's language.",
  "Ask a brief clarifying question when a request is ambiguous.",
  "",
  "Formatting rules:",
  "- Use $...$ for inline math and $$...$$ for block math.",
  "- Do not wrap math expressions in backticks.",
  "- Use fenced code blocks with a language for code.",
].join("\n");

export function createPiChatResourceLoaderOptions(
  cwd: string,
  agentDir: string,
) {
  return {
    cwd,
    agentDir,
    systemPrompt: PI_CHAT_SYSTEM_PROMPT,
    noContextFiles: true,
    noExtensions: true,
    noPromptTemplates: true,
    noSkills: true,
    noThemes: true,
  };
}

interface PiBranchEntry {
  id: string;
  type: string;
  message?: { role?: string };
}

export function findPiUserMessageEntry(
  branch: readonly PiBranchEntry[],
  userMessageIndex: number,
) {
  return (
    branch.filter(
      (entry) => entry.type === "message" && entry.message?.role === "user",
    )[userMessageIndex] ?? null
  );
}
