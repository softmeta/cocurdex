import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import { i18n } from "@/i18n";
import { supportedLocales } from "@/i18n/language";
import { desktopApi } from "@/lib";
import type { SettingsSectionItem } from "../settings-sections";
import {
  normalizeSettingsSearchText,
  type SettingsSearchDoc,
} from "./settings-search";
import {
  type SettingsSearchTextKey,
  settingsSearchEntries,
} from "./settings-search-index";

type Translate = (text: SettingsSearchTextKey) => string;

function translatorFor(language: string): Translate {
  const settingsT = i18n.getFixedT(language, "settings");
  const memoryT = i18n.getFixedT(language, "memory");
  return (text) =>
    text.ns === "memory" ? memoryT(text.key) : settingsT(text.key);
}

function sectionLabelKey(section: SettingsSectionItem): SettingsSearchTextKey {
  return { ns: "settings", key: `sections.${section.labelKey}` };
}

function normalizedIn(
  translators: readonly Translate[],
  text: SettingsSearchTextKey | undefined,
): string[] {
  if (!text) return [];
  return [
    ...new Set(translators.map((t) => normalizeSettingsSearchText(t(text)))),
  ].filter(Boolean);
}

export interface SettingsSearchCorpus {
  sections: Array<{ id: SettingsSectionId; labels: string[] }>;
  docs: SettingsSearchDoc[];
}

export function buildSettingsSearchCorpus(
  language: string,
  sections: readonly SettingsSectionItem[],
): SettingsSearchCorpus {
  const languages = [
    language,
    ...supportedLocales.filter((locale) => locale !== language),
  ];
  const translators = languages.map(translatorFor);
  const [current] = translators;
  const sectionById = new Map<SettingsSectionId, SettingsSectionItem>(
    sections.map((section) => [section.id, section]),
  );

  const docs: SettingsSearchDoc[] = [];
  for (const entry of settingsSearchEntries) {
    const section = sectionById.get(entry.section);
    if (!section) continue;
    if (entry.requires && !desktopApi.capabilities[entry.requires]) continue;
    docs.push({
      id: entry.id,
      section: entry.section,
      title: current(entry.title),
      fallbackId: entry.fallbackId,
      titles: normalizedIn(translators, entry.title),
      contexts: [
        ...normalizedIn(translators, sectionLabelKey(section)),
        ...normalizedIn(translators, entry.group),
      ],
      descriptions: normalizedIn(translators, entry.description),
    });
  }

  return {
    sections: sections.map((section) => ({
      id: section.id,
      labels: normalizedIn(translators, sectionLabelKey(section)),
    })),
    docs,
  };
}
