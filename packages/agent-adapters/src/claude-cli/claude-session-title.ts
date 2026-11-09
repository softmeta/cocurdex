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
