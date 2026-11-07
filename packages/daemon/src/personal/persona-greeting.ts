import {
  type AgentRoleRecord,
  matchSupportedLocale,
  type SupportedLocale,
} from "@cocurdex/shared";

const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  "en-US": "English",
  "zh-CN": "Simplified Chinese",
};

const FALLBACK_GREETINGS: Record<SupportedLocale, string> = {
  "en-US":
    "Hi, I'm {{name}}! I can remember what matters to you, send you a short brief each morning, remind you of things on schedule, and hand project work to coding agents. What should we start with?",
  "zh-CN":
    "嗨，我是{{name}}！我能记住你在意的事，每天早上给你一份简报，按时提醒你，也能把项目里的活儿交给编程助手去做。想先从哪件事开始？",
};

export const GREETING_MAX_TOKENS = 1024;

export interface PersonaGreetingInput {
  role: AgentRoleRecord;
  soul: string | null;
  locale: SupportedLocale | null | undefined;
}

function resolveLocale(locale: SupportedLocale | null | undefined) {
  return (
    locale ??
    matchSupportedLocale([Intl.DateTimeFormat().resolvedOptions().locale])
  );
}

function section(title: string, body: string | null | undefined) {
  const text = body?.trim();
  return text ? `${title}:\n${text}` : null;
}

export function personaGreetingPrompt({
  role,
  soul,
  locale,
}: PersonaGreetingInput) {
  const language = LANGUAGE_NAMES[resolveLocale(locale)];
  const systemPrompt = [
    `You are ${role.name.trim()}, a personal assistant who lives in the user's Cocurdex app. You are about to send the very first message of your conversation with the user, before they have said anything.`,
    section("How you describe yourself", role.description),
    section("Your instructions", role.instructions),
    section("Your personality and voice", soul),
    [
      "What you can do for the user:",
      "- Remember what they tell you about themselves and their preferences, across conversations",
      "- Keep an eye on their day and send a short daily brief",
      "- Run routines on a schedule, such as reminders and recurring check-ins",
      "- Hand coding and project work to agents in their workspaces and report back",
      "- Use the apps they connect, such as GitHub or Notion",
    ].join("\n"),
    [
      "How to write the greeting:",
      "- Introduce yourself by name, warmly and naturally, the way a person would when meeting someone new.",
      "- Mention two or three things you can help with, woven into your sentences rather than listed. If your instructions give you a specialty, lead with it.",
      "- End with one light question that invites the user to start.",
      "- Two to four short sentences. Plain text: no markdown, no lists, no quotes around the message.",
      `- Write in ${language}.`,
      "- Reply with the greeting only.",
    ].join("\n"),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
  return {
    systemPrompt,
    message: "Say hello to the user now.",
    maxTokens: GREETING_MAX_TOKENS,
  };
}

export function fallbackPersonaGreeting(
  name: string,
  locale: SupportedLocale | null | undefined,
) {
  return FALLBACK_GREETINGS[resolveLocale(locale)].replaceAll(
    "{{name}}",
    name.trim(),
  );
}
