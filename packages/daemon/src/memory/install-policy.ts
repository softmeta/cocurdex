export interface MemoryInstallFacts {
  supported: boolean;
  enabled: boolean;
  customCli: boolean;
  installedVersion: string | null;
  pinnedVersion: string;
  hasExecutable: boolean;
}

// Memory is on by default, so an enabled managed store installs itself: on a
// fresh install, after an update that pins a new rsrs, and when the managed
// CLI is missing from its private store.
export function needsManagedInstall(facts: MemoryInstallFacts) {
  if (!facts.supported || !facts.enabled || facts.customCli) return false;
  return !facts.hasExecutable || facts.installedVersion !== facts.pinnedVersion;
}
