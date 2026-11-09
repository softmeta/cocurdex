#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const DEFAULT_AUDIT_LEVEL = "moderate";
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

/** @type {Record<string, { package: string; reason: string }>} */
export const ACCEPTED_ADVISORIES = {
  "GHSA-3g3m-2fjr-6pw4": {
    package: "glob",
    reason:
      "Pulled in only by build-time Expo CLI tools (@expo/cli, @expo/fingerprint) that are not bundled into the React Native mobile runtime.",
  },
  "GHSA-g3hv-75wg-m249": {
    package: "minimatch",
    reason:
      "Pulled in only by build-time Expo CLI tools (@expo/cli, @expo/fingerprint) that are not bundled into the React Native mobile runtime.",
  },
};

export function evaluateAuditReport(
  report,
  {
    acceptedAdvisories = ACCEPTED_ADVISORIES,
    auditLevel = DEFAULT_AUDIT_LEVEL,
  } = {},
) {
  const minimumSeverity = SEVERITIES.indexOf(auditLevel);
  if (minimumSeverity === -1) {
    throw new Error(`Unsupported audit level: ${auditLevel}`);
  }

  const seenAccepted = new Set();
  const unaccepted = [];

  for (const advisory of Object.values(report.advisories ?? {})) {
    const id = advisory.github_advisory_id || String(advisory.id);
    const packageName = advisory.module_name;
    const accepted = acceptedAdvisories[id];
    if (accepted && accepted.package === packageName) {
      seenAccepted.add(id);
      continue;
    }
    if (SEVERITIES.indexOf(advisory.severity) >= minimumSeverity) {
      unaccepted.push({
        id,
        package: packageName,
        patchedVersions: advisory.patched_versions,
        severity: advisory.severity,
        title: advisory.title,
        url: advisory.url,
        vulnerableVersions: advisory.vulnerable_versions,
      });
    }
  }

  const staleAccepted = Object.keys(acceptedAdvisories).filter(
    (id) => !seenAccepted.has(id),
  );

  return {
    accepted: [...seenAccepted].map((id) => ({
      id,
      ...acceptedAdvisories[id],
    })),
    staleAccepted,
    unaccepted,
  };
}

function main() {
  const result = spawnSync("pnpm", ["audit", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    process.stderr.write(result.stderr ?? "");
    process.stderr.write(result.stdout ?? "");
    console.error("pnpm audit did not produce a JSON report.");
    process.exitCode = 1;
    return;
  }

  if (report.error) {
    console.error(
      `pnpm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const { accepted, staleAccepted, unaccepted } = evaluateAuditReport(report);

  for (const entry of accepted) {
    console.log(`Accepted ${entry.id} (${entry.package}): ${entry.reason}`);
  }

  for (const id of staleAccepted) {
    console.log(
      `::warning::Accepted advisory ${id} no longer matches; remove it from scripts/pnpm-audit.mjs.`,
    );
  }

  if (unaccepted.length > 0) {
    console.error(
      `\nFound ${unaccepted.length} unaccepted advisories at or above ${DEFAULT_AUDIT_LEVEL}:`,
    );
    for (const advisory of unaccepted) {
      console.error(
        `- ${advisory.package} ${advisory.vulnerableVersions} [${advisory.severity}] (${advisory.id}) ${advisory.title} ${advisory.url}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`No unaccepted advisories at or above ${DEFAULT_AUDIT_LEVEL}.`);
}

if (import.meta.main) {
  main();
}
