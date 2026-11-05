import type { InboxItem } from "@cocurdex/shared";
import useSWR from "swr";
import { considerBriefOnEntry } from "./brief-presence";
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
  const { data, mutate } = useSWR(
    ["inbox.brief", timeZone],
    () => inboxApi.brief(timeZone),
    { dedupingInterval: 0, onSuccess: considerBriefOnEntry },
  );
  useInboxRevalidation(mutate);
  return data ?? null;
}
