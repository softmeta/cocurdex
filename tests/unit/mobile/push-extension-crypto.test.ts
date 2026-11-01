import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { generateKeyPair, sealMessage } from "@cocurdex/secure-channel";
import { PUSH_SEAL_PROLOGUE } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const mobileRoot = path.resolve(
  path.dirname(
    require.resolve("@cocurdex/mobile/internal/notifications/push-registrar"),
  ),
  "../..",
);
const extensionSource = path.join(
  mobileRoot,
  "plugins/push-notifications/extension/SealedMessage.swift",
);
const harness = path.join(
  import.meta.dirname,
  "fixtures/open-sealed-message/main.swift",
);
const vector = JSON.parse(
  readFileSync(
    path.join(
      import.meta.dirname,
      "../secure-channel/fixtures/noise-n-vector.json",
    ),
    "utf8",
  ),
) as Record<string, string>;

function hasSwift() {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync("xcrun", ["--find", "swiftc"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const tempDirs = createTempDirs();
let binary = "";

function openInSwift(secretKey: string, prologue: string, message: string) {
  return execFileSync(binary, [secretKey, prologue, message], {
    encoding: "utf8",
  }).trim();
}

describe.runIf(hasSwift())("notification service extension crypto", () => {
  beforeAll(() => {
    binary = path.join(tempDirs.createSync("swift-open-"), "open");
    execFileSync("xcrun", ["swiftc", extensionSource, harness, "-o", binary]);
  }, 120_000);

  afterAll(() => tempDirs.cleanup());

  it("opens the Noise N test vector and rejects a tampered message", () => {
    const tampered = Buffer.from(vector.ciphertext ?? "", "hex");
    tampered[40] = (tampered[40] ?? 0) ^ 1;

    expect(
      openInSwift(
        vector.resp_static ?? "",
        vector.resp_prologue ?? "",
        vector.ciphertext ?? "",
      ),
    ).toBe(vector.payload);
    expect(
      openInSwift(
        vector.resp_static ?? "",
        vector.resp_prologue ?? "",
        hex(tampered),
      ),
    ).toBe("nil");
  });

  it("opens what the daemon seals for a device", () => {
    const device = generateKeyPair();
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ v: 1, kind: "question", sessionTitle: "部署" }),
    );
    const prologue = new TextEncoder().encode(PUSH_SEAL_PROLOGUE);
    const sealed = sealMessage({
      recipientPublicKey: device.publicKey,
      prologue,
      plaintext,
    });

    expect(openInSwift(hex(device.secretKey), hex(prologue), hex(sealed))).toBe(
      hex(plaintext),
    );
    expect(
      openInSwift(hex(generateKeyPair().secretKey), hex(prologue), hex(sealed)),
    ).toBe("nil");
  });
});
