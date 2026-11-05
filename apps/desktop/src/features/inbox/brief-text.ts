import type { Brief, InboxItem } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { inboxKindLabel } from "./inbox-labels";

export function briefDayLabel(day: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function itemLine(t: TFunction<"personal">, item: InboxItem) {
  const label = inboxKindLabel(t, item.kind);
  const detail = item.detail ? ` · ${oneLine(item.detail)}` : "";
  return `- **${oneLine(item.title)}** · ${label}${detail}`;
}

export function briefText(
  brief: Brief,
  t: TFunction<"personal">,
  language: string,
) {
  const sections = [
    {
      title: t("brief.needsYou"),
      lines: brief.needsYou.map((item) => itemLine(t, item)),
    },
    {
      title: t("brief.results"),
      lines: brief.results.map(
        (result) => `- **${result.routineName}** · ${oneLine(result.summary)}`,
      ),
    },
    {
      title: t("brief.failures"),
      lines: brief.failures.map((item) => itemLine(t, item)),
    },
  ].filter((section) => section.lines.length > 0);
  return [
    briefDayLabel(brief.day, language),
    ...sections.map((section) =>
      [`**${section.title}**`, ...section.lines].join("\n"),
    ),
  ].join("\n\n");
}
