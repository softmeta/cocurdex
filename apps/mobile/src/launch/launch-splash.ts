import * as SplashScreen from "expo-splash-screen";

const LAUNCH_TIMEOUT_MS = 3000;
const FADE_MS = 200;

let holding = true;

SplashScreen.setOptions({ duration: FADE_MS, fade: true });
void SplashScreen.preventAutoHideAsync().catch(() => {
  holding = false;
});

const fallback = setTimeout(revealApp, LAUNCH_TIMEOUT_MS);

export function revealApp() {
  if (!holding) return;
  holding = false;
  clearTimeout(fallback);
  requestAnimationFrame(() => requestAnimationFrame(() => SplashScreen.hide()));
}
