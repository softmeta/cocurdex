import type {
  Brief,
  InboxItem,
  InboxItemKind,
  SupportedLocale,
} from "@cocurdex/shared";

interface BriefCopy {
  needsYou: string;
  results: string;
  failures: string;
  kinds: Record<InboxItemKind, string>;
}

const BRIEF_COPY: Record<SupportedLocale, BriefCopy> = {
  "en-US": {
    needsYou: "Needs you",
    results: "Routine results",
    failures: "Failures",
    kinds: {
      approval: "Needs approval",
      question: "Has a question",
      plan: "Plan ready",
      failed: "Failed",
      completed: "Done",
      "routine-failed": "Routine failed",
      "routine-needs-you": "Needs you",
      "routine-paused": "Paused after failures",
      "routine-result": "New result",
    },
  },
  "zh-CN": {
    needsYou: "需要你处理",
    results: "例行任务结果",
    failures: "失败",
    kinds: {
      approval: "等你审批",
      question: "有问题要问你",
      plan: "计划待确认",
      failed: "失败了",
      completed: "已完成",
      "routine-failed": "例行任务失败",
      "routine-needs-you": "需要你处理",
      "routine-paused": "连续失败已暂停",
      "routine-result": "有新结果",
    },
  },
};

function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function dayLabel(day: string, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function itemLine(copy: BriefCopy, item: InboxItem) {
  const detail = item.detail ? ` · ${oneLine(item.detail)}` : "";
  return `- **${oneLine(item.title)}** · ${copy.kinds[item.kind]}${detail}`;
}

export function briefMarkdown(brief: Brief, locale: SupportedLocale) {
  const copy = BRIEF_COPY[locale];
  const sections = [
    {
      title: copy.needsYou,
      lines: brief.needsYou.map((item) => itemLine(copy, item)),
    },
    {
      title: copy.results,
      lines: brief.results.map(
        (result) => `- **${result.routineName}** · ${oneLine(result.summary)}`,
      ),
    },
    {
      title: copy.failures,
      lines: brief.failures.map((item) => itemLine(copy, item)),
    },
  ].filter((section) => section.lines.length > 0);
  return [
    dayLabel(brief.day, locale),
    ...sections.map((section) =>
      [`**${section.title}**`, ...section.lines].join("\n"),
    ),
  ].join("\n\n");
}
