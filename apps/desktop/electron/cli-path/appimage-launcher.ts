export const APPIMAGE_LAUNCHER_MARKER = "# cocurdex-appimage-launcher";

const MIN_SYSTEM_NODE_MAJOR = 22;

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildAppImageCliLauncher(input: {
  appImagePath: string;
  cliScriptPath: string;
}): string {
  const nodeCheck = `process.exit(Number(process.versions.node.split(".")[0]) >= ${MIN_SYSTEM_NODE_MAJOR} ? 0 : 1)`;
  return [
    "#!/bin/sh",
    APPIMAGE_LAUNCHER_MARKER,
    `COCURDEX_APPIMAGE=${quoteShell(input.appImagePath)}`,
    `CLI_JS=${quoteShell(input.cliScriptPath)}`,
    "export COCURDEX_APPIMAGE",
    "unset NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE",
    'if [ ! -f "$CLI_JS" ]; then',
    '  echo "cocurdex: open the Cocurdex app once to finish installing the CLI." >&2',
    "  exit 1",
    "fi",
    `if command -v node >/dev/null 2>&1 && node -e ${quoteShell(nodeCheck)} 2>/dev/null; then`,
    '  exec node "$CLI_JS" "$@"',
    "fi",
    'if [ ! -x "$COCURDEX_APPIMAGE" ]; then',
    '  echo "cocurdex: Cocurdex.AppImage is missing at $COCURDEX_APPIMAGE. Open Cocurdex again to reinstall the CLI." >&2',
    "  exit 1",
    "fi",
    "ELECTRON_RUN_AS_NODE=1",
    "export ELECTRON_RUN_AS_NODE",
    'exec "$COCURDEX_APPIMAGE" "$CLI_JS" "$@"',
    "",
  ].join("\n");
}

export function isAppImageCliLauncher(content: string): boolean {
  return content.split("\n", 2)[1] === APPIMAGE_LAUNCHER_MARKER;
}
