import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DaemonHealth,
  DaemonStatus,
  DiagnosticsExportInput,
} from "@cocurdex/rpc";
import type { DiagnosticsExportResult } from "@cocurdex/shared";
import {
  copyLogDirectory,
  redactFilesInPlace,
  sanitizeLogDetails,
  sanitizeTimestamp,
  summarizeLogFiles,
} from "@cocurdex/shared/node";
import { logDaemonDiagnostic } from "./diagnostics";
import { getDiagnosticsDirectory } from "./paths";

const BUNDLE_PREFIX = "cocurdex-diagnostics-";
const KEPT_BUNDLES = 10;
const DAEMON_SECTION = "daemon";
const SECTION_MAX_BYTES = 32 * 1024 * 1024;

export interface ExportDaemonDiagnosticsOptions {
  userDataPath: string;
  daemonLogDirectory: string;
  status: DaemonStatus;
  health: DaemonHealth;
  input: DiagnosticsExportInput;
  now?: Date;
}

export function diagnosticsSectionName(name: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!normalized || normalized === DAEMON_SECTION) {
    return `host-${normalized || "logs"}`;
  }
  return normalized;
}

async function pruneOldBundles(directory: string, keep: number) {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(directory, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return;
  }
  const bundles = entries
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(BUNDLE_PREFIX),
    )
    .map((entry) => entry.name)
    .sort();
  for (const name of bundles.slice(0, Math.max(0, bundles.length - keep))) {
    await fs
      .rm(path.join(directory, name), { recursive: true, force: true })
      .catch(() => undefined);
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function exportDaemonDiagnostics(
  options: ExportDaemonDiagnosticsOptions,
): Promise<DiagnosticsExportResult> {
  const now = options.now ?? new Date();
  const diagnosticsDirectory = getDiagnosticsDirectory(options.userDataPath);
  const outputPath = path.join(
    diagnosticsDirectory,
    `${BUNDLE_PREFIX}${sanitizeTimestamp(now)}`,
  );
  await fs.mkdir(outputPath, { recursive: true });

  const daemonLogs = await copyLogDirectory(
    options.daemonLogDirectory,
    path.join(outputPath, DAEMON_SECTION),
    SECTION_MAX_BYTES,
  );
  const copied = [...daemonLogs.copied];
  let omittedFiles = daemonLogs.omitted;
  const usedSections = new Set([DAEMON_SECTION]);
  for (const hostDirectory of options.input.hostLogDirectories ?? []) {
    let section = diagnosticsSectionName(hostDirectory.name);
    while (usedSections.has(section)) {
      section = `${section}-${usedSections.size}`;
    }
    usedSections.add(section);
    const hostLogs = await copyLogDirectory(
      hostDirectory.path,
      path.join(outputPath, section),
      SECTION_MAX_BYTES,
    );
    copied.push(...hostLogs.copied);
    omittedFiles += hostLogs.omitted;
  }

  const { socketPath: _socketPath, ...status } = options.status;
  const metadataPath = path.join(outputPath, "metadata.json");
  await writeJson(metadataPath, {
    createdAt: now.toISOString(),
    daemon: { status, health: options.health },
    host: sanitizeLogDetails(options.input.hostMetadata ?? {}),
  });
  copied.push(metadataPath);

  const { kept, dropped } = await redactFilesInPlace(copied);
  const summaryPath = path.join(outputPath, "summary.json");
  await writeJson(summaryPath, {
    ...(await summarizeLogFiles(outputPath, kept)),
    droppedFiles: dropped.length,
    omittedFiles,
  });
  const fileCount = kept.length + 1;

  await pruneOldBundles(diagnosticsDirectory, KEPT_BUNDLES);
  logDaemonDiagnostic("info", "diagnostics.exported", {
    droppedFileCount: dropped.length,
    fileCount,
    omittedFileCount: omittedFiles,
  });
  return { outputPath, fileCount };
}
