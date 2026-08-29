import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectPiModelsEnvNames,
  extractConfigValueEnvNames,
} from "./pi-models-env";

// Build a `${NAME}` reference without a literal template-curly string so Biome's
// noTemplateCurlyInString does not flag these intentional pi config values.
function braced(name: string): string {
  return `$${"{"}${name}}`;
}

describe("extractConfigValueEnvNames", () => {
  it("extracts a bare $VAR reference", () => {
    expect(extractConfigValueEnvNames("$OPEN_CODE_API_KEY")).toEqual([
      "OPEN_CODE_API_KEY",
    ]);
  });

  it("extracts a braced reference", () => {
    expect(extractConfigValueEnvNames(braced("MY_KEY"))).toEqual(["MY_KEY"]);
  });

  it("extracts multiple references and dedupes", () => {
    expect(extractConfigValueEnvNames(`$A-${braced("B")}-$A`)).toEqual([
      "A",
      "B",
    ]);
  });

  it("ignores $$ and $! escapes", () => {
    expect(extractConfigValueEnvNames("literal$$value$!")).toEqual([]);
  });

  it("ignores command-form values", () => {
    expect(extractConfigValueEnvNames("!op read secret/$NOT_ENV")).toEqual([]);
  });

  it("returns empty for a plain literal", () => {
    expect(extractConfigValueEnvNames("sk-literal-key")).toEqual([]);
  });
});

describe("collectPiModelsEnvNames", () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-models-env-"));
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  function writeModelsJson(content: unknown) {
    writeFileSync(
      join(agentDir, "models.json"),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }

  it("collects env names from provider apiKey and headers", () => {
    writeModelsJson({
      providers: {
        custom: {
          apiKey: "$OPEN_CODE_API_KEY",
          headers: { "X-Token": braced("EXTRA_TOKEN") },
          models: [{ id: "m1" }],
        },
      },
    });

    const names = collectPiModelsEnvNames({
      PI_CODING_AGENT_DIR: agentDir,
    });

    expect(names.sort()).toEqual(["EXTRA_TOKEN", "OPEN_CODE_API_KEY"]);
  });

  it("collects env names from model-level apiKey and headers", () => {
    writeModelsJson({
      providers: {
        custom: {
          models: [
            {
              id: "m1",
              apiKey: "$MODEL_KEY",
              headers: { H: braced("MODEL_H") },
            },
          ],
        },
      },
    });

    const names = collectPiModelsEnvNames({
      PI_CODING_AGENT_DIR: agentDir,
    });

    expect(names.sort()).toEqual(["MODEL_H", "MODEL_KEY"]);
  });

  it("returns empty when the file is missing", () => {
    expect(collectPiModelsEnvNames({ PI_CODING_AGENT_DIR: agentDir })).toEqual(
      [],
    );
  });

  it("returns empty for malformed JSON", () => {
    writeModelsJson("{ not json");
    expect(collectPiModelsEnvNames({ PI_CODING_AGENT_DIR: agentDir })).toEqual(
      [],
    );
  });
});
