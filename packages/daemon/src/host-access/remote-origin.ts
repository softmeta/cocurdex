import net from "node:net";

const LOCAL_NAME_SUFFIXES = [".local", ".ts.net"];

export function isAllowedRemoteHostHeader(
  hostHeader: string | undefined,
  machineName: string,
) {
  if (!hostHeader) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare) !== 0) return true;
  if (hostname === machineName.toLowerCase()) return true;
  return LOCAL_NAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function isAllowedRemoteOrigin(
  origin: string | undefined,
  hostHeader: string | undefined,
) {
  if (origin === undefined || origin.length === 0) return true;
  if (!hostHeader) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.host.toLowerCase() === hostHeader.toLowerCase();
}
