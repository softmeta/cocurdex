const SENT_PROMPT_PEEK_RATIO = 0.2;
const SENT_PROMPT_PEEK_MAX = 160;

export function sentPromptPeek(viewportHeight: number) {
  return Math.max(
    0,
    Math.min(
      SENT_PROMPT_PEEK_MAX,
      Math.round(viewportHeight * SENT_PROMPT_PEEK_RATIO),
    ),
  );
}
