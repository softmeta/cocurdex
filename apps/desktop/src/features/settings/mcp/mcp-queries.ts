import useSWR from "swr";
import { desktopApi } from "@/lib";

export const MCP_INJECTION_KEY = "mcp.injection.check";

export function useMcpInjectionQuery() {
  return useSWR(MCP_INJECTION_KEY, () => desktopApi.checkMcpInjection(), {
    dedupingInterval: 0,
  });
}
