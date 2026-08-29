// Claude Agent SDK 的 `summary` 会按 customTitle → lastPrompt →
// summaryHint → firstPrompt 回退。SDK 会话通常写不出 ai-title，
// 直接用 summary 就会把用户原文当成会话标题。

interface ClaudeNativeSessionTitleInfo {
  customTitle?: string;
  firstPrompt?: string;
  summary: string;
}

function normalizeTitleText(value: string | undefined) {
  const title = value?.trim();
  return title ? title : null;
}

export function readClaudeNativeSessionTitle(
  info: ClaudeNativeSessionTitleInfo | undefined,
) {
  if (!info) {
    return null;
  }

  const customTitle = normalizeTitleText(info.customTitle);
  const firstPrompt = normalizeTitleText(info.firstPrompt);
  if (customTitle && customTitle !== firstPrompt) {
    return customTitle;
  }

  return null;
}
