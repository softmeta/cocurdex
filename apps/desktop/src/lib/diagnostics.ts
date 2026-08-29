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
  if (!isRendererDiagnosticsEnabled()) {
    return;
  }

  console[level](message, details);
}
