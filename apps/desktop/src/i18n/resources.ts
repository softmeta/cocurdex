import agentEnUs from "../locales/en-US/agent.json";
import browserEnUs from "../locales/en-US/browser.json";
import chatEnUs from "../locales/en-US/chat.json";
import commonEnUs from "../locales/en-US/common.json";
import editorEnUs from "../locales/en-US/editor.json";
import issuesEnUs from "../locales/en-US/issues.json";
import notesEnUs from "../locales/en-US/notes.json";
import onboardingEnUs from "../locales/en-US/onboarding.json";
import searchEnUs from "../locales/en-US/search.json";
import sessionsEnUs from "../locales/en-US/sessions.json";
import settingsEnUs from "../locales/en-US/settings.json";
import agentZhCn from "../locales/zh-CN/agent.json";
import browserZhCn from "../locales/zh-CN/browser.json";
import chatZhCn from "../locales/zh-CN/chat.json";
import commonZhCn from "../locales/zh-CN/common.json";
import editorZhCn from "../locales/zh-CN/editor.json";
import issuesZhCn from "../locales/zh-CN/issues.json";
import notesZhCn from "../locales/zh-CN/notes.json";
import onboardingZhCn from "../locales/zh-CN/onboarding.json";
import searchZhCn from "../locales/zh-CN/search.json";
import sessionsZhCn from "../locales/zh-CN/sessions.json";
import settingsZhCn from "../locales/zh-CN/settings.json";

export const resources = {
  "en-US": {
    agent: agentEnUs,
    browser: browserEnUs,
    chat: chatEnUs,
    common: commonEnUs,
    editor: editorEnUs,
    issues: issuesEnUs,
    notes: notesEnUs,
    onboarding: onboardingEnUs,
    search: searchEnUs,
    sessions: sessionsEnUs,
    settings: settingsEnUs,
  },
  "zh-CN": {
    agent: agentZhCn,
    browser: browserZhCn,
    chat: chatZhCn,
    common: commonZhCn,
    editor: editorZhCn,
    issues: issuesZhCn,
    notes: notesZhCn,
    onboarding: onboardingZhCn,
    search: searchZhCn,
    sessions: sessionsZhCn,
    settings: settingsZhCn,
  },
} as const;

export type TranslationResources = (typeof resources)["en-US"];
