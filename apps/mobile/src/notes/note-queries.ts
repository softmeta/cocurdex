import useSWR from "swr";
import { hostConnection } from "@/connection";

const DAEMON_READ = { dedupingInterval: 0 };
const CACHED_READ = { ...DAEMON_READ, revalidateIfStale: false };

export function useNotes(hostId: string, { cached = false } = {}) {
  return useSWR(
    ["note.list", hostId] as const,
    ([method, host]) => hostConnection(host).request(method),
    cached ? CACHED_READ : DAEMON_READ,
  );
}

export function useNote(hostId: string, noteId: string) {
  return useSWR(
    ["note.get", hostId, noteId] as const,
    ([method, host, id]) => hostConnection(host).request(method, { id }),
    DAEMON_READ,
  );
}
