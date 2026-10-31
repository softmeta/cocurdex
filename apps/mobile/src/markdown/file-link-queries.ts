import useSWR from "swr";
import { hostConnection } from "@/connection";

const NO_FILES: ReadonlySet<string> = new Set();

export function useExistingFiles(
  hostId: string | undefined,
  paths: readonly string[],
): ReadonlySet<string> {
  const { data } = useSWR(
    hostId && paths.length > 0
      ? (["file.exists", hostId, ...paths] as const)
      : null,
    async ([method, host, ...candidates]) => {
      const connection = hostConnection(host);
      const found = await Promise.all(
        candidates.map((filePath) =>
          connection.request(method, { filePath }).catch(() => false),
        ),
      );
      return new Set(candidates.filter((_path, index) => found[index]));
    },
    { dedupingInterval: 10_000 },
  );
  return data ?? NO_FILES;
}
