export function isMacPlatform() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function isElectronRenderer() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /\bElectron\//.test(navigator.userAgent);
}

export function hasMacTrafficLights() {
  return isMacPlatform() && isElectronRenderer();
}

export function applyPlatformAttribute(
  root: HTMLElement = document.documentElement,
) {
  root.dataset.platform = isMacPlatform() ? "darwin" : "other";
  root.toggleAttribute("data-traffic-lights", hasMacTrafficLights());
}
