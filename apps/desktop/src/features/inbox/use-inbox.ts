import type { InboxItem } from "@cocurdex/shared";
import { useStore } from "jotai";
import useSWR from "swr";
import { permissionsBySessionAtom } from "@/features/agent/permission";
import { planApprovalsBySessionAtom } from "@/features/agent/plan";
import { questionsBySessionAtom } from "@/features/agent/question";
import { sessionResultAttentionAtom, sessionsAtom } from "@/features/sessions";
import { desktopApi, useMountEffect } from "@/lib";
import { inboxApi } from "./inbox-api";

const INBOX_KEY = "inbox.list";
const NO_ITEMS: InboxItem[] = [];
const REFRESH_DELAY_MS = 250;
const WATCHED_AREAS = ["routines", "personal"];

export function useInbox() {
  const store = useStore();
  const { data, mutate } = useSWR(INBOX_KEY, inboxApi.list, {
    dedupingInterval: 0,
  });

  useMountEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void mutate();
      }, REFRESH_DELAY_MS);
    };
    const unsubscribers = [
      store.sub(sessionResultAttentionAtom, refresh),
      store.sub(permissionsBySessionAtom, refresh),
      store.sub(questionsBySessionAtom, refresh),
      store.sub(planApprovalsBySessionAtom, refresh),
      store.sub(sessionsAtom, refresh),
      desktopApi.onDataChanged((event) => {
        if (event.areas.some((area) => WATCHED_AREAS.includes(area))) {
          refresh();
        }
      }),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  });

  return data ?? NO_ITEMS;
}
