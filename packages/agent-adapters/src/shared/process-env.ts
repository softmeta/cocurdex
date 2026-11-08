const ALLOWED_ENV_PREFIXES = [
  "PI_",
  "GEMINI_",
  "GOOGLE_",
  "CLAUDE_",
  "ANTHROPIC_",
  "OPENAI_",
  "OPENCODE_",
  "CODEX_",
  "CURSOR_",
  "DEVIN_",
  "WINDSURF_",
  "AWS_",
  "AZURE_",
  "VERTEX_",
  "NODE_",
  "NPM_",
  "PYTHON",
  "PIP_",
  "JAVA_",
  "RUST_",
  "GO",
  "CARGO_",
  "DOCKER_",
  "KUBE",
  "PROXY_",
  "GIT_",
  "SSH_",
  "XDG_",
  "LC_",
];

const ALLOWED_ENV_NAMES = new Set([
  "PATH",
  "HOME",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LANGUAGE",
  "TERM",
  "TERMINFO",
  "COLORTERM",
  "TZ",
  "PWD",
  "OLDPWD",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "FTP_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "ftp_proxy",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "USERPROFILE",
]);

export function sanitizeChildProcessEnv(
  env: NodeJS.ProcessEnv,
  options?: {
    blockedEnvPrefixes?: Iterable<string>;
    extraAllowedNames?: Iterable<string>;
  },
): NodeJS.ProcessEnv {
  const allowedNames = new Set([
    ...ALLOWED_ENV_NAMES,
    ...(options?.extraAllowedNames ?? []),
  ]);
  const blockedEnvPrefixes = [...(options?.blockedEnvPrefixes ?? [])];
  const result: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (allowedNames.has(name)) {
      result[name] = value;
      continue;
    }
    if (blockedEnvPrefixes.some((prefix) => name.startsWith(prefix))) {
      continue;
    }
    if (ALLOWED_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      result[name] = value;
    }
  }
  return result;
}

export function buildChildProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    blockedEnvPrefixes?: Iterable<string>;
    extraAllowedNames?: Iterable<string>;
    extraEnv?: NodeJS.ProcessEnv;
  },
): NodeJS.ProcessEnv {
  return {
    ...sanitizeChildProcessEnv(env, options),
    ...options?.extraEnv,
  };
}
