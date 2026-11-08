const { execFileSync } = require("node:child_process");

function commitCount() {
  try {
    return execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function buildNumber() {
  const raw = process.env.COCURDEX_MOBILE_BUILD_NUMBER ?? commitCount() ?? "1";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Mobile build number must be a positive integer: ${raw}`);
  }
  return value;
}

function appVersion(fallback) {
  const raw = process.env.COCURDEX_MOBILE_VERSION;
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+\.\d+\.\d+$/.test(raw)) {
    throw new Error(`Mobile version must be MAJOR.MINOR.PATCH: ${raw}`);
  }
  return raw;
}

function releaseVersion(version) {
  const raw = process.env.COCURDEX_MOBILE_RELEASE_VERSION;
  if (raw === undefined || raw === "") return version;
  if (raw !== version && !raw.startsWith(`${version}-`)) {
    throw new Error(`Mobile release version ${raw} must extend ${version}`);
  }
  return raw;
}

module.exports = ({ config }) => {
  const build = buildNumber();
  const version = appVersion(config.version);
  return {
    ...config,
    version,
    extra: {
      ...config.extra,
      releaseVersion: releaseVersion(version),
      buildNumber: build,
    },
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
  };
};
