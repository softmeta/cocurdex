import type { Brief, InboxItem } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { deliverBriefOnEntry } from "./brief-presence";
import { briefText } from "./brief-text";
import { inboxApi } from "./inbox-api";
import { useInboxRevalidation } from "./use-inbox-revalidation";

const NO_ITEMS: InboxItem[] = [];
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useInbox() {
  const { data, mutate } = useSWR("inbox.list", inboxApi.list, {
    dedupingInterval: 0,
  });
  useInboxRevalidation(mutate);
  return data ?? NO_ITEMS;
}

export function useBrief() {
  const { t, i18n } = useTranslation("personal");
  const post = (brief: Brief) =>
    inboxApi
      .postBrief({
        updatedAt: brief.updatedAt,
        day: brief.day,
        content: briefText(brief, t, i18n.language),
      })
      .catch(() => null);
  const { data, mutate } = useSWR(
    ["inbox.brief", timeZone],
    () => inboxApi.brief(timeZone),
    {
      dedupingInterval: 0,
      onSuccess: (brief) =>
        deliverBriefOnEntry(brief, (entry) => void post(entry)),
    },
  );
  useInboxRevalidation(mutate);
  return { brief: data ?? null, post };
}
