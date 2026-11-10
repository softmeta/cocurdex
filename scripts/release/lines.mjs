export const RENDERER_PACKAGES = [
  "packages/client-runtime/",
  "packages/deck/",
  "packages/note-doc/",
  "packages/rpc/",
  "packages/shared/",
  "packages/secure-channel/",
];

export const WEB_CLIENT_SOURCES = [
  "apps/desktop/src/",
  ...RENDERER_PACKAGES.map((dir) => `${dir}src/`),
];

export const RELEASE_LINES = [
  {
    name: "app",
    tagMatch: "v[0-9]*",
    workflow: "release.yml",
    ships: "desktop (macOS, Windows, Linux), iOS TestFlight, Android",
    inputs: ["apps/desktop/", "apps/mobile/", "apps/cli/", "packages/"],
  },
  {
    name: "relay",
    tagPrefix: "relay-v",
    tagMatch: "relay-v[0-9]*",
    workflow: "relay-release.yml",
    ships: "relay binaries with the desktop renderer as its web client",
    inputs: ["services/relay/", "apps/desktop/src/", ...RENDERER_PACKAGES],
  },
  {
    name: "push",
    tagPrefix: "push-v",
    tagMatch: "push-v[0-9]*",
    workflow: "push-release.yml",
    ships: "push gateway",
    inputs: ["services/push/"],
  },
];

export const SIGNALS = [
  {
    label: "schema migration",
    match: (f) => f === "packages/db/src/migrations.ts",
  },
  {
    label: "mobile",
    match: (f) => f.startsWith("apps/mobile/"),
  },
  {
    label: "mobile native",
    match: (f) =>
      /^apps\/mobile\/(ios|android|modules|plugins)\//.test(f) ||
      /^apps\/mobile\/(app\.json|app\.config\.js|package\.json)$/.test(f),
  },
  {
    label: "CLI or skill contract",
    match: (f) =>
      f.startsWith("apps/cli/") || f.startsWith("packages/product-skills/"),
  },
];

export function lineByName(name) {
  const line = RELEASE_LINES.find((candidate) => candidate.name === name);
  if (!line) {
    throw new Error(`Unknown release line: ${name}`);
  }
  return line;
}

function isShippedFile(file) {
  if (file.endsWith(".md")) {
    return false;
  }
  return !/(^|\/)(tests?|__tests__|docs)\//.test(file);
}

export function lineFiles(line, files) {
  return files.filter(
    (file) =>
      isShippedFile(file) &&
      line.inputs.some((input) => file.startsWith(input)),
  );
}

export function fileSignals(files) {
  return SIGNALS.filter((signal) => files.some(signal.match)).map(
    (s) => s.label,
  );
}

const METHOD_ENTRY = /^\s*"([A-Za-z][\w.]*)":\s*"[^"]+",?\s*$/gm;

export function parseDaemonMethods(methodScopesSource) {
  return new Set(
    [...methodScopesSource.matchAll(METHOD_ENTRY)].map((match) => match[1]),
  );
}
