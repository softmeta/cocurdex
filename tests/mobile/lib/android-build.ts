import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { runCommand } from "./command";

const GRADLE_WRAPPER_NETWORK_TIMEOUT_MS = 60_000;

interface GitHubReleaseAsset {
  id: number;
  name: string;
  digest?: string | null;
}

export function emulatorAbi(arch: NodeJS.Architecture) {
  return arch === "arm64" ? "arm64-v8a" : "x86_64";
}

export function defaultAndroidSdk(platform: NodeJS.Platform, home: string) {
  if (platform === "darwin") return path.join(home, "Library/Android/sdk");
  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData/Local");
    return path.join(localAppData, "Android/Sdk");
  }
  return path.join(home, "Android/Sdk");
}

function androidStudioJdkCandidates(platform: NodeJS.Platform, home: string) {
  if (platform === "darwin") {
    const bundle = "Android Studio.app/Contents/jbr/Contents/Home";
    return [
      path.join("/Applications", bundle),
      path.join(home, "Applications", bundle),
    ];
  }
  if (platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    return [path.join(programFiles, "Android", "Android Studio", "jbr")];
  }
  return ["/opt/android-studio/jbr", path.join(home, "android-studio", "jbr")];
}

function androidJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return androidStudioJdkCandidates(process.platform, os.homedir()).find(
    (candidate) => existsSync(candidate),
  );
}

export function androidSdk() {
  return (
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    defaultAndroidSdk(process.platform, os.homedir())
  );
}

function setWrapperProperty(content: string, key: string, value: string) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

function parseGradleDistribution(propertiesContent: string) {
  const match = propertiesContent.match(/^distributionUrl=(.+)$/m);
  if (!match?.[1]) {
    throw new Error("gradle-wrapper.properties is missing distributionUrl");
  }
  const url = match[1].trim().replaceAll("\\:", ":");
  const filename = path.posix.basename(new URL(url).pathname);
  const versionMatch = filename.match(
    /^gradle-([0-9A-Za-z._-]+)-(?:bin|all)\.zip$/,
  );
  if (!versionMatch?.[1]) {
    throw new Error(`Unsupported Gradle distribution archive: ${filename}`);
  }
  return { filename, version: versionMatch[1] };
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function githubApiHeaders(env: NodeJS.ProcessEnv, accept: string) {
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  return {
    Accept: accept,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function downloadGradleFromGitHubRelease(
  version: string,
  filename: string,
  destination: string,
  env: NodeJS.ProcessEnv,
) {
  const api =
    "https://api.github.com/repos/gradle/gradle-distributions/releases";
  const release = await fetch(`${api}/tags/v${version}`, {
    headers: githubApiHeaders(env, "application/vnd.github+json"),
    signal: AbortSignal.timeout(30_000),
  });
  if (!release.ok) {
    throw new Error(
      `Release lookup for gradle/gradle-distributions v${version}: ${release.status}`,
    );
  }
  const { assets } = (await release.json()) as { assets: GitHubReleaseAsset[] };
  const asset = assets.find(({ name }) => name === filename);
  if (!asset) {
    throw new Error(
      `gradle/gradle-distributions v${version} is missing ${filename}`,
    );
  }
  const expectedSha256 = asset.digest?.startsWith("sha256:")
    ? asset.digest.slice("sha256:".length)
    : undefined;
  if (!expectedSha256) {
    throw new Error(
      `gradle/gradle-distributions v${version} ${filename} is missing sha256 digest`,
    );
  }

  const response = await fetch(`${api}/assets/${asset.id}`, {
    headers: githubApiHeaders(env, "application/octet-stream"),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download for ${filename}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(destination));

  const actualSha256 = await sha256File(destination);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA256 mismatch for ${filename}: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
  return expectedSha256;
}

async function prepareGradleWrapper(
  androidDir: string,
  gradlew: string,
  env: NodeJS.ProcessEnv,
) {
  const propertiesPath = path.join(
    androidDir,
    "gradle/wrapper/gradle-wrapper.properties",
  );
  const initialProperties = setWrapperProperty(
    readFileSync(propertiesPath, "utf8"),
    "networkTimeout",
    String(GRADLE_WRAPPER_NETWORK_TIMEOUT_MS),
  );
  writeFileSync(propertiesPath, initialProperties, "utf8");

  try {
    await runCommand(gradlew, ["--version", "--console=plain"], {
      cwd: androidDir,
      env,
      inherit: true,
    });
    return undefined;
  } catch {
    const { filename, version } = parseGradleDistribution(initialProperties);
    const localArchive = path.join(androidDir, "gradle/wrapper", filename);
    const sha256 = await downloadGradleFromGitHubRelease(
      version,
      filename,
      localArchive,
      env,
    );
    const updatedProperties = setWrapperProperty(
      setWrapperProperty(initialProperties, "distributionUrl", filename),
      "distributionSha256Sum",
      sha256,
    );
    writeFileSync(propertiesPath, updatedProperties, "utf8");
    await runCommand(gradlew, ["--version", "--console=plain"], {
      cwd: androidDir,
      env,
      inherit: true,
    });
    return localArchive;
  }
}

export async function buildAndroidApp(mobileDir: string) {
  const javaHome = androidJavaHome();
  const env = {
    ...process.env,
    ANDROID_HOME: androidSdk(),
    CI: "1",
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
  await runCommand("pnpm", ["run", "ensure:native-assets"], {
    cwd: mobileDir,
    env,
    inherit: true,
  });
  await runCommand(
    "pnpm",
    ["exec", "expo", "prebuild", "--platform", "android"],
    { cwd: mobileDir, env, inherit: true },
  );
  const androidDir = path.join(mobileDir, "android");
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const architectures = `-PreactNativeArchitectures=${emulatorAbi(process.arch)}`;
  const localArchive = await prepareGradleWrapper(androidDir, gradlew, env);
  try {
    await runCommand(
      gradlew,
      ["assembleRelease", architectures, "--console=plain"],
      {
        cwd: androidDir,
        env,
        inherit: true,
      },
    );
  } finally {
    if (localArchive) {
      rmSync(localArchive, { force: true });
    }
  }
}

export function androidApkPath(mobileDir: string) {
  return path.join(
    mobileDir,
    "android/app/build/outputs/apk/release/app-release.apk",
  );
}
