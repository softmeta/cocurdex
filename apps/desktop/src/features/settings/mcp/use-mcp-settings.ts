import type {
  McpConfigFile,
  McpImportCandidate,
  McpServerConfig,
  McpServerScope,
  McpServerStatus,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useRef, useState } from "react";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import { parseServersFromConfigText } from "./mcp-server-form";

export interface McpProjectServers {
  path: string;
  servers: Record<string, McpServerConfig>;
}

export interface McpStatusState {
  byKey: Record<string, McpServerStatus>;
  errors: string[];
  isChecking: boolean;
}

export function mcpStatusKey(scope: McpServerScope, name: string) {
  return `${scope}:${name}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeParseServers(content: string) {
  try {
    return parseServersFromConfigText(content);
  } catch {
    return {};
  }
}

function indexStatuses(servers: McpServerStatus[]) {
  return Object.fromEntries(
    servers.map((server) => [mcpStatusKey(server.scope, server.name), server]),
  );
}

export function useMcpSettings() {
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const workspace = workspaces.find((item) => item.id === activeWorkspaceId);
  const workspaceId = workspace?.id;
  const [configFile, setConfigFile] = useState<McpConfigFile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [project, setProject] = useState<McpProjectServers | null>(null);
  const [status, setStatus] = useState<McpStatusState>({
    byKey: {},
    errors: [],
    isChecking: false,
  });
  const [importCandidates, setImportCandidates] = useState<
    McpImportCandidate[] | null
  >(null);
  const statusRequestRef = useRef(0);

  const servers = configFile ? safeParseServers(configFile.content) : {};

  async function refreshStatus() {
    const request = statusRequestRef.current + 1;
    statusRequestRef.current = request;
    setStatus((current) => ({ ...current, isChecking: true }));
    try {
      const report = await desktopApi.getMcpStatus(workspaceId);
      if (request !== statusRequestRef.current) return;
      setStatus({
        byKey: indexStatuses(report.servers),
        errors: report.errors,
        isChecking: false,
      });
    } catch (error) {
      if (request !== statusRequestRef.current) return;
      setStatus((current) => ({
        ...current,
        errors: [errorMessage(error)],
        isChecking: false,
      }));
    }
  }

  async function refreshServerStatus(name: string) {
    try {
      const report = await desktopApi.getMcpStatus(workspaceId, [name]);
      setStatus((current) => ({
        ...current,
        byKey: { ...current.byKey, ...indexStatuses(report.servers) },
      }));
    } catch {
      return;
    }
  }

  function applyStatus(next: McpServerStatus) {
    setStatus((current) => ({
      ...current,
      byKey: {
        ...current.byKey,
        [mcpStatusKey(next.scope, next.name)]: next,
      },
    }));
  }

  function forgetStatus(name: string) {
    setStatus((current) => {
      const { [mcpStatusKey("global", name)]: _removed, ...byKey } =
        current.byKey;
      return { ...current, byKey };
    });
  }

  async function loadProject() {
    if (!workspaceId) return;
    try {
      const file = await desktopApi.readMcpProjectConfig(workspaceId);
      setProject(
        file.content === null
          ? null
          : { path: file.path, servers: safeParseServers(file.content) },
      );
    } catch {
      setProject(null);
    }
  }

  function applyConfigFile(file: McpConfigFile) {
    setConfigFile(file);
    if (
      importCandidates === null &&
      Object.keys(safeParseServers(file.content)).length === 0
    ) {
      void scanImportCandidates();
    }
  }

  async function scanImportCandidates() {
    try {
      setImportCandidates(await desktopApi.scanMcpImports(workspaceId));
    } catch {
      setImportCandidates([]);
    }
  }

  useMountEffect(() => {
    void desktopApi
      .readMcpConfig()
      .then((file) => {
        setConfigFile(file);
        void refreshStatus();
        if (Object.keys(safeParseServers(file.content)).length === 0) {
          void scanImportCandidates();
        }
      })
      .catch((error: unknown) => setLoadError(errorMessage(error)));
    void loadProject();
    return () => {
      statusRequestRef.current += 1;
    };
  });

  return {
    configFile,
    importCandidates,
    loadError,
    project,
    servers,
    status,
    workspaceId,
    workspaceName: workspace?.name ?? null,
    applyConfigFile,
    applyStatus,
    forgetStatus,
    refreshServerStatus,
    refreshStatus,
  };
}

export type McpSettingsState = ReturnType<typeof useMcpSettings>;
