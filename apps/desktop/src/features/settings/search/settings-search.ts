import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";

export interface SettingsSearchDoc {
  id: string;
  section: SettingsSectionId;
  title: string;
  fallbackId?: string;
  titles: readonly string[];
  contexts: readonly string[];
  descriptions: readonly string[];
}

export interface SettingsSearchSectionResult {
  section: SettingsSectionId;
  sectionMatched: boolean;
  settings: SettingsSearchDoc[];
}

const TITLE_PREFIX_SCORE = 8;
const TITLE_SCORE = 6;
const CONTEXT_SCORE = 3;
const DESCRIPTION_SCORE = 1;

export function normalizeSettingsSearchText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query: string): string[] {
  const normalized = normalizeSettingsSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

function termScore(term: string, doc: SettingsSearchDoc): number {
  if (doc.titles.some((title) => title.startsWith(term))) {
    return TITLE_PREFIX_SCORE;
  }
  if (doc.titles.some((title) => title.includes(term))) return TITLE_SCORE;
  if (doc.contexts.some((context) => context.includes(term))) {
    return CONTEXT_SCORE;
  }
  if (doc.descriptions.some((text) => text.includes(term))) {
    return DESCRIPTION_SCORE;
  }
  return 0;
}

function docScore(terms: readonly string[], doc: SettingsSearchDoc): number {
  let total = 0;
  for (const term of terms) {
    const score = termScore(term, doc);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

function sectionScore(terms: readonly string[], labels: readonly string[]) {
  return terms.every((term) => labels.some((label) => label.includes(term)))
    ? TITLE_SCORE * terms.length
    : 0;
}

export function searchSettings(
  query: string,
  sections: ReadonlyArray<{
    id: SettingsSectionId;
    labels: readonly string[];
  }>,
  docs: readonly SettingsSearchDoc[],
): SettingsSearchSectionResult[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const ranked = sections.map((section, order) => {
    const ownScore = sectionScore(terms, section.labels);
    const settings = docs
      .filter((doc) => doc.section === section.id)
      .map((doc, index) => ({ doc, index, score: docScore(terms, doc) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const best = Math.max(ownScore, settings[0]?.score ?? 0);
    return {
      best,
      order,
      result: {
        section: section.id,
        sectionMatched: ownScore > 0,
        settings: settings.map((entry) => entry.doc),
      },
    };
  });

  return ranked
    .filter((entry) => entry.best > 0)
    .sort((a, b) => b.best - a.best || a.order - b.order)
    .map((entry) => entry.result);
}
