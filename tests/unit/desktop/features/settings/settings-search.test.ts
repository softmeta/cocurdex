import { describe, expect, it } from "vitest";
import {
  normalizeSettingsSearchText,
  type SettingsSearchDoc,
  searchSettings,
} from "@/features/settings/search/settings-search";

function doc(
  id: string,
  section: SettingsSearchDoc["section"],
  titles: string[],
  extra: { contexts?: string[]; descriptions?: string[] } = {},
): SettingsSearchDoc {
  return {
    id,
    section,
    title: titles[0],
    titles: titles.map(normalizeSettingsSearchText),
    contexts: (extra.contexts ?? []).map(normalizeSettingsSearchText),
    descriptions: (extra.descriptions ?? []).map(normalizeSettingsSearchText),
  };
}

const sections = [
  { id: "general" as const, labels: ["常规", "general"] },
  { id: "appearance" as const, labels: ["外观", "appearance"] },
  { id: "environment" as const, labels: ["环境", "environment"] },
];

const docs = [
  doc("general.language", "general", ["语言", "Language"], {
    contexts: ["常规", "general"],
    descriptions: ["选择界面语言", "Choose the interface language"],
  }),
  doc(
    "general.completionSound",
    "general",
    ["完成提示音", "Completion sound"],
    {
      contexts: ["常规", "general", "通知", "notifications"],
    },
  ),
  doc("appearance.uiFontSize", "appearance", ["界面字号", "UI font size"], {
    contexts: ["外观", "appearance", "字体", "typography"],
  }),
  doc("environment.httpProxy", "environment", ["HTTP 代理", "HTTP proxy"], {
    contexts: ["环境", "environment"],
    descriptions: ["用于 {{scheme}} 请求", "Used for {{scheme}} requests"],
  }),
];

function ids(query: string) {
  return searchSettings(query, sections, docs).map((result) => ({
    section: result.section,
    sectionMatched: result.sectionMatched,
    settings: result.settings.map((setting) => setting.id),
  }));
}

describe("searchSettings", () => {
  it("returns nothing for a blank query", () => {
    expect(ids("   ")).toEqual([]);
  });

  it("matches a setting title in another locale", () => {
    expect(ids("proxy")).toEqual([
      {
        section: "environment",
        sectionMatched: false,
        settings: ["environment.httpProxy"],
      },
    ]);
  });

  it("is case- and width-insensitive", () => {
    expect(ids("ＨＴＴＰ")[0]?.settings).toEqual(["environment.httpProxy"]);
  });

  it("finds settings through their group", () => {
    expect(ids("通知")[0]?.settings).toEqual(["general.completionSound"]);
  });

  it("lists a matching section with all of its settings", () => {
    expect(ids("外观")).toEqual([
      {
        section: "appearance",
        sectionMatched: true,
        settings: ["appearance.uiFontSize"],
      },
    ]);
  });

  it("requires every term to match", () => {
    expect(ids("appearance font")[0]?.settings).toEqual([
      "appearance.uiFontSize",
    ]);
    expect(ids("appearance proxy")).toEqual([]);
  });

  it("ranks title matches above description matches", () => {
    const results = searchSettings("language", sections, [
      doc("environment.locale", "environment", ["Locale"], {
        descriptions: ["Sets the language of requests"],
      }),
      ...docs,
    ]);
    expect(results.map((result) => result.section)).toEqual([
      "general",
      "environment",
    ]);
  });

  it("ignores interpolation placeholders", () => {
    expect(ids("scheme")).toEqual([]);
  });
});
