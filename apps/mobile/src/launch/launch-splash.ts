import * as SplashScreen from "expo-splash-screen";

const LAUNCH_TIMEOUT_MS = 3000;

let ready = false;
let hidden = false;

SplashScreen.setOptions({ duration: 0, fade: false });
void SplashScreen.preventAutoHideAsync().catch(hideNativeSplash);

const fallback = setTimeout(hideNativeSplash, LAUNCH_TIMEOUT_MS);

export function markLaunchReady() {
  if (ready || hidden) return;
  ready = true;
  requestAnimationFrame(() => requestAnimationFrame(hideNativeSplash));
}

function hideNativeSplash() {
  if (hidden) return;
  hidden = true;
  clearTimeout(fallback);
  SplashScreen.hide();
}
