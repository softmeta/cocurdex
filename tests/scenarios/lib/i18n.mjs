import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = fileURLToPath(
  new URL("../../../apps/desktop/", import.meta.url),
);
const LOCALES_DIR = path.join(DESKTOP_DIR, "src", "locales");
const DEFAULT_LOCALE = "en-US";

const i18next = createRequire(path.join(DESKTOP_DIR, "package.json"))(
  "i18next",
);

function loadResources() {
  const resources = {};
  for (const locale of readdirSync(LOCALES_DIR)) {
    const namespaces = {};
    for (const file of readdirSync(path.join(LOCALES_DIR, locale))) {
      if (!file.endsWith(".json")) continue;
      namespaces[path.basename(file, ".json")] = JSON.parse(
        readFileSync(path.join(LOCALES_DIR, locale, file), "utf8"),
      );
    }
    resources[locale] = namespaces;
  }
  return resources;
}

let translator = null;

function getTranslator() {
  if (!translator) {
    const resources = loadResources();
    const instance = i18next.createInstance();
    void instance.init({
      defaultNS: "common",
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      initAsync: false,
      lng: DEFAULT_LOCALE,
      resources,
      supportedLngs: Object.keys(resources),
    });
    translator = instance;
  }
  return translator;
}

export function translateFor(language, key, options) {
  return getTranslator().getFixedT(language || DEFAULT_LOCALE)(key, options);
}
