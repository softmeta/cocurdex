export interface MemoryInstallFacts {
  supported: boolean;
  enabled: boolean;
  customCli: boolean;
  installedVersion: string | null;
  pinnedVersion: string;
  hasExecutable: boolean;
  blockedPin: string | null;
}

// Memory is on by default, so an enabled managed store installs itself: on a
// fresh install, after an update that pins a new rsrs, and when the managed
// CLI is missing from its private store.
export function needsManagedInstall(facts: MemoryInstallFacts) {
  if (!facts.supported || !facts.enabled || facts.customCli) return false;
  if (facts.blockedPin === facts.pinnedVersion) return false;
  return !facts.hasExecutable || facts.installedVersion !== facts.pinnedVersion;
}

// rsrs reports these when a login, keygen or recovery step is waiting on the
// user (respire-cli autostart control); retrying the install cannot clear them.
const NEEDS_USER_ERROR =
  /handoff_pending|recovery_required|recovery_pending|durability_unknown|completion is unknown|retain recovery state/i;

export function installErrorNeedsUser(message: string) {
  return NEEDS_USER_ERROR.test(message);
}
