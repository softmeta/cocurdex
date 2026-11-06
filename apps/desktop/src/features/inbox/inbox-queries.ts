import { type InboxItem, isSupportedLocale } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { deliverBriefOnEntry } from "./brief-presence";
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
  const { i18n } = useTranslation("personal");
  const locale = isSupportedLocale(i18n.language) ? i18n.language : null;
  const post = () => inboxApi.postBrief(timeZone, locale).catch(() => null);
  const { data, mutate } = useSWR(
    ["inbox.brief", timeZone],
    () => inboxApi.brief(timeZone),
    {
      dedupingInterval: 0,
      onSuccess: (brief) => deliverBriefOnEntry(brief, () => void post()),
    },
  );
  useInboxRevalidation(mutate);
  return { brief: data ?? null, post };
}
