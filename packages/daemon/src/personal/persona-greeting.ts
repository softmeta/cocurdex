import { matchSupportedLocale, type SupportedLocale } from "@cocurdex/shared";

const GREETINGS: Record<SupportedLocale, readonly string[]> = {
  "en-US": [
    "Hi! What would you like help with first?",
    "Hey there! What's on your plate today?",
    "Hi! Tell me what to keep an eye on for you.",
    "Hello! Where should we start?",
  ],
  "zh-CN": [
    "嗨～想先让我帮你做点什么？",
    "你好呀！今天有什么要我帮你盯着的？",
    "很高兴认识你！有什么事尽管交给我。",
    "嗨～我们从哪件事开始？",
  ],
};

export function personaGreeting(
  locale: SupportedLocale | null | undefined,
  random: () => number = Math.random,
) {
  const lines =
    GREETINGS[
      locale ??
        matchSupportedLocale([Intl.DateTimeFormat().resolvedOptions().locale])
    ];
  return lines[Math.floor(random() * lines.length)] ?? lines[0] ?? "";
}
