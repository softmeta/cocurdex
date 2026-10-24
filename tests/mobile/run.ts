import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  FIXTURE_SESSIONS,
  FIXTURE_WORKSPACE_NAME,
} from "@cocurdex/e2e/fixture-db/recipe";
import type { SupportedLocale } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/shared/testing";
import { androidSdk, buildAndroidApp, startAndroidTarget } from "./lib/android";
import { runCommand } from "./lib/command";
import { startPairingDaemon } from "./lib/daemon";
import { buildIosApp, startIosTarget } from "./lib/ios";
import type { Appearance, MobilePlatform, MobileTarget } from "./lib/target";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const mobileDir = path.join(repoRoot, "apps/mobile");
const flowsDir = path.join(import.meta.dirname, "flows");
const RUNS: { appearance: Appearance; locale: SupportedLocale }[] = [
  { appearance: "light", locale: "en-US" },
  { appearance: "dark", locale: "zh-CN" },
];
const SYSTEM_CONTINUE: Record<SupportedLocale, string> = {
  "en-US": "Continue",
  "zh-CN": "继续",
};

function readMessages(locale: SupportedLocale, namespace: string) {
  const file = path.join(mobileDir, "src/locales", locale, `${namespace}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

const SEARCHED_SESSION = "fixture-session-discounts";
const CODE_SESSION = "fixture-session-checkout-audit";

function fixtureSession(id: string) {
  const session = FIXTURE_SESSIONS.find((candidate) => candidate.id === id);
  if (!session) throw new Error(`Fixture session ${id} is missing`);
  return session;
}

function lastPrompt(id: string) {
  const prompt = fixtureSession(id).turns.at(-1)?.prompt;
  if (!prompt) throw new Error(`Fixture session ${id} has no turns`);
  return prompt;
}

function flowLabels(locale: SupportedLocale) {
  const hosts = readMessages(locale, "hosts");
  const common = readMessages(locale, "common");
  const sessions = readMessages(locale, "sessions");
  return {
    TAB_COMPUTERS: common.tabs.computers,
    TAB_SESSIONS: common.tabs.sessions,
    SEARCH_PLACEHOLDER: sessions.search,
    WORKSPACE_NAME: FIXTURE_WORKSPACE_NAME,
    SEARCH_QUERY: "percentage",
    SEARCHED_SESSION_TITLE: fixtureSession(SEARCHED_SESSION).title,
    SEARCHED_SESSION_LAST_PROMPT: lastPrompt(SEARCHED_SESSION),
    OTHER_SESSION_TITLE: fixtureSession("fixture-session-checkout-bug").title,
    CODE_SESSION_TITLE: fixtureSession(CODE_SESSION).title,
    CODE_BLOCK_TEXT: "(?s)const fulfillmentSteps = .*",
    EMPTY_TITLE: hosts.empty.title,
    EMPTY_PAIR: hosts.empty.pair,
    PAIR_ACTION: hosts.pair.action,
    LINK_PLACEHOLDER: hosts.pair.linkPlaceholder,
    SYSTEM_CONTINUE: SYSTEM_CONTINUE[locale],
  };
}

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    platform: { type: "string" },
    build: { type: "boolean", default: false },
    avd: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});

function parsePlatform(value: string | undefined): MobilePlatform {
  const requested =
    value ?? (process.platform === "darwin" ? "ios" : "android");
  if (requested !== "ios" && requested !== "android") {
    throw new Error(`--platform must be ios or android, not ${requested}`);
  }
  return requested;
}

const platform = parsePlatform(values.platform);
if (platform === "ios" && process.platform !== "darwin") {
  throw new Error("iOS runs need macOS with Xcode");
}

const DRIVER_STARTUP_TIMEOUT_MS = "240000";

async function runFlow(
  target: MobileTarget,
  flow: string,
  env: Record<string, string>,
  outputDir: string,
) {
  const envArgs = Object.entries(env).flatMap(([key, value]) => [
    "-e",
    `${key}=${value}`,
  ]);
  try {
    await runCommand(
      "maestro",
      [
        "--device",
        target.deviceId,
        "test",
        ...envArgs,
        "--test-output-dir",
        outputDir,
        path.join(flowsDir, flow),
      ],
      {
        inherit: true,
        env: {
          MAESTRO_DRIVER_STARTUP_TIMEOUT: DRIVER_STARTUP_TIMEOUT_MS,
          ...process.env,
          ...(platform === "android" ? { ANDROID_HOME: androidSdk() } : {}),
        },
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}\n${await target.diagnostics()}`, {
      cause: error,
    });
  }
}

function flowOutputRoot(tempDirs: ReturnType<typeof createTempDirs>) {
  const artifactsDir = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (!artifactsDir) return tempDirs.createSync("cocu-mobile-");
  const outputRoot = path.join(artifactsDir, `mobile-${platform}`);
  mkdirSync(outputRoot, { recursive: true });
  return outputRoot;
}

async function main() {
  await runCommand("maestro", ["--version"]).catch(() => {
    throw new Error("Maestro CLI is missing; install it and Java 17+");
  });
  if (values.build) {
    await runCommand("pnpm", ["--filter", "@cocurdex/desktop", "prepare:cli"], {
      cwd: repoRoot,
      inherit: true,
    });
    await (platform === "ios"
      ? buildIosApp(mobileDir)
      : buildAndroidApp(mobileDir));
  }
  const tempDirs = createTempDirs();
  const outputRoot = flowOutputRoot(tempDirs);
  const daemon = await startPairingDaemon(platform, tempDirs);
  const openedSessionState = async () =>
    (await daemon.sessionAttention()).find(
      (entry) => entry.sessionId === CODE_SESSION,
    )?.attentionState;
  try {
    const before = await openedSessionState();
    if (before !== "completed-unread") {
      throw new Error(`${CODE_SESSION} should start unread, not ${before}`);
    }
    const target =
      platform === "ios"
        ? await startIosTarget(mobileDir)
        : await startAndroidTarget(mobileDir, values.avd);
    try {
      for (const { appearance, locale } of RUNS) {
        await target.resetState();
        await target.setAppearance(appearance);
        await target.setLocale(locale);
        await runFlow(
          target,
          "pairing.yaml",
          {
            ...flowLabels(locale),
            PAIRING_LINK: await daemon.createPairingLink(),
            HOST_ADDRESS: daemon.hostAddress,
          },
          path.join(outputRoot, `${appearance}-${locale}`),
        );
      }
      const after = await openedSessionState();
      if (after === "completed-unread") {
        throw new Error(`Opening ${CODE_SESSION} did not mark it visited`);
      }
      const devices = await daemon.pairedDevices();
      if (devices.length !== RUNS.length) {
        throw new Error(
          `Expected ${RUNS.length} paired devices, daemon has ${devices.length}`,
        );
      }
    } finally {
      await target.stop();
    }
    process.stdout.write(
      `${JSON.stringify({ platform, ok: true, screenshots: values.keep ? outputRoot : null })}\n`,
    );
  } finally {
    await daemon.dispose();
    if (!values.keep) await tempDirs.cleanup();
  }
}

await main();
