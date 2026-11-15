export interface MemoryInstallFacts {
  supported: boolean;
  enabled: boolean;
  customCli: boolean;
  installedVersion: string | null;
  pinnedVersion: string;
  hasExecutable: boolean;
  blocked: boolean;
}

export interface MemoryInstallBlockFacts {
  status: "idle" | "installing" | "ready" | "failed";
  blockedPin: string | null;
}

export function installBlocked(
  state: MemoryInstallBlockFacts,
  pinnedVersion: string,
) {
  return state.status === "failed" && state.blockedPin === pinnedVersion;
}

// Memory is on by default, so an enabled managed store installs itself: on a
// fresh install, after an update that pins a new rsrs, and when the managed
// CLI is missing from its private store.
export function needsManagedInstall(facts: MemoryInstallFacts) {
  if (!facts.supported || !facts.enabled || facts.customCli) return false;
  if (facts.blocked) return false;
  return !facts.hasExecutable || facts.installedVersion !== facts.pinnedVersion;
}

export interface GlobalInstallFacts {
  supported: boolean;
  enabled: boolean;
  customCli: boolean;
  hasExecutable: boolean;
  freshHome: boolean;
  ownedHome: boolean;
  blocked: boolean;
}

export function needsGlobalInstall(facts: GlobalInstallFacts) {
  if (!facts.supported || !facts.enabled || facts.customCli) return false;
  if (facts.blocked || facts.hasExecutable) return false;
  return facts.freshHome || facts.ownedHome;
}

// rsrs reports these when a login, keygen or recovery step is waiting on the
// user (respire-cli autostart control); retrying the install cannot clear them.
const NEEDS_USER_ERROR =
  /handoff_pending|recovery_required|recovery_pending|durability_unknown|completion is unknown|retain recovery state/i;

export function installErrorNeedsUser(message: string) {
  return NEEDS_USER_ERROR.test(message);
}
