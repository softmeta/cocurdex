const APP_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;
export const LINE_KINDS = ["patch", "minor", "major"];

export function parseAppTag(tag) {
  const match = APP_TAG.exec(tag);
  if (!match) {
    return null;
  }
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  const beta = match[4] === undefined ? null : Number(match[4]);
  return { tag, major, minor, patch, beta };
}

export function compareAppTags(a, b) {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) {
    return core;
  }
  if (a.beta === b.beta) {
    return 0;
  }
  if (a.beta === null) {
    return 1;
  }
  if (b.beta === null) {
    return -1;
  }
  return a.beta - b.beta;
}

export function formatAppTag({ major, minor, patch, beta }) {
  const core = `v${major}.${minor}.${patch}`;
  return beta === null ? core : `${core}-beta.${beta}`;
}

function nextLineCore(latest, kind) {
  if (kind === "major") {
    return { major: latest.major + 1, minor: 0, patch: 0 };
  }
  if (kind === "minor") {
    return { major: latest.major, minor: latest.minor + 1, patch: 0 };
  }
  return { major: latest.major, minor: latest.minor, patch: latest.patch + 1 };
}

export function nextBetaTag(latest, kind) {
  if (latest.beta !== null && kind === "patch") {
    return formatAppTag({ ...latest, beta: latest.beta + 1 });
  }
  if (latest.beta !== null) {
    throw new Error(
      `${latest.tag} opens a beta line; promote it or cut another beta before a ${kind} line`,
    );
  }
  return formatAppTag({ ...nextLineCore(latest, kind), beta: 1 });
}

export function nextStableTag(latest, kind) {
  if (latest.beta !== null) {
    throw new Error(
      `${latest.tag} opens a beta line; run \`promote\` to ship it as stable`,
    );
  }
  return formatAppTag({ ...nextLineCore(latest, kind), beta: null });
}

export function nextServiceTag(prefix, lastTag) {
  const match = lastTag
    ? new RegExp(`^${prefix}(\\d+)\\.(\\d+)\\.(\\d+)$`).exec(lastTag)
    : null;
  if (!match) {
    throw new Error(`Not a ${prefix} tag: ${lastTag}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  return `${prefix}${major}.${minor}.${patch + 1}`;
}
