import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface SensitiveFinding {
  file: string;
  rule: string;
  match: string;
}

const ALLOWED_EMAIL_DOMAINS = [
  "example.invalid",
  "example.com",
  "cocurdex.local",
];

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "posix home path", pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+/g },
  {
    name: "windows home path",
    pattern: /[A-Za-z]:\\+Users\\+[A-Za-z0-9._ -]+/gi,
  },
  { name: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: "openai key", pattern: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: "github token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "slack token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: "aws access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    name: "bearer token",
    pattern: /Bearer\s+(?!e2e-key\b)[A-Za-z0-9._~+/-]{12,}/g,
  },
];

function machineIdentityRules() {
  const values = new Set<string>();
  const { username } = os.userInfo();
  if (username.length >= 3) values.add(username);
  values.add(os.homedir());
  const host = os.hostname().split(".")[0] ?? "";
  if (host.length >= 3) values.add(host);
  return [...values].map((value) => ({ name: "machine identity", value }));
}

function isAllowedEmail(match: string) {
  const domain = match.split("@")[1]?.toLowerCase() ?? "";
  return ALLOWED_EMAIL_DOMAINS.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
  );
}

export function findSensitiveText(file: string, text: string) {
  const findings: SensitiveFinding[] = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (rule.name === "email" && isAllowedEmail(match[0])) continue;
      findings.push({ file, rule: rule.name, match: match[0] });
    }
  }
  const lowered = text.toLowerCase();
  for (const rule of machineIdentityRules()) {
    if (lowered.includes(rule.value.toLowerCase())) {
      findings.push({ file, rule: rule.name, match: rule.value });
    }
  }
  return findings;
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(root, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return nested.flat();
}

export async function scanForSensitiveData(root: string) {
  const files = await listFiles(root);
  const findings = await Promise.all(
    files.map(async (file) => {
      const bytes = await readFile(file);
      const text = [bytes.toString("utf8"), bytes.toString("utf16le")].join(
        "\n",
      );
      return findSensitiveText(path.relative(root, file), text);
    }),
  );
  return findings.flat();
}
