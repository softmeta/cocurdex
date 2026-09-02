import type { OssLicenseEntry, OssLicensesPayload } from "@/lib/types";

export type OssLicenseRow =
  | OssLicenseEntry
  | {
      homepage: string | null;
      id: "chromium";
      kind: "chromium";
      license: string;
      name: string;
      textId: null;
      version: null;
    };

export function chromiumLicenseRow(): OssLicenseRow {
  return {
    homepage: "https://www.electronjs.org",
    id: "chromium",
    kind: "chromium",
    license: "BSD-3-Clause",
    name: "Chromium / Electron",
    textId: null,
    version: null,
  };
}

export function buildOssLicenseRows(
  payload: OssLicensesPayload,
): OssLicenseRow[] {
  const appEntries = payload.entries.filter((entry) => entry.kind === "app");
  const rest = payload.entries.filter((entry) => entry.kind !== "app");
  const rows: OssLicenseRow[] = [...appEntries];
  if (payload.chromiumAvailable) {
    rows.push(chromiumLicenseRow());
  }
  rows.push(...rest);
  return rows;
}

export function filterOssLicenseRows(
  rows: OssLicenseRow[],
  query: string,
): OssLicenseRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(needle)) {
      return true;
    }
    if (row.license.toLowerCase().includes(needle)) {
      return true;
    }
    if ((row.version ?? "").toLowerCase().includes(needle)) {
      return true;
    }
    return false;
  });
}
