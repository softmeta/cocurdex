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

export function getClaudePermissionDetails(
  permission: AgentPermissionRequestRecord,
) {
  if (permission.providerId !== "claude-agent") {
    return null;
  }

  const rawInput = asObject(permission.rawInput);
  const input = getPermissionInput(permission);
  const path =
    getString(input?.file_path) ??
    getString(input?.filePath) ??
    getString(input?.path) ??
    permission.locations[0]?.path ??
    null;
  const toolName =
    getString(rawInput?.toolName) ??
    getString(input?.toolName) ??
    permission.kind;
  const normalizedToolName = toolName.toLowerCase();
  let action: "edit" | "read" | "use" | "write" = "use";

  if (normalizedToolName.includes("write")) {
    action = "write";
  } else if (normalizedToolName.includes("edit")) {
    action = "edit";
  } else if (normalizedToolName.includes("read")) {
    action = "read";
  }

  return {
    action,
    path,
    subtitle: path ? getBasename(path) : permission.description,
    target: path ? getBasename(path) : permission.title,
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
