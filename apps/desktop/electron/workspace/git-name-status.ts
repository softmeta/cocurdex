// Parse `git diff --name-status -z` (and `--cached`) output into change rows.

export type GitNameStatusChange = {
  // First letter of git --name-status (A/M/D/R/C/T/…).
  status: string;
  path: string;
  fromPath?: string;
};

export function parseNameStatusZero(raw: string): GitNameStatusChange[] {
  const parts = raw.split("\0").filter((part) => part.length > 0);
  const changes: GitNameStatusChange[] = [];
  let index = 0;
  while (index < parts.length) {
    const statusToken = parts[index] ?? "";
    const status = statusToken.charAt(0).toUpperCase();
    if (status.length === 0) {
      index += 1;
      continue;
    }
    // Rename / copy: status, from, to.
    if (status === "R" || status === "C") {
      const fromPath = parts[index + 1] ?? "";
      const path = parts[index + 2] ?? "";
      if (path.length > 0) {
        changes.push({ status, path, fromPath });
      }
      index += 3;
      continue;
    }
    const path = parts[index + 1] ?? "";
    if (path.length > 0) {
      changes.push({ status, path });
    }
    index += 2;
  }
  return changes;
}
