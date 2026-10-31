import nodeCrypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createNodeStyleCrypto,
  generateKeyPair,
  type KeyPair,
  keyPairFromSecretKey,
  type NoiseCrypto,
} from "@cocurdex/secure-channel";

export const HOST_KEY_FILENAME = "remote-host-key.json";
const HOST_KEY_FILE_VERSION = 1;

export const daemonNoiseCrypto: NoiseCrypto = createNodeStyleCrypto<Buffer>(
  nodeCrypto,
  (bytes) => Buffer.from(bytes),
);

export interface HostKeys {
  noise: KeyPair;
  noisePublicKey: string;
  signingPrivateKey: nodeCrypto.KeyObject;
}

interface HostKeyFile {
  version: typeof HOST_KEY_FILE_VERSION;
  noiseSecretKey: string;
  signingPrivateKey: string;
}

function encode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function decodeSecret(value: unknown) {
  if (typeof value !== "string") throw new Error("Missing host key");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 32) throw new Error("Malformed host key");
  return Uint8Array.from(bytes);
}

function toHostKeys(file: HostKeyFile): HostKeys {
  const noise = keyPairFromSecretKey(
    decodeSecret(file.noiseSecretKey),
    daemonNoiseCrypto,
  );
  const signingPrivateKey = nodeCrypto.createPrivateKey({
    key: Buffer.from(file.signingPrivateKey, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  if (signingPrivateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Host signing key is not Ed25519");
  }
  return { noise, noisePublicKey: encode(noise.publicKey), signingPrivateKey };
}

function createHostKeyFile(): HostKeyFile {
  const noise = generateKeyPair(daemonNoiseCrypto);
  const { privateKey } = nodeCrypto.generateKeyPairSync("ed25519");
  return {
    version: HOST_KEY_FILE_VERSION,
    noiseSecretKey: encode(noise.secretKey),
    signingPrivateKey: encode(
      privateKey.export({ format: "der", type: "pkcs8" }),
    ),
  };
}

function writePrivateFile(filePath: string, contents: string) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, filePath);
}

function readHostKeyFile(filePath: string): HostKeys | null {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const parsed = JSON.parse(contents) as HostKeyFile;
  if (parsed.version !== HOST_KEY_FILE_VERSION) {
    throw new Error(`Unsupported host key file version ${parsed.version}`);
  }
  return toHostKeys(parsed);
}

export function loadOrCreateHostKeys(
  userDataPath: string,
  now: () => Date = () => new Date(),
): HostKeys {
  const filePath = path.join(userDataPath, HOST_KEY_FILENAME);
  try {
    const existing = readHostKeyFile(filePath);
    if (existing) return existing;
  } catch {
    const stamp = now().toISOString().replaceAll(/[:.]/g, "-");
    fs.renameSync(filePath, `${filePath}.bak-${stamp}`);
  }
  fs.mkdirSync(userDataPath, { recursive: true });
  const created = createHostKeyFile();
  writePrivateFile(filePath, `${JSON.stringify(created)}\n`);
  return toHostKeys(created);
}

export function createHostKeyStore(userDataPath: string) {
  let keys: HostKeys | null = null;
  return {
    keys() {
      keys ??= loadOrCreateHostKeys(userDataPath);
      return keys;
    },
  };
}

export type HostKeyStore = ReturnType<typeof createHostKeyStore>;
