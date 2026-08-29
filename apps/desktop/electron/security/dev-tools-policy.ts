// Whether the main application window may open Chrome DevTools.
//
// DevTools is enabled for every build — both dev (unpackaged) and packaged —
// so it is always available for diagnostics. The `packaged` flag is kept in the
// signature for callers but no longer gates availability.
//
// The in-app browser (a separate WebContentsView) is intentionally not covered
// here and retains DevTools.
export function resolveMainWindowDevTools(_options: {
  packaged: boolean;
}): boolean {
  return true;
}
