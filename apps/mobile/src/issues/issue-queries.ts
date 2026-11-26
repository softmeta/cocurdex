import { useSyncExternalStore } from "react";
import useSWR, { mutate } from "swr";
import { hostConnection } from "@/connection";

const DAEMON_READ = { dedupingInterval: 0 };
const CACHED_READ = { ...DAEMON_READ, revalidateIfStale: false };
const REVALIDATE_DELAY_MS = 150;
const ISSUE_READS = new Set(["issue.loadView", "issue.getDetail"]);

interface IssueWatch {
  readers: number;
  stop: () => void;
}

const watches = new Map<string, IssueWatch>();
const subscribers = new Map<string, () => () => void>();

function revalidateIssues(hostId: string) {
  return mutate(
    (key) => Array.isArray(key) && ISSUE_READS.has(key[0]) && key[1] === hostId,
  );
}

function startWatch(hostId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopEvents = hostConnection(hostId).onEvent((event) => {
    if (event.type !== "data.changed" || !event.areas.includes("issues")) {
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void revalidateIssues(hostId);
    }, REVALIDATE_DELAY_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    stopEvents();
  };
}

function subscriberFor(hostId: string) {
  let subscribe = subscribers.get(hostId);
  if (!subscribe) {
    subscribe = () => {
      const watch = watches.get(hostId) ?? {
        readers: 0,
        stop: startWatch(hostId),
      };
      watch.readers += 1;
      watches.set(hostId, watch);
      return () => {
        watch.readers -= 1;
        if (watch.readers > 0) return;
        watch.stop();
        watches.delete(hostId);
      };
    };
    subscribers.set(hostId, subscribe);
  }
  return subscribe;
}

const noSnapshot = () => 0;

function useIssueChanges(hostId: string) {
  useSyncExternalStore(subscriberFor(hostId), noSnapshot);
}

export function useIssueView(hostId: string, { cached = false } = {}) {
  useIssueChanges(hostId);
  return useSWR(
    ["issue.loadView", hostId] as const,
    ([method, host]) => hostConnection(host).request(method, {}),
    cached ? CACHED_READ : DAEMON_READ,
  );
}

export function useIssueDetail(hostId: string, issueId: string) {
  useIssueChanges(hostId);
  return useSWR(
    ["issue.getDetail", hostId, issueId] as const,
    ([method, host, id]) => hostConnection(host).request(method, { id }),
    DAEMON_READ,
  );
}
