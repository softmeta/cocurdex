export const USER_MESSAGE_COLLAPSE_MAX_LINES = 10;
export const USER_MESSAGE_COLLAPSE_MAX_CHARS = 720;

export function isLongUserMessageText(text: string): boolean {
  if (text.length > USER_MESSAGE_COLLAPSE_MAX_CHARS) {
    return true;
  }

  let lineCount = 1;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10) {
      lineCount += 1;
      continue;
    }
    if (code === 13 && text.charCodeAt(index + 1) !== 10) {
      lineCount += 1;
    }
  }

  return lineCount > USER_MESSAGE_COLLAPSE_MAX_LINES;
}
