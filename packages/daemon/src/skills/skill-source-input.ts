import os from "node:os";
import path from "node:path";

export type SkillSourceInput =
  | {
      kind: "github";
      owner: string;
      repo: string;
      ref: string | null;
      subpath: string | null;
    }
  | { kind: "local"; path: string };

const GITHUB_NAME = /^[A-Za-z0-9_.-]+$/;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function isGithubName(value: string | undefined): value is string {
  return Boolean(
    value && GITHUB_NAME.test(value) && value !== "." && value !== "..",
  );
}

function cleanSubpath(segments: string[]) {
  const parts = segments.filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Skill source paths cannot contain . or ..");
  }
  return parts.length ? parts.join("/") : null;
}

function parseGithubUrl(url: URL): SkillSourceInput {
  const [owner, rawRepo, marker, ref, ...rest] = url.pathname
    .split("/")
    .filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, "");
  if (!isGithubName(owner) || !isGithubName(repo)) {
    throw new Error(`Not a GitHub repository URL: ${url.href}`);
  }
  if (marker === "tree" || marker === "blob") {
    const subpath = cleanSubpath(rest);
    return {
      kind: "github",
      owner,
      repo,
      ref: ref ?? null,
      subpath:
        marker === "blob" && subpath?.endsWith("/SKILL.md")
          ? subpath.slice(0, -"/SKILL.md".length)
          : subpath,
    };
  }
  return { kind: "github", owner, repo, ref: null, subpath: null };
}

function expandHome(value: string, home: string, pathApi: path.PlatformPath) {
  if (value === "~") {
    return home;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return pathApi.join(home, value.slice(2));
  }
  return value;
}

function looksLocal(value: string, platform: NodeJS.Platform) {
  if (value.startsWith("~") || value.startsWith(".")) {
    return true;
  }
  if (platform === "win32") {
    return path.win32.isAbsolute(value);
  }
  return path.posix.isAbsolute(value);
}

export function parseSkillSourceInput(
  raw: string,
  options: {
    home?: string;
    cwd?: string;
    platform?: NodeJS.Platform;
  } = {},
): SkillSourceInput {
  const value = raw.trim();
  const platform = options.platform ?? process.platform;
  if (!value) {
    throw new Error("Enter a GitHub repository or a folder path");
  }
  if (looksLocal(value, platform)) {
    const pathApi = platform === "win32" ? path.win32 : path.posix;
    const expanded = expandHome(value, options.home ?? os.homedir(), pathApi);
    return {
      kind: "local",
      path: pathApi.resolve(options.cwd ?? process.cwd(), expanded),
    };
  }
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
      throw new Error(
        "Only GitHub repositories and local folders are supported",
      );
    }
    return parseGithubUrl(url);
  }
  const shorthand = value.replace(/^github:/, "");
  const [ownerRepo, refPart] = shorthand.split("#");
  const [owner, repo, ...rest] = (ownerRepo ?? "").split("/");
  if (!isGithubName(owner) || !isGithubName(repo)) {
    throw new Error(`Unrecognized skill source: ${raw}`);
  }
  return {
    kind: "github",
    owner,
    repo: repo.replace(/\.git$/, ""),
    ref: refPart?.trim() || null,
    subpath: cleanSubpath(rest),
  };
}

export function githubSourceId(input: { owner: string; repo: string }) {
  return `${input.owner}/${input.repo}`;
}

export function githubSourceUrl(input: { owner: string; repo: string }) {
  return `https://github.com/${input.owner}/${input.repo}.git`;
}
