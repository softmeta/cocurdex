import { desktopApi } from "./ipc";

const RENDERER_DIAGNOSTICS_STORAGE_KEY = "cocurdex.diagnostics";

type RendererDiagnosticLevel = "debug" | "info";

function hasRendererDiagnosticsOptIn() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.localStorage.getItem(RENDERER_DIAGNOSTICS_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function isRendererDiagnosticsEnabled() {
  return import.meta.env.DEV || hasRendererDiagnosticsOptIn();
}

export function logRendererDiagnostic(
  level: RendererDiagnosticLevel,
  message: string,
  details?: Record<string, unknown>,
) {
  if (level === "debug" && !isRendererDiagnosticsEnabled()) {
    return;
  }

  console[level](message, details);
  void desktopApi.logRendererError({
    details,
    event: message,
    level,
    scope: "renderer",
  });
}
