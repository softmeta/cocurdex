import * as SplashScreen from "expo-splash-screen";

const LAUNCH_TIMEOUT_MS = 3000;

type LaunchPhase = "waiting" | "ready" | "finished";

let phase: LaunchPhase = "waiting";
let nativeHidden = false;
const listeners = new Set<() => void>();

SplashScreen.setOptions({ duration: 0, fade: false });
void SplashScreen.preventAutoHideAsync().catch(finishLaunch);

const fallback = setTimeout(finishLaunch, LAUNCH_TIMEOUT_MS);

export function getLaunchPhase() {
  return phase;
}

export function subscribeToLaunch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setLaunchPhase(next: LaunchPhase) {
  phase = next;
  for (const listener of listeners) listener();
}

export function markLaunchReady() {
  if (phase === "waiting") setLaunchPhase("ready");
}

export function hideNativeSplash() {
  if (nativeHidden) return;
  nativeHidden = true;
  SplashScreen.hide();
}

export function finishLaunch() {
  if (phase === "finished") return;
  clearTimeout(fallback);
  hideNativeSplash();
  setLaunchPhase("finished");
}
