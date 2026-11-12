import type { AgentPermissionRequestRecord } from "@cocurdex/shared";

export type PermissionDetail = {
  label: "Command" | "Path" | "Pattern" | "Query" | "URL";
  monospace?: boolean;
  value: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getStringList(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const strings = value.filter(
      (item): item is string => typeof item === "string",
    );
    return strings.length > 0 ? strings.join(", ") : null;
  }

  return null;
}

function getBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function getPermissionInput(permission: AgentPermissionRequestRecord) {
  const rawInput = asObject(permission.rawInput);
  return asObject(rawInput?.input) ?? asObject(permission.rawInput);
}

function describeAccess(permission: AgentPermissionRequestRecord) {
  const access = permission.access;
  if (!access) return null;
  const name = access.path ? getBasename(access.path) : null;
  return {
    operation: access.operation,
    path: access.path,
    subtitle: name ?? permission.description ?? null,
    target: name ?? permission.title,
  };
}

function isDuplicateDetail(
  value: string,
  existingValues: Array<string | null>,
) {
  const normalizedValue = value.trim();
  return existingValues.some(
    (existing) => existing?.trim() === normalizedValue,
  );
}

export function filterDetailsCoveredByText(
  details: PermissionDetail[],
  coverTexts: ReadonlyArray<string | null | undefined>,
) {
  const texts = coverTexts.filter(
    (text): text is string => typeof text === "string" && text.length > 0,
  );
  return details.filter(
    (detail) => !texts.some((text) => text.includes(detail.value.trim())),
  );
}

export function getReadablePermissionDetails({
  displayDescription,
  permission,
  primaryPath,
}: {
  displayDescription: string | null;
  permission: AgentPermissionRequestRecord;
  primaryPath?: string | null;
}) {
  const rawInput = asObject(permission.rawInput);
  const input = getPermissionInput(permission);
  const details: PermissionDetail[] = [];

  if (!input) {
    return details;
  }

  const existingValues = [displayDescription];
  const addDetail = (detail: {
    label: PermissionDetail["label"];
    monospace?: boolean;
    value: string | null;
  }) => {
    if (!detail.value || isDuplicateDetail(detail.value, existingValues)) {
      return;
    }

    details.push({ ...detail, value: detail.value });
    existingValues.push(detail.value);
  };

  addDetail({ label: "Query", value: getString(input.query) });
  addDetail({
    label: "Command",
    monospace: true,
    value: getString(input.command) ?? getString(input.cmd),
  });
  addDetail({
    label: "URL",
    value: getString(input.url) ?? getString(input.uri),
  });
  addDetail({
    label: "Path",
    monospace: true,
    value:
      getString(rawInput?.blockedPath) ??
      getString(input.file_path) ??
      getString(input.filePath) ??
      getString(input.path) ??
      primaryPath ??
      null,
  });
  addDetail({
    label: "Pattern",
    monospace: true,
    value: getStringList(input.pattern),
  });

  return details;
}

export function formatRawInput(rawInput: unknown) {
  if (rawInput === undefined || rawInput === null) {
    return "";
  }

  if (typeof rawInput === "string") {
    return rawInput;
  }

  try {
    return JSON.stringify(rawInput, null, 2);
  } catch {
    return String(rawInput);
  }
}

export type PermissionRequestSummary =
  | { kind: "command" }
  | { kind: "file"; action: "edit" | "read" | "use" | "write"; target: string }
  | { kind: "title"; text: string };

export interface PermissionRequestDisplay {
  summary: PermissionRequestSummary;
  description: string | null;
  details: PermissionDetail[];
  rawInput: string | null;
}

export function describePermissionRequest(
  permission: AgentPermissionRequestRecord,
): PermissionRequestDisplay {
  const access = describeAccess(permission);
  const primaryPath = access?.path ?? permission.locations[0]?.path;
  const sourceDescription = access?.subtitle ?? permission.description ?? null;
  const details = getReadablePermissionDetails({
    displayDescription: sourceDescription,
    permission,
    primaryPath,
  });
  const hasCommand = details.some((detail) => detail.label === "Command");
  let summary: PermissionRequestSummary = {
    kind: "title",
    text: permission.title,
  };
  if (access) {
    summary = {
      kind: "file",
      action: access.operation,
      target: access.target,
    };
  }
  if (hasCommand) {
    summary = { kind: "command" };
  }
  const rawInput = formatRawInput(permission.rawInput);
  const showRawInput =
    rawInput !== "" &&
    details.length === 0 &&
    permission.rawInputVisible !== false;
  return {
    summary,
    description: hasCommand ? null : sourceDescription,
    details,
    rawInput: showRawInput ? rawInput : null,
  };
}
